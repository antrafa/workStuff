// Armazenamento local de tarefas e sessões da Fábrica de Software.
// Autoteste: node server/lib/factory/store.ts --selfcheck

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DATA_DIR } from '../paths.ts'
import type { FactoryTask, ExecutionSpan, ToolCallSpan } from './types.ts'

export function createFactoryStore(baseDir: string = join(DATA_DIR, 'factory')) {
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
    const tmp = `${tasksFile}.tmp.${Date.now()}`
    writeFileSync(tmp, JSON.stringify(tasks, null, 2), 'utf-8')
    writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf-8')
    if (existsSync(tmp)) rmSync(tmp, { force: true })
  }

  return {
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
      const sessionFile = join(sessionsDir, `${id}.json`)
      if (existsSync(sessionFile)) {
        try {
          rmSync(sessionFile, { force: true })
        } catch {
          // ignora
        }
      }
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

    async recordToolCall(taskId: string, toolCall: ToolCallSpan): Promise<void> {
      const tasks = readTasks()
      const task = tasks.find(t => t.id === taskId)
      if (!task || !task.spans || task.spans.length === 0) return

      // Encontra a span ativa ou a última span
      const activeSpan = task.spans.find(s => s.status === 'running') || task.spans[task.spans.length - 1]
      if (!activeSpan) return

      activeSpan.toolCalls = [...(activeSpan.toolCalls ?? []), toolCall]
      task.updatedAt = new Date().toISOString()
      writeTasks(tasks)
    },

    async appendSessionEvent(taskId: string, event: unknown): Promise<void> {
      ensureDirs()
      const file = join(sessionsDir, `${taskId}.json`)
      let events: unknown[] = []
      if (existsSync(file)) {
        try {
          events = JSON.parse(readFileSync(file, 'utf-8'))
        } catch {
          events = []
        }
      }
      events.push(event)
      writeFileSync(file, JSON.stringify(events, null, 2), 'utf-8')
    },

    async getSession(taskId: string): Promise<unknown[]> {
      const file = join(sessionsDir, `${taskId}.json`)
      if (!existsSync(file)) return []
      try {
        return JSON.parse(readFileSync(file, 'utf-8'))
      } catch {
        return []
      }
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
      tool: 'Read',
      input: { file: 'package.json' },
      isError: false,
    })

    await store.finishSpan('task-test-1', spanId, { status: 'success' })
    const withSpan = await store.getTask('task-test-1')
    assert.equal(withSpan?.spans?.length, 1)
    assert.equal(withSpan?.spans?.[0].status, 'success')
    assert.equal(withSpan?.spans?.[0].toolCalls?.length, 1)

    // Atualização de tarefa
    await store.saveTask({ ...t0, state: 'planning', plan: 'Passo 1: Criar arquivo' })
    const tUpdated = await store.getTask('task-test-1')
    assert.ok(tUpdated)
    assert.equal(tUpdated.state, 'planning')
    assert.equal(tUpdated.plan, 'Passo 1: Criar arquivo')

    // Sessão de eventos
    assert.deepEqual(await store.getSession('task-test-1'), [])
    await store.appendSessionEvent('task-test-1', { type: 'thinking', text: 'Analisando codigo...' })
    await store.appendSessionEvent('task-test-1', { type: 'text', text: 'Plano gerado.' })
    const session = await store.getSession('task-test-1')
    assert.equal(session.length, 2)

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
