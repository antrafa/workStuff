import { useState } from 'react'
import {
  AlertCircle, CheckCircle2, GitBranch,
  Play, ShieldAlert, Sparkles
} from 'lucide-react'
import { streamPost } from '@/lib/stream'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'

type Props = {
  tasks: FactoryTask[]
  onSelectTask: (task: FactoryTask) => void
  onUpdate: () => void
}

export function FactoryBoard({ tasks, onSelectTask, onUpdate }: Props) {
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)

  const handleStartPlan = async (task: FactoryTask, e: React.MouseEvent) => {
    e.stopPropagation()
    setRunningTaskId(task.id)
    try {
      await streamPost(
        `/factory/tasks/${task.id}/plan`,
        (ev: any) => {
          if (ev.type === 'done') {
            onUpdate()
          }
        }
      )
    } finally {
      setRunningTaskId(null)
      onUpdate()
    }
  }

  // Filtragem por colunas
  const intakeTasks = tasks.filter(t => t.state === 'intake')
  const planningTasks = tasks.filter(t => t.state === 'planning' || t.state === 'waiting_approval' || (t.state === 'error' && !t.plan))
  const buildingTasks = tasks.filter(t => t.state === 'building' || t.state === 'qa_security')
  const reviewTasks = tasks.filter(t => t.state === 'review' || (t.state === 'error' && t.plan))
  const doneTasks = tasks.filter(t => t.state === 'done')

  const columns = [
    { title: 'Entrada', badge: intakeTasks.length, items: intakeTasks, color: 'var(--muted)' },
    { title: 'Planejamento', badge: planningTasks.length, items: planningTasks, color: 'var(--accent)' },
    { title: 'Construção & QA', badge: buildingTasks.length, items: buildingTasks, color: 'var(--yellow, #eab308)' },
    { title: 'Revisão', badge: reviewTasks.length, items: reviewTasks, color: 'var(--purple, #a855f7)' },
    { title: 'Concluído', badge: doneTasks.length, items: doneTasks, color: 'var(--green, #22c55e)' },
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(260px, 1fr))',
        gap: 16,
        overflowX: 'auto',
        paddingBottom: 16,
      }}
    >
      {columns.map(col => (
        <div
          key={col.title}
          className="stack"
          style={{
            background: 'var(--surface-active, rgba(255,255,255,0.02))',
            borderRadius: 'var(--r-lg, 12px)',
            padding: 12,
            minHeight: 480,
          }}
        >
          {/* Cabeçalho da Coluna */}
          <div className="row" style={{ justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
            <span className="eyebrow" style={{ color: col.color, fontSize: 12 }}>
              {col.title}
            </span>
            <span className="badge" style={{ fontSize: 11 }}>
              {col.badge}
            </span>
          </div>

          {/* Cards da Coluna */}
          <div className="stack" style={{ gap: 10, marginTop: 4 }}>
            {col.items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 8px', color: 'var(--muted)', fontSize: 12 }}>
                Nenhuma tarefa
              </div>
            ) : (
              col.items.map(task => {
                const isRunning = runningTaskId === task.id
                return (
                  <div
                    key={task.id}
                    className="card card-pad stack"
                    style={{
                      cursor: 'pointer',
                      padding: 12,
                      transition: 'transform 0.15s, border-color 0.15s',
                      borderColor: task.state === 'error' || task.error ? 'var(--red)' : task.state === 'waiting_approval' ? 'var(--accent)' : undefined,
                    }}
                    onClick={() => onSelectTask(task)}
                  >
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="badge" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                        {task.state}
                      </span>
                      {task.diffStat && (
                        <span className="mono" style={{ fontSize: 11, color: 'var(--green)' }}>
                          +{task.diffStat.insertions} / -{task.diffStat.deletions}
                        </span>
                      )}
                    </div>

                    <span style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>
                      {task.title}
                    </span>

                    <div className="row" style={{ fontSize: 11, color: 'var(--muted)', gap: 6 }}>
                      <GitBranch size={12} />
                      <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.branchName}
                      </span>
                    </div>

                    {/* Alertas ou Ações Rápidas por Fase */}
                    {task.state === 'intake' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ marginTop: 6 }}
                        onClick={e => handleStartPlan(task, e)}
                        disabled={isRunning}
                      >
                        <Play size={12} /> {isRunning ? 'Planejando...' : 'Planejar'}
                      </button>
                    )}

                    {task.state === 'waiting_approval' && (
                      <div
                        className="row"
                        style={{
                          background: 'var(--surface-hover)',
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          color: 'var(--accent)',
                          marginTop: 4,
                        }}
                      >
                        <Sparkles size={12} /> Plano pronto para aprovação
                      </div>
                    )}

                    {task.state === 'review' && (
                      <div className="row" style={{ gap: 6, marginTop: 4, fontSize: 11 }}>
                        {task.qaReport?.passed ? (
                          <span className="row" style={{ color: 'var(--green)', gap: 3 }}>
                            <CheckCircle2 size={12} /> QA ok
                          </span>
                        ) : (
                          <span className="row" style={{ color: 'var(--yellow)', gap: 3 }}>
                            <AlertCircle size={12} /> QA pendente
                          </span>
                        )}
                        <span>·</span>
                        {task.securityReport?.passed ? (
                          <span className="row" style={{ color: 'var(--green)', gap: 3 }}>
                            <ShieldAlert size={12} /> Seguro
                          </span>
                        ) : (
                          <span className="row" style={{ color: 'var(--yellow)', gap: 3 }}>
                            <ShieldAlert size={12} /> Alertas
                          </span>
                        )}
                      </div>
                    )}

                    {task.error && (
                      <span style={{ color: 'var(--red)', fontSize: 11 }}>
                        Erro: {task.error}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
