import { useState } from 'react'
import { Eye, Play, RotateCw, Square } from 'lucide-react'
import { api } from '@/lib/api'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'
import { nextActions, runFactoryAction, type TaskAction } from './factoryRun'

type Props = {
  task: FactoryTask
  // The screen's own view of "running" (it may know a start before the server says so)
  running?: boolean
  onOpenReview: (task: FactoryTask) => void
  // Called when a run starts and when it ends, so the screen refreshes
  onChanged: () => void
  // Fills the row (a board card) instead of sitting inline (a header)
  block?: boolean
}

// The buttons for what can be done next, from nextActions. Every screen renders this one,
// so a state never offers an action the server refuses, or skips the plan before approving.
export function TaskActions({ task, running, onOpenReview, onChanged, block }: Props) {
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actions = nextActions(task, running || starting || undefined)

  const start = async (action: Extract<TaskAction, { id: 'run' }>) => {
    setStarting(true)
    setError(null)
    try {
      // Resolves when the run ends; progress is followed on the trace and the board
      const outcome = await runFactoryAction(task.id, action.run, { onStarted: onChanged })
      if (outcome.error) setError(outcome.error)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStarting(false)
      onChanged()
    }
  }

  const stop = async () => {
    setStopping(true)
    setError(null)
    try {
      await api.post(`/factory/tasks/${task.id}/cancel`, {})
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStopping(false)
      onChanged()
    }
  }

  const style = block ? { flex: 1, justifyContent: 'center' } : undefined
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        {actions.map((a, i) => {
          if (a.id === 'stop') {
            return (
              <button key={a.id} type="button" className="btn btn-sm btn-danger" style={style} disabled={stopping}
                onClick={e => (e.stopPropagation(), stop())}>
                <Square size={11} fill="currentColor" /> {stopping ? 'Parando...' : a.label}
              </button>
            )
          }
          const primary = i === 0 ? ' btn-primary' : ''
          if (a.id === 'run') {
            return (
              <button key={a.id} type="button" className={`btn btn-sm${primary}`} style={style}
                onClick={e => (e.stopPropagation(), start(a))}>
                {a.run === 'plan' && task.state === 'intake' ? <Play size={13} /> : <RotateCw size={13} />} {a.label}
              </button>
            )
          }
          return (
            <button key={a.id} type="button" className={`btn btn-sm${primary}`} style={style}
              onClick={e => (e.stopPropagation(), onOpenReview(task))}>
              <Eye size={13} /> {a.label}
            </button>
          )
        })}
      </div>
      {error && <span style={{ color: 'var(--crit)', fontSize: 12 }}>{error}</span>}
    </div>
  )
}
