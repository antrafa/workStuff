import { AlertTriangle, CheckCircle2, GitBranch, Hourglass, Lightbulb, ShieldAlert, AlertCircle } from 'lucide-react'
import { pendingDependencies, type FactoryTask, type FactoryTaskState } from '../../../server/lib/factory/types.ts'
import { AGENT_ORDER, AGENT_UI, currentSpan, fmtDuration, isTaskRunning, taskUsage } from './factoryRun'
import { FactoryStatusChip } from './timeline/FactoryStatusChip'
import { TaskActions } from './TaskActions'
import { tx } from '@/lib/i18n'

type Props = {
  tasks: FactoryTask[]
  // A card opens the task's trace: lanes per agent and the live activity feed
  onOpenTrace: (task: FactoryTask) => void
  onOpenReview: (task: FactoryTask) => void
  onUpdate: () => void
}

type ColumnId = 'intake' | 'planning' | 'building' | 'review' | 'done'

// Exhaustive on purpose: a new state that is not placed here fails the typecheck
// instead of silently vanishing from the board.
const COLUMN_OF: Record<FactoryTaskState, ColumnId> = {
  intake: 'intake',
  planning: 'planning',
  waiting_clarification: 'planning',
  waiting_approval: 'planning',
  error: 'planning',
  building: 'building',
  qa_security: 'building',
  review: 'review',
  done: 'done',
  canceled: 'done',
}

const COLUMNS: Array<{ id: ColumnId; title: string; color: string }> = [
  { id: 'intake', title: tx({ en: 'Intake', pt: 'Entrada' }), color: 'var(--muted)' },
  { id: 'planning', title: tx({ en: 'Planning', pt: 'Planejamento' }), color: 'var(--fx-architect)' },
  { id: 'building', title: tx({ en: 'Build and QA', pt: 'Construção e QA' }), color: 'var(--fx-implementer)' },
  { id: 'review', title: tx({ en: 'Review', pt: 'Revisão' }), color: 'var(--fx-reviewer)' },
  { id: 'done', title: tx({ en: 'Done', pt: 'Concluído' }), color: 'var(--ok)' },
]

