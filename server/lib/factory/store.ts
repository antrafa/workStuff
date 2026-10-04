// Armazenamento local de tarefas e sessões da Fábrica de Software.
// Autoteste: node server/lib/factory/store.ts --selfcheck

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DATA_DIR } from '../paths.ts'
import type { FactoryTask } from './types.ts'

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
