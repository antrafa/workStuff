import { useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  GitBranch,
  Play,
  RotateCw,
  ShieldAlert,
  Square,
  Terminal,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { FactoryTask, FactoryTaskState } from '../../../server/lib/factory/types.ts'
import { FactoryLiveConsole } from './FactoryLiveConsole'
import { isTaskRunning } from './factoryRun'
import { FactoryStatusChip } from './timeline/FactoryStatusChip'

type Props = {
  tasks: FactoryTask[]
  onSelectTask: (task: FactoryTask) => void
  onUpdate: () => void
  onOpenTrace?: (task: FactoryTask) => void
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
  { id: 'intake', title: 'Entrada', color: 'var(--muted)' },
  { id: 'planning', title: 'Planejamento', color: 'var(--fx-architect)' },
  { id: 'building', title: 'Construção e QA', color: 'var(--fx-implementer)' },
  { id: 'review', title: 'Revisão', color: 'var(--fx-reviewer)' },
  { id: 'done', title: 'Concluído', color: 'var(--ok)' },
]

export function FactoryBoard({ tasks, onSelectTask, onUpdate, onOpenTrace }: Props) {
  const [consoleTask, setConsoleTask] = useState<FactoryTask | null>(null)
  const [consoleAction, setConsoleAction] = useState<'plan' | 'approve-plan' | null>(null)
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null)

  const handleOpenConsole = (task: FactoryTask, action: 'plan' | 'approve-plan' | null = null, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setConsoleTask(task)
    setConsoleAction(action)
  }

  const handleStopTask = async (task: FactoryTask, e: React.MouseEvent) => {
    e.stopPropagation()
    if (stoppingTaskId === task.id) return
    setStoppingTaskId(task.id)
    try {
      await api.post(`/factory/tasks/${task.id}/cancel`, {})
      onUpdate()
    } catch (err) {
      console.error('Falha ao parar tarefa:', err)
    } finally {
      setStoppingTaskId(null)
    }
  }

  const columnOf = (t: FactoryTask): ColumnId =>
    // A failed build has a worktree: it fails where it was, not back in planning
    t.state === 'error' && t.worktreePath ? 'building' : COLUMN_OF[t.state]
  const columns = COLUMNS.map(c => {
    const items = tasks.filter(t => columnOf(t) === c.id)
    return { ...c, items, badge: items.length }
  })

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      {/* Container com rolagem horizontal explícita para evitar que as colunas sejam cortadas */}
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
              {/* Cabeçalho da Coluna */}
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

              {/* Cards da Coluna */}
              <div className="stack" style={{ gap: 12, marginTop: 8 }}>
                {col.items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 8px', color: 'var(--muted)', fontSize: 12 }}>
                    Nenhuma tarefa
                  </div>
                ) : (
                  col.items.map(task => {
                    const isRunning = isTaskRunning(task)
                    const hasError = task.state === 'error' || Boolean(task.error)
                    const isWaitingApproval = task.state === 'waiting_approval'

                    return (
                      <div
                        key={task.id}
                        className="card card-pad stack factory-card"
                        style={{
                          cursor: 'pointer',
                          padding: 14,
                          gap: 10,
                          borderColor: hasError
                            ? 'var(--crit)'
                            : isWaitingApproval
                            ? 'var(--signal)'
                            : isRunning
                            ? 'var(--info)'
                            : undefined,
                          background: isRunning ? 'var(--info-soft)' : undefined,
                        }}
                        onClick={() => onSelectTask(task)}
                      >
                        {/* Topo do Card: Badge de Estado + Botão de Logs */}
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                          <FactoryStatusChip state={task.state} executing={task.executing} />

                          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                            {task.diffStat && (
                              <span className="mono" style={{ fontSize: 11, color: 'var(--ok)' }}>
                                +{task.diffStat.insertions}/-{task.diffStat.deletions}
                              </span>
                            )}

                            {/* Botão de Console / Logs Interativo */}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{
                                padding: '2px 6px',
                                height: 22,
                                fontSize: 11,
                                gap: 4,
                                color: isRunning ? 'var(--info)' : 'var(--muted)',
                              }}
                              onClick={e => handleOpenConsole(task, null, e)}
                              title="Abrir console e acompanhar logs em tempo real"
                            >
                              <Terminal size={12} /> Logs
                            </button>
                          </div>
                        </div>

                        {/* Título da Tarefa */}
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35, color: 'var(--ink)' }}>
                          {task.title}
                        </div>

                        {/* Linha da Branch e Worktree */}
                        <div className="row" style={{ fontSize: 11, color: 'var(--muted)', gap: 6, alignItems: 'center' }}>
                          <GitBranch size={12} style={{ flexShrink: 0 }} />
                          <span
                            className="mono"
                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={task.branchName}
                          >
                            {task.branchName}
                          </span>
                        </div>

                        {/* Botões de Ação Rápida e Feedback Visual */}
                        <div style={{ paddingTop: 4 }}>
                          {task.state === 'intake' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                              onClick={e => handleOpenConsole(task, 'plan', e)}
                            >
                              <Play size={13} /> Iniciar Planejamento
                            </button>
                          )}

                          {task.state === 'waiting_clarification' && (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                              onClick={e => (e.stopPropagation(), onSelectTask(task))}
                            >
                              <FileText size={13} /> Responder Dúvidas do Analyst
                            </button>
                          )}

                          {task.state === 'waiting_approval' && (
                            <div className="stack" style={{ gap: 6 }}>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                                onClick={e => handleOpenConsole(task, 'approve-plan', e)}
                              >
                                <Play size={13} /> Aprovar e Construir
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{ width: '100%', justifyContent: 'center', gap: 6, fontSize: 11 }}
                                onClick={e => {
                                  e.stopPropagation()
                                  onSelectTask(task)
                                }}
                              >
                                <FileText size={12} /> Ver Plano Técnico
                              </button>
                            </div>
                          )}

                          {isRunning && (
                            <div className="row" style={{ gap: 6 }}>
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{
                                  flex: 1,
                                  justifyContent: 'center',
                                  gap: 6,
                                  borderColor: 'var(--info)',
                                  color: 'var(--info)',
                                }}
                                onClick={e => handleOpenConsole(task, null, e)}
                              >
                                <Activity size={13} className="spin" />
                                Acompanhar
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                style={{ padding: '0 10px', gap: 4 }}
                                title="Interromper execução da tarefa"
                                onClick={e => handleStopTask(task, e)}
                                disabled={stoppingTaskId === task.id}
                              >
                                <Square size={11} fill="currentColor" />
                                {stoppingTaskId === task.id ? 'Parando...' : 'Parar'}
                              </button>
                            </div>
                          )}

                          {task.state === 'review' && (
                            <div className="stack" style={{ gap: 6 }}>
                              <div className="row" style={{ gap: 6, fontSize: 11 }}>
                                {task.qaReport?.passed ? (
                                  <span className="row" style={{ color: 'var(--ok)', gap: 3 }}>
                                    <CheckCircle2 size={12} /> QA ok
                                  </span>
                                ) : (
                                  <span className="row" style={{ color: 'var(--warn)', gap: 3 }}>
                                    <AlertCircle size={12} /> QA pendente
                                  </span>
                                )}
                                <span>·</span>
                                {task.securityReport?.passed ? (
                                  <span className="row" style={{ color: 'var(--ok)', gap: 3 }}>
                                    <CheckCircle2 size={12} /> Seguro
                                  </span>
                                ) : (
                                  <span className="row" style={{ color: 'var(--warn)', gap: 3 }}>
                                    <ShieldAlert size={12} /> Alertas
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                                onClick={e => {
                                  e.stopPropagation()
                                  onSelectTask(task)
                                }}
                              >
                                <FileText size={12} /> Revisar Código
                              </button>
                            </div>
                          )}

                          {hasError && (
                            <div className="stack" style={{ gap: 6 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  color: 'var(--crit)',
                                  fontSize: 11,
                                }}
                              >
                                <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {task.error || 'Erro na execução'}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                                onClick={e => handleOpenConsole(task, null, e)}
                              >
                                <RotateCw size={12} /> Ver Logs e Tentar Novamente
                              </button>
                            </div>
                          )}

                          {task.state === 'done' && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ width: '100%', justifyContent: 'center', gap: 6, color: 'var(--ok)' }}
                              onClick={e => {
                                e.stopPropagation()
                                onSelectTask(task)
                              }}
                            >
                              <CheckCircle2 size={12} /> Concluída (Ver Detalhes)
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Interativo do Console com Logs em Tempo Real */}
      {consoleTask && (
        <FactoryLiveConsole
          task={consoleTask}
          initialAction={consoleAction}
          onClose={() => {
            setConsoleTask(null)
            setConsoleAction(null)
          }}
          onUpdate={onUpdate}
          onOpenTrace={onOpenTrace}
          onOpenReview={onSelectTask}
        />
      )}
    </div>
  )
}
