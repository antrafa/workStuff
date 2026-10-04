// Armazenamento local de tarefas e sessões da Fábrica de Software.
// Autoteste: node server/lib/factory/store.ts --selfcheck

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DATA_DIR } from '../paths.ts'
import type { FactoryTask, ExecutionSpan, ToolCallSpan } from './types.ts'

export function createFactoryStore(baseDir: string = join(DATA_DIR, 'factory')) {
  // Fires (taskId, event) after each session append. The write is synchronous, so a
  // listener added in the same tick as a getSession() read misses nothing in between.
  const sessionFeed = new EventEmitter()
  sessionFeed.setMaxListeners(0)
  const tasksFile = join(baseDir, 'tasks.json')
  const sessionsDir = join(baseDir, 'sessions')

  function ensureDirs() {
    mkdirSync(baseDir, { recursive: true })
    mkdirSync(sessionsDir, { recursive: true })
  }

  function readTasks(): FactoryTask[] {
    if (!existsSync(tasksFile)) return []
    try {
      const raw = readFileSync(tasksFile, 'utf-8').trim()
      if (!raw) return []
      return JSON.parse(raw) as FactoryTask[]
    } catch {
      return []
    }
  }

  function writeTasks(tasks: FactoryTask[]) {
    ensureDirs()
    // rename is atomic: a crash mid-write never leaves a truncated tasks.json
    const tmp = `${tasksFile}.tmp`
    writeFileSync(tmp, JSON.stringify(tasks, null, 2), 'utf-8')
    renameSync(tmp, tasksFile)
  }

  // Sessions are JSONL so each streamed event is one append, not a rewrite of the whole file.
  // `.json` is the legacy format (one JSON array), still read for older tasks.
  const sessionFile = (id: string) => join(sessionsDir, `${id}.jsonl`)
  const legacySessionFile = (id: string) => join(sessionsDir, `${id}.json`)

  function readSessionEvents(id: string): any[] {
    const events: any[] = []
    try {
      if (existsSync(legacySessionFile(id))) events.push(...JSON.parse(readFileSync(legacySessionFile(id), 'utf-8')))
    } catch {
      // corrupted legacy file: keep what the JSONL has
    }
    if (!existsSync(sessionFile(id))) return events
    for (const line of readFileSync(sessionFile(id), 'utf-8').split('\n')) {
      if (!line) continue
      try {
        events.push(JSON.parse(line))
      } catch {
        // partial last line from a crash
      }
    }
    return events
  }

  return {
    // Live session events of one task; returns the unsubscribe function
    followSession(taskId: string, onEvent: (event: unknown) => void): () => void {
      const listener = (id: string, event: unknown) => {
        if (id === taskId) onEvent(event)
      }
      sessionFeed.on('event', listener)
      return () => sessionFeed.off('event', listener)
    },

    async getTasks(): Promise<FactoryTask[]> {
      return readTasks()
    },

    async getTask(id: string): Promise<FactoryTask | null> {
      const tasks = readTasks()
      return tasks.find(t => t.id === id) ?? null
    },

    async saveTask(task: FactoryTask): Promise<void> {
      const tasks = readTasks()
      const idx = tasks.findIndex(t => t.id === task.id)
      const updated = { ...task, updatedAt: new Date().toISOString() }
      if (idx >= 0) {
        tasks[idx] = updated
      } else {
        tasks.unshift(updated)
      }
      writeTasks(tasks)
    },

    async deleteTask(id: string): Promise<boolean> {
      const tasks = readTasks()
      const next = tasks.filter(t => t.id !== id)
      if (next.length === tasks.length) return false
      writeTasks(next)
      rmSync(sessionFile(id), { force: true })
      rmSync(legacySessionFile(id), { force: true })
      return true
    },

    async startSpan(
      taskId: string,
      spanData: Omit<ExecutionSpan, 'id' | 'startedAt' | 'status'>,
    ): Promise<string> {
      const tasks = readTasks()
      const task = tasks.find(t => t.id === taskId)
      if (!task) throw new Error(`Tarefa ${taskId} nao encontrada`)

      const spanId = `span-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const newSpan: ExecutionSpan = {
        ...spanData,
        id: spanId,
        startedAt: new Date().toISOString(),
        status: 'running',
        toolCalls: [],
      }

      task.spans = [...(task.spans ?? []), newSpan]
      task.updatedAt = new Date().toISOString()
      writeTasks(tasks)
      return spanId
    },

    async finishSpan(
      taskId: string,
      spanId: string,
      updates: Partial<ExecutionSpan> = {},
    ): Promise<void> {
      const tasks = readTasks()
      const task = tasks.find(t => t.id === taskId)
      if (!task || !task.spans) return

      const span = task.spans.find(s => s.id === spanId)
      if (!span) return

      const finishedAt = updates.finishedAt || new Date().toISOString()
      const durationMs = updates.durationMs ?? (new Date(finishedAt).getTime() - new Date(span.startedAt).getTime())

      Object.assign(span, {
        ...updates,
        finishedAt,
        durationMs,
        status: updates.status || (updates.error ? 'failed' : 'success'),
      })

      task.updatedAt = new Date().toISOString()
      writeTasks(tasks)
    },

    // spanId names the owner: with reviewers running in parallel, "the running span" is ambiguous.
    async recordToolCall(taskId: string, toolCall: ToolCallSpan, spanId?: string): Promise<void> {
      const tasks = readTasks()
      const task = tasks.find(t => t.id === taskId)
      if (!task || !task.spans || task.spans.length === 0) return

      const activeSpan = task.spans.find(s => s.id === spanId) || task.spans.find(s => s.status === 'running') || task.spans[task.spans.length - 1]
      if (!activeSpan) return

      activeSpan.toolCalls = [...(activeSpan.toolCalls ?? []), toolCall]
      task.updatedAt = new Date().toISOString()
      writeTasks(tasks)
    },

    // Pairs a tool-result event with the call recorded at tool start (same id).
    async completeToolCall(taskId: string, id: string, result: { output: string; isError: boolean }): Promise<void> {
      const tasks = readTasks()
      const task = tasks.find(t => t.id === taskId)
      const call = task?.spans?.flatMap(s => s.toolCalls ?? []).findLast(c => c.id === id)
      if (!call) return
      call.output = result.output.slice(0, 4000)
      call.isError = result.isError
      if (call.startedAt) call.durationMs = Date.now() - new Date(call.startedAt).getTime()
      writeTasks(tasks)
    },

    async failRunningSpans(taskId: string, error: string): Promise<void> {
      const tasks = readTasks()
      const task = tasks.find(t => t.id === taskId)
      if (!task?.spans) return
      const now = new Date()
      let changed = false
      for (const span of task.spans) {
        if (span.status !== 'running') continue
        span.status = 'failed'
        span.error = error
        span.finishedAt = now.toISOString()
        span.durationMs = now.getTime() - new Date(span.startedAt).getTime()
        changed = true
      }
      if (changed) writeTasks(tasks)
    },

    async appendSessionEvent(taskId: string, event: unknown): Promise<void> {
      ensureDirs()
      const stamped = { ...(event as object), createdAt: new Date().toISOString() }
      appendFileSync(sessionFile(taskId), JSON.stringify(stamped) + '\n', 'utf-8')
      sessionFeed.emit('event', taskId, stamped)
    },

    // Streamed text arrives in small deltas; merge consecutive ones for display.
    async getSession(taskId: string): Promise<unknown[]> {
      const consolidated: any[] = []
      for (const item of readSessionEvents(taskId)) {
        const last = consolidated[consolidated.length - 1]
        // Same agent only: two reviewers stream at the same time and must not be glued together
        if (item?.type === 'text' && typeof item.text === 'string' && last?.type === 'text' && last.agentId === item.agentId) {
          last.text = (last.text || '') + item.text
          continue
        }
        consolidated.push({ ...item })
      }
      return consolidated
    },
  }
}

// Store padrão singleton usando o DATA_DIR da aplicação
export const defaultFactoryStore = createFactoryStore()

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const tmp = mkdtempSync(join(tmpdir(), 'workstuff-store-test-'))
  try {
    const store = createFactoryStore(tmp)

    // Lista vazia
    assert.deepEqual(await store.getTasks(), [])

    // Criação de tarefa
    const t0: FactoryTask = {
      id: 'task-test-1',
      title: 'Ajuste de Teste',
      description: 'Descricao da tarefa de teste',
      source: { type: 'manual', repoPath: '/tmp/repo' },
      state: 'intake',
      baseBranch: 'main',
      branchName: 'factory/task-test-1',
      provider: 'claude',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await store.saveTask(t0)

    const tasks = await store.getTasks()
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].id, 'task-test-1')
    assert.equal(tasks[0].title, 'Ajuste de Teste')

    // Spans de execução
    const spanId = await store.startSpan('task-test-1', {
      name: 'Planejamento Arquitetural',
      phase: 'planning',
      kind: 'agent',
      agentId: 'architect',
    })
    assert.ok(spanId.startsWith('span-'))

    await store.recordToolCall('task-test-1', {
      id: 'tc1',
      tool: 'Read',
      input: { file: 'package.json' },
      startedAt: new Date().toISOString(),
    })
    await store.completeToolCall('task-test-1', 'tc1', { output: '{}', isError: true })

    await store.finishSpan('task-test-1', spanId, { status: 'success' })
    const withSpan = await store.getTask('task-test-1')
    assert.equal(withSpan?.spans?.length, 1)
    assert.equal(withSpan?.spans?.[0].status, 'success')
    assert.equal(withSpan?.spans?.[0].toolCalls?.length, 1)
    assert.equal(withSpan?.spans?.[0].toolCalls?.[0].isError, true, 'resultado da ferramenta registrado')

    // Atualização de tarefa
    await store.saveTask({ ...t0, state: 'planning', plan: 'Passo 1: Criar arquivo' })
    const tUpdated = await store.getTask('task-test-1')
    assert.ok(tUpdated)
    assert.equal(tUpdated.state, 'planning')
    assert.equal(tUpdated.plan, 'Passo 1: Criar arquivo')

    // Sessão de eventos
    assert.deepEqual(await store.getSession('task-test-1'), [])
    const followed: unknown[] = []
    const unfollow = store.followSession('task-test-1', e => followed.push(e))
    await store.appendSessionEvent('task-test-1', { type: 'thinking', text: 'Analisando codigo...' })
    await store.appendSessionEvent('task-test-1', { type: 'text', text: 'Plano ' })
    await store.appendSessionEvent('task-test-1', { type: 'text', text: 'gerado.' })
    const session = await store.getSession('task-test-1') as any[]
    assert.equal(session.length, 2)
    assert.equal(session[1].text, 'Plano gerado.', 'deltas de texto consecutivos agrupados')
    assert.equal(followed.length, 3, 'cada evento gravado chega a quem acompanha')
    unfollow()
    await store.appendSessionEvent('task-test-1', { type: 'status', message: 'x' })
    assert.equal(followed.length, 3, 'depois de sair, não recebe mais')

    // Deleção
    assert.equal(await store.deleteTask('task-test-1'), true)
    assert.equal(await store.deleteTask('task-test-1'), false)
    assert.deepEqual(await store.getTasks(), [])
    assert.deepEqual(await store.getSession('task-test-1'), [])

    console.log('factory store selfcheck: ok')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
