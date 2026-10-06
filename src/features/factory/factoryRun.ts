import './factory.css'
// How the web app starts factory executions and follows their progress.
// Progress has one source: the session the server persists. Every console polls it,
// so a console opened mid-run, reopened, or on another tab shows the same thing.

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import { AGENT_ORDER, RUNNING_STATES, taskUsage, type ExecutionSpan, type FactoryTask, type FactoryTaskState, type SpecializedAgentId } from '../../../server/lib/factory/types.ts'

export type FactoryAction = 'plan' | 'approve-plan' | 'adjust'

export type SessionEvent = {
  type: string
  createdAt?: string
  message?: string
  text?: string
  tool?: string
  id?: string
  input?: unknown
  content?: string
  isError?: boolean
  agentId?: SpecializedAgentId
}

// Name, pipeline role and lane color of each agent, for every place that draws one.
export const AGENT_UI: Record<SpecializedAgentId, { name: string; role: string; color: string }> = {
  analyst: { name: 'Analyst', role: 'Especificação e critérios de aceite', color: 'var(--fx-analyst)' },
  architect: { name: 'Architect', role: 'Planejamento arquitetural', color: 'var(--fx-architect)' },
  implementer: { name: 'Implementer', role: 'Construção e correções', color: 'var(--fx-implementer)' },
  tester: { name: 'Tester', role: 'Testes e cobertura', color: 'var(--fx-tester)' },
  reviewer: { name: 'Reviewer', role: 'Revisão de código e critérios', color: 'var(--fx-reviewer)' },
  security: { name: 'Security', role: 'Auditoria de segurança', color: 'var(--fx-security)' },
  documenter: { name: 'Documenter', role: 'Documentação e descrição do MR', color: 'var(--fx-documenter)' },
}
export { AGENT_ORDER }

// Claude only: judgment (spec, plan, review) on the strong model, typing (build, tests, docs) on the cheap one
export const CLAUDE_SPLIT: Record<SpecializedAgentId, string> = {
  analyst: 'opus', architect: 'opus', reviewer: 'opus', security: 'opus',
  implementer: 'sonnet', tester: 'sonnet', documenter: 'sonnet',
}

export { taskUsage }

// One label and one badge tone per state, for every place that shows a state.
// `review` waits for a person: it is a call to act (signal), not a success.
type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'signal' | 'muted'
export const TASK_STATE: Record<FactoryTaskState, { label: string; tone: Tone }> = {
  intake: { label: 'na entrada', tone: 'muted' },
  planning: { label: 'planejando', tone: 'info' },
  waiting_clarification: { label: 'aguardando respostas', tone: 'signal' },
  waiting_approval: { label: 'aguardando aprovação', tone: 'signal' },
  building: { label: 'construindo', tone: 'info' },
  qa_security: { label: 'QA e segurança', tone: 'info' },
  review: { label: 'aguardando revisão', tone: 'signal' },
  done: { label: 'concluída', tone: 'ok' },
  canceled: { label: 'cancelada', tone: 'muted' },
  error: { label: 'falhou', tone: 'crit' },
}

export const SPAN_STATUS: Record<ExecutionSpan['status'], { label: string; tone: Tone }> = {
  running: { label: 'em execução', tone: 'info' },
  success: { label: 'sucesso', tone: 'ok' },
  failed: { label: 'falhou', tone: 'crit' },
}

export function isTaskRunning(task: FactoryTask): boolean {
  return Boolean(task.executing) || RUNNING_STATES.includes(task.state)
}

// What the developer can do next with a task, decided here for every screen that offers it.
// Approving a plan or answering the Analyst always goes through the drawer, which shows what is
// being approved; nothing else starts a build.
export type TaskAction =
  | { id: 'run'; label: string; run: FactoryAction }
  | { id: 'stop'; label: string }
  | { id: 'open-review'; label: string }

export const retryActionOf = (task: Pick<FactoryTask, 'plan'>): FactoryAction => (task.plan ? 'approve-plan' : 'plan')

