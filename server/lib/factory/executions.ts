// Registry of factory executions running in this server process.
// The pipeline lifetime is owned here, not by the HTTP/SSE connection:
// closing the browser tab no longer interrupts a run, and the only way
// to stop one is an explicit cancel.

import assert from 'node:assert/strict'
import type { FactoryTask, FactoryTaskState } from './types.ts'
import { say } from '../i18n.ts'

export { RUNNING_STATES } from './types.ts'

// 'finish' is not cancellable: it is registered so a double click cannot merge or push twice
export type ExecutionKind = 'plan' | 'build' | 'adjust' | 'finish'

type Execution = {
  kind: ExecutionKind
  controller: AbortController
  startedAt: number
}

const running = new Map<string, Execution>()


export class ExecutionCancelledError extends Error {
  constructor() {
    super(say({ en: 'Run stopped by the user.', pt: 'Execução interrompida pelo usuário.' }))
    this.name = 'ExecutionCancelledError'
  }
}

export class ExecutionBusyError extends Error {
  constructor() {
    super(say({ en: 'This task already has a run in progress. Stop it before starting another.', pt: 'Já existe uma execução em andamento para esta tarefa. Pare a execução atual antes de iniciar outra.' }))
    this.name = 'ExecutionBusyError'
  }
}

export function beginExecution(taskId: string, kind: ExecutionKind): AbortSignal {
  if (running.has(taskId)) throw new ExecutionBusyError()
  const controller = new AbortController()
  running.set(taskId, { kind, controller, startedAt: Date.now() })
  return controller.signal
}

export function endExecution(taskId: string, signal: AbortSignal): void {
  // Only remove the entry owned by this signal (guards against a late finally
  // from an old run clearing a newer one).
  const current = running.get(taskId)
  if (current && current.controller.signal === signal) running.delete(taskId)
}

export function cancelExecution(taskId: string): boolean {
  const current = running.get(taskId)
  if (!current) return false
  current.controller.abort()
  return true
}

export function getExecution(taskId: string): { kind: ExecutionKind; startedAt: number } | null {
  const current = running.get(taskId)
  return current ? { kind: current.kind, startedAt: current.startedAt } : null
}

export function isExecuting(taskId: string): boolean {
  return running.has(taskId)
}

// Resolves true once the task has no running execution, false on timeout.
export async function waitForIdle(taskId: string, timeoutMs = 8000): Promise<boolean> {
  const t0 = Date.now()
  while (running.has(taskId)) {
    if (Date.now() - t0 > timeoutMs) return false
    await new Promise(r => setTimeout(r, 100))
  }
  return true
}

export function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new ExecutionCancelledError()
}

// State to return to after a stop, so the user can resume from the last
// human checkpoint instead of landing in a dead end.
// A stopped re-plan keeps the plan it was replacing: it can still be approved.
export function stateAfterCancel(kind: ExecutionKind, task?: Pick<FactoryTask, 'plan'>): FactoryTaskState {
  if (kind === 'plan') return task?.plan ? 'waiting_approval' : 'intake'
  if (kind === 'build') return 'waiting_approval'
  return 'review'
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const s1 = beginExecution('t1', 'build')
  assert.ok(isExecuting('t1'))
  assert.throws(() => beginExecution('t1', 'plan'), ExecutionBusyError)

  assert.equal(cancelExecution('t1'), true)
  assert.ok(s1.aborted)
  assert.throws(() => throwIfCancelled(s1), ExecutionCancelledError)

  endExecution('t1', s1)
  assert.ok(!isExecuting('t1'))
  assert.equal(cancelExecution('t1'), false, 'nothing to cancel')

  // A stale finally must not clear a newer execution
  const s2 = beginExecution('t1', 'plan')
  endExecution('t1', s1)
  assert.ok(isExecuting('t1'), 'newer execution survives stale cleanup')
  endExecution('t1', s2)

  assert.equal(stateAfterCancel('plan'), 'intake')
  assert.equal(stateAfterCancel('plan', { plan: 'p' }), 'waiting_approval', 'replanejamento parado mantém o plano')
  assert.equal(stateAfterCancel('build'), 'waiting_approval')
  assert.equal(stateAfterCancel('adjust'), 'review')

  console.log('factory executions selfcheck: ok')
}
