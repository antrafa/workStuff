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
import type { FactoryTask } from '../../../server/lib/factory/types.ts'
import { FactoryLiveConsole } from './FactoryLiveConsole'

type Props = {
  tasks: FactoryTask[]
  onSelectTask: (task: FactoryTask) => void
  onUpdate: () => void
  onOpenTrace?: (task: FactoryTask) => void
}

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

  // Filtragem por colunas
  const intakeTasks = tasks.filter(t => t.state === 'intake')
  const planningTasks = tasks.filter(
    t => t.state === 'planning' || t.state === 'waiting_approval' || (t.state === 'error' && !t.plan)
  )
  const buildingTasks = tasks.filter(t => t.state === 'building' || t.state === 'qa_security')
  const reviewTasks = tasks.filter(t => t.state === 'review' || (t.state === 'error' && t.plan))
  const doneTasks = tasks.filter(t => t.state === 'done')

  const columns = [
    { id: 'intake', title: 'Entrada', badge: intakeTasks.length, items: intakeTasks, color: 'var(--muted)' },
    { id: 'planning', title: 'Planejamento', badge: planningTasks.length, items: planningTasks, color: 'var(--accent)' },
    { id: 'building', title: 'Construção & QA', badge: buildingTasks.length, items: buildingTasks, color: '#eab308' },
    { id: 'review', title: 'Revisão', badge: reviewTasks.length, items: reviewTasks, color: '#a855f7' },
    { id: 'done', title: 'Concluído', badge: doneTasks.length, items: doneTasks, color: '#22c55e' },
  ]

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
                background: 'var(--surface-active, rgba(255,255,255,0.02))',
                borderRadius: 'var(--r-lg, 12px)',
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
                    const isTaskRunning = task.state === 'planning' || task.state === 'building' || task.state === 'qa_security' || Boolean(task.executing)
                    const hasError = task.state === 'error' || Boolean(task.error)
                    const isWaitingApproval = task.state === 'waiting_approval'

                    return (
                      <div
                        key={task.id}
                        className="card card-pad stack"
                        style={{
                          cursor: 'pointer',
                          padding: 14,
                          gap: 10,
                          transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
                          border: hasError
                            ? '1px solid var(--red)'
                            : isWaitingApproval
                            ? '1px solid var(--accent)'
                            : isTaskRunning
                            ? '1px solid #5ad2dd'
                            : '1px solid var(--line)',
                          background: isTaskRunning ? 'rgba(90, 210, 221, 0.03)' : undefined,
                        }}
                        onClick={() => onSelectTask(task)}
                      >
                        {/* Topo do Card: Badge de Estado + Botão de Logs */}
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            className="badge"
                            style={{
                              fontSize: 10,
                              textTransform: 'uppercase',
                              background: isTaskRunning
                                ? 'rgba(90, 210, 221, 0.15)'
                                : hasError
                                ? 'var(--red-subtle)'
                                : undefined,
                              color: isTaskRunning
                                ? '#5ad2dd'
                                : hasError
                                ? 'var(--red)'
                                : undefined,
                            }}
                          >
                            {task.state}
                          </span>

                          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                            {task.diffStat && (
                              <span className="mono" style={{ fontSize: 11, color: 'var(--green)' }}>
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
                                color: isTaskRunning ? '#5ad2dd' : 'var(--muted)',
                              }}
                              onClick={e => handleOpenConsole(task, null, e)}
                              title="Abrir console e acompanhar logs em tempo real"
                            >
                              <Terminal size={12} /> Logs
                            </button>
                          </div>
                        </div>

                        {/* Título da Tarefa */}
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35, color: 'var(--foreground)' }}>
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

                          {isTaskRunning && (
                            <div className="row" style={{ gap: 6 }}>
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{
                                  flex: 1,
                                  justifyContent: 'center',
                                  gap: 6,
                                  borderColor: '#5ad2dd',
                                  color: '#5ad2dd',
                                }}
                                onClick={e => handleOpenConsole(task, null, e)}
                              >
                                <Activity size={13} style={{ animation: 'spin 2s linear infinite' }} />
                                Acompanhar
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{
                                  borderColor: 'rgba(239, 68, 68, 0.4)',
                                  color: '#ef4444',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  padding: '0 10px',
                                  gap: 4,
                                }}
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
                                    <CheckCircle2 size={12} /> Seguro
                                  </span>
                                ) : (
                                  <span className="row" style={{ color: 'var(--yellow)', gap: 3 }}>
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
                                  color: 'var(--red)',
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
                                className="btn btn-sm"
                                style={{ width: '100%', justifyContent: 'center', gap: 6, borderColor: 'var(--red)', color: 'var(--red)' }}
                                onClick={e => handleOpenConsole(task, task.plan ? 'approve-plan' : 'plan', e)}
                              >
                                <RotateCw size={12} /> Ver Logs & Tentar Novamente
                              </button>
                            </div>
                          )}

                          {task.state === 'done' && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ width: '100%', justifyContent: 'center', gap: 6, color: 'var(--green)' }}
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