export function nextActions(task: FactoryTask, running = isTaskRunning(task)): TaskAction[] {
  if (running) return [{ id: 'stop', label: 'Parar' }]
  switch (task.state) {
    case 'intake': return [{ id: 'run', label: 'Planejar', run: 'plan' }]
    case 'waiting_clarification': return [{ id: 'open-review', label: 'Responder dúvidas' }]
    case 'waiting_approval': return [{ id: 'open-review', label: 'Ler e aprovar o plano' }]
    case 'review': return [{ id: 'open-review', label: 'Revisar entrega' }]
    // With a plan the retry rebuilds it; without one it plans again
    case 'error': return [{ id: 'run', label: 'Tentar de novo', run: retryActionOf(task) }, { id: 'open-review', label: 'Detalhes' }]
    default: return [{ id: 'open-review', label: 'Detalhes' }]
  }
}

// States where the developer is the one holding the task up
export const WAITING_STATES: FactoryTaskState[] = ['waiting_clarification', 'waiting_approval', 'review']

// The step running now, or the last one: what a card shows under "agora"
export function currentSpan(task: FactoryTask): ExecutionSpan | undefined {
  const spans = task.spans ?? []
  return [...spans].reverse().find(s => s.status === 'running') ?? spans[spans.length - 1]
}

export type ActionOutcome = { ok: boolean; cancelled?: boolean; error?: string }

// Starts an action and resolves when the server closes the stream. A refused start
// (409 busy, wrong state) throws. Aborting `signal` only stops watching: the run
// keeps going on the server until an explicit cancel.
export async function runFactoryAction(
  taskId: string,
  action: FactoryAction,
  opts: { body?: unknown; signal?: AbortSignal; onEvent?: (e: SessionEvent) => void; onStarted?: () => void } = {},
): Promise<ActionOutcome> {
  const outcome: ActionOutcome = { ok: false }
  let started = false
  await streamPost<SessionEvent>(
    `/factory/tasks/${taskId}/${action}`,
    e => {
      // The board only polls while it knows a task runs: the first event tells it this one does
      if (!started) {
        started = true
        opts.onStarted?.()
      }
      if (e.type === 'done') outcome.ok = true
      else if (e.type === 'cancelled') outcome.cancelled = true
      else if (e.type === 'error') outcome.error = e.message
      opts.onEvent?.(e)
    },
    opts.signal,
    opts.body,
  )
  return outcome
}

// Streamed text arrives in small deltas: merge one into the previous text event.
export function appendEvent(events: SessionEvent[], e: SessionEvent): SessionEvent[] {
  const last = events[events.length - 1]
  // Same agent only: Reviewer and Security stream at the same time
  if (e.type === 'text' && last?.type === 'text' && last.agentId === e.agentId) {
    return [...events.slice(0, -1), { ...last, text: (last.text ?? '') + (e.text ?? '') }]
  }
  return [...events, e]
}

// Live view of one task. Session events come through the follow stream (snapshot,
// then every new event as it is written, so text shows up as the agent types it);
// the task itself (state, spans, reports) is polled, fast while it runs. Responses
// older than the latest request are dropped. `paused` stops both.
export function useLiveTask(initial: FactoryTask, busy = false) {
  const [task, setTask] = useState(initial)
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [paused, setPaused] = useState(false)
  const seq = useRef(0)

  const refresh = useCallback(async () => {
    const mine = ++seq.current
    const t = await api.get<FactoryTask>(`/factory/tasks/${initial.id}`).catch(() => null)
    if (mine === seq.current && t) setTask(t)
  }, [initial.id])

  const running = busy || isTaskRunning(task)
  // A finished task no longer changes: one read, no polling
  const finished = !running && task.state === 'done'
  useEffect(() => {
    if (paused) return
    refresh()
    if (finished) return
    const timer = setInterval(refresh, running ? 1500 : 8000)
    return () => clearInterval(timer)
  }, [refresh, running, paused, finished])

  useEffect(() => {
    if (paused) return
    // EventSource reconnects on its own; each reconnect starts with a fresh snapshot
    const source = new EventSource(`/api/factory/tasks/${initial.id}/events`)
    source.onmessage = msg => {
      const e = JSON.parse(msg.data) as SessionEvent & { events?: SessionEvent[] }
      if (e.type === 'snapshot') setEvents(e.events ?? [])
      else setEvents(prev => appendEvent(prev, e))
    }
    return () => source.close()
  }, [initial.id, paused])

  return { task, events, running, refresh, paused, setPaused }
}

export function fmtDuration(ms?: number | null): string {
  if (ms == null || isNaN(ms)) return '0.00s'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${(ms / 1000).toFixed(1)}s`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  return `${min}m ${remSec < 10 ? '0' : ''}${remSec}s`
}