export function FactoryBoard({ tasks, onOpenTrace, onOpenReview, onUpdate }: Props) {
  const columnOf = (t: FactoryTask): ColumnId =>
    // A failed build has a worktree: it fails where it was, not back in planning
    t.state === 'error' && t.worktreePath ? 'building' : COLUMN_OF[t.state]
  const columns = COLUMNS.map(c => {
    const items = tasks.filter(t => columnOf(t) === c.id)
    return { ...c, items, badge: items.length }
  })

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      {/* Explicit horizontal scroll so the columns are never cut off */}
      <div
        style={{
          width: '100%',
          overflowX: 'auto',
          paddingBottom: 16,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(280px, 1fr))',
            gap: 16,
            minWidth: 1440,
          }}
        >
          {columns.map(col => (
            <div
              key={col.id}
              className="stack"
              style={{
                background: 'var(--surface-3)',
                borderRadius: 'var(--r-lg)',
                padding: 14,
                minHeight: 520,
                border: '1px solid var(--line)',
              }}
            >
              {/* Column header */}
              <div
                className="row"
                style={{
                  justifyContent: 'space-between',
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--line)',
                  alignItems: 'center',
                }}
              >
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: col.color,
                      display: 'inline-block',
                    }}
                  />
                  <span className="eyebrow" style={{ color: col.color, fontSize: 13, fontWeight: 700 }}>
                    {col.title}
                  </span>
                </div>
                <span className="badge" style={{ fontSize: 11, fontWeight: 600 }}>
                  {col.badge}
                </span>
              </div>

              {/* Column cards */}
              <div className="stack" style={{ gap: 12, marginTop: 8 }}>
                {col.items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 8px', color: 'var(--muted)', fontSize: 12 }}>
                    {tx({ en: 'No task', pt: 'Nenhuma tarefa' })}
                  </div>
                ) : (
                  col.items.map(task => (
                    <TaskCard key={task.id} task={task} waitingOn={pendingDependencies(task, tasks)} onOpenTrace={onOpenTrace} onOpenReview={onOpenReview} onUpdate={onUpdate} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// Agent by agent: not run yet, running, done or failed, from the spans of its last run
function AgentProgress({ task }: { task: FactoryTask }) {
  const spans = task.spans ?? []
  return (
    <div className="row" style={{ gap: 4 }} aria-label={tx({ en: 'Progress by agent', pt: 'Progresso por agente' })}>
      {AGENT_ORDER.map(id => {
        const last = [...spans].reverse().find(s => s.agentId === id)
        const color = AGENT_UI[id].color
        const status = last?.status
        return (
          <span
            key={id}
            title={`${AGENT_UI[id].name}: ${status === 'running' ? tx({ en: 'working', pt: 'trabalhando' }) : status === 'success' ? tx({ en: 'done', pt: 'concluído' }) : status === 'failed' ? tx({ en: 'failed', pt: 'falhou' }) : tx({ en: 'not run yet', pt: 'ainda não rodou' })}`}
            className={status === 'running' ? 'live-dot' : undefined}
            style={{
              width: 9, height: 9, borderRadius: '50%', display: 'inline-block',
              background: status === 'failed' ? 'var(--crit)' : status ? color : 'transparent',
              border: `1.5px solid ${status === 'failed' ? 'var(--crit)' : color}`,
              opacity: status ? 1 : 0.45,
            }}
          />
        )
      })}
    </div>
  )
}

// What is happening now (or what happened last): the step, who runs it and for how long
function NowLine({ task, running }: { task: FactoryTask; running: boolean }) {
  const span = currentSpan(task)
  if (!span) return null
  const who = span.agentId ? AGENT_UI[span.agentId].name : span.kind === 'gate' ? tx({ en: 'Gate', pt: 'Portão' }) : tx({ en: 'Pipeline', pt: 'Esteira' })
  const elapsed = span.durationMs ?? (span.finishedAt ? new Date(span.finishedAt).getTime() : Date.now()) - new Date(span.startedAt).getTime()
  const tools = span.toolCalls?.length ?? 0
  return (
    <div className="row" style={{ gap: 6, fontSize: 11, color: 'var(--muted)', minWidth: 0, flexWrap: 'nowrap' }}>
      {running && span.status === 'running' && <span className="live-dot" />}
      <b style={{ color: span.agentId ? AGENT_UI[span.agentId].color : 'var(--ink-2)', flexShrink: 0 }}>{who}</b>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={span.name}>{span.name}</span>
      <span className="mono" style={{ flexShrink: 0 }}>· {fmtDuration(elapsed)}{tools ? tx({ en: ` · ${tools} tools`, pt: ` · ${tools} ferr.` }) : ''}</span>
    </div>
  )
}

function TaskCard({ task, waitingOn, onOpenTrace, onOpenReview, onUpdate }: { task: FactoryTask; waitingOn: FactoryTask[] } & Omit<Props, 'tasks'>) {
  const running = isTaskRunning(task)
  const failed = task.state === 'error'
  const waiting = task.state === 'waiting_approval' || task.state === 'waiting_clarification' || task.state === 'review'
  const usage = taskUsage(task)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={tx({ en: `Open the timeline of ${task.title}`, pt: `Abrir a linha do tempo de ${task.title}` })}
      className="card card-pad stack factory-card"
      style={{
        cursor: 'pointer', padding: 14, gap: 10,
        borderColor: failed ? 'var(--crit)' : waiting ? 'var(--signal)' : running ? 'var(--info)' : undefined,
        background: running ? 'var(--info-soft)' : undefined,
      }}
      onClick={() => onOpenTrace(task)}
      onKeyDown={e => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        onOpenTrace(task)
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <FactoryStatusChip state={task.state} executing={task.executing} />
        <div className="row mono" style={{ gap: 8, fontSize: 11 }}>
          {task.diffStat && <span style={{ color: 'var(--ok)' }}>+{task.diffStat.insertions}/-{task.diffStat.deletions}</span>}
          {usage.costUsd !== null && <span style={{ color: 'var(--muted)' }} title={tx({ en: 'Cost summed over the agents', pt: 'Custo somado dos agentes' })}>US$ {usage.costUsd.toFixed(2)}</span>}
        </div>
      </div>

      <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35, color: 'var(--ink)' }}>{task.title}</div>

      {(task.origin || waitingOn.length > 0) && (
        <div className="row" style={{ gap: 6, fontSize: 11, flexWrap: 'wrap' }}>
          {task.origin && <span className="badge" title={tx({ en: 'Came from an idea of the project', pt: 'Veio de uma ideia do projeto' })}><Lightbulb size={11} /> {task.origin.taskKey}</span>}
          {waitingOn.length > 0 && (
            <span className="badge badge-warn" title={tx({ en: 'Planning starts once these are done', pt: 'O planejamento começa quando estas estiverem concluídas' })}>
              <Hourglass size={11} /> {tx({ en: 'waits for', pt: 'aguarda' })} {waitingOn.map(t => t.origin?.taskKey ?? t.title).join(', ')}
            </span>
          )}
        </div>
      )}

      <AgentProgress task={task} />
      <NowLine task={task} running={running} />

      <div className="row" style={{ fontSize: 11, color: 'var(--muted)', gap: 6, alignItems: 'center' }}>
        <GitBranch size={12} style={{ flexShrink: 0 }} />
        <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.branchName}>{task.branchName}</span>
      </div>

      {task.state === 'review' && (
        <div className="row" style={{ gap: 6, fontSize: 11 }}>
          {task.qaReport?.passed
            ? <span className="row" style={{ color: 'var(--ok)', gap: 3 }}><CheckCircle2 size={12} /> {tx({ en: 'QA ok', pt: 'QA ok' })}</span>
            : <span className="row" style={{ color: 'var(--warn)', gap: 3 }}><AlertCircle size={12} /> {tx({ en: 'QA pending', pt: 'QA pendente' })}</span>}
          <span>·</span>
          {task.securityReport?.passed
            ? <span className="row" style={{ color: 'var(--ok)', gap: 3 }}><CheckCircle2 size={12} /> {tx({ en: 'Review ok', pt: 'Revisão ok' })}</span>
            : <span className="row" style={{ color: 'var(--warn)', gap: 3 }}><ShieldAlert size={12} /> {tx({ en: 'Findings', pt: 'Achados' })}</span>}
        </div>
      )}

      {task.error && (
        <div className="row" style={{ gap: 6, color: failed ? 'var(--crit)' : 'var(--warn)', fontSize: 11 }} title={task.error}>
          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.error}</span>
        </div>
      )}

      <TaskActions task={task} running={running} onOpenReview={onOpenReview} onChanged={onUpdate} block />
    </div>
  )
}
