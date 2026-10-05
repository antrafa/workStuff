import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Code2,
  Cpu,
  GitBranch,
  Play,
  RefreshCw,
  RotateCw,
  Pause,
  Eye,
  ShieldCheck,
  Square,
  Terminal,
  User,
  Wrench,
  MessageSquare,
  BookOpen,
  ClipboardList,
  ShieldAlert,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { FactoryTask } from '../../../../server/lib/factory/types.ts'
import { FactoryStatusChip } from './FactoryStatusChip'
import { FactoryStatChip } from './FactoryStatChip'
import { PhaseDetailModal } from './PhaseDetailModal'
import { AGENT_ORDER, AGENT_UI, fmtDuration, runFactoryAction, useLiveTask } from '../factoryRun'
import type { SpecializedAgentId } from '../../../../server/lib/factory/types.ts'

type Props = {
  task: FactoryTask
  onBack: () => void
  onUpdate: () => void
  // Opens the review drawer for this task (diff, QA, security, finish)
  onOpenReview?: (task: FactoryTask) => void
}

type LaneDef = {
  id: string
  name: string
  role: string
  model?: string
  color: string
  icon: typeof Cpu
}

const AGENT_ICON: Record<SpecializedAgentId, typeof Cpu> = {
  analyst: ClipboardList,
  architect: Cpu,
  implementer: Wrench,
  tester: Terminal,
  reviewer: Eye,
  security: ShieldAlert,
  documenter: BookOpen,
}


export function FactoryTraceVisualizer({ task, onBack, onUpdate, onOpenReview }: Props) {
  const [processing, setProcessing] = useState(false)
  const { task: liveTask, events: consolidatedEvents, running: isExecuting, refresh, paused, setPaused } = useLiveTask(task, processing)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())

  // Timer em tempo real durante a execução para atualizar duração e escala temporal
  useEffect(() => {
    if (!isExecuting) return
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [isExecuting])

  const refreshNow = async () => {
    setIsRefreshing(true)
    await refresh()
    setIsRefreshing(false)
  }

  // Definição das Raias do Waterfall
  const lanes: LaneDef[] = [
    { id: 'engineer', name: 'Engenheiro', role: 'Usuário (Human-in-the-loop)', color: 'var(--fx-engineer)', icon: User },
    { id: 'code', name: 'Workspace', role: 'Código (Git Worktree & Commits)', color: 'var(--fx-code)', icon: Code2 },
    ...AGENT_ORDER.map(id => ({ id, ...AGENT_UI[id], model: liveTask.agentModels?.[id] || liveTask.model || liveTask.provider, icon: AGENT_ICON[id] })),
    { id: 'gates', name: 'Portões', role: 'Portões Mecânicos de Aceitação', color: 'var(--fx-gates)', icon: ShieldCheck },
  ]

  // Monta lista de fases e blocos a partir dos spans gravados ou dos estados padrão
  const spans = liveTask.spans ?? []
  const taskStartTime = new Date(liveTask.createdAt).getTime()
  // Only a running task grows with the clock; any other state ended at its last update
  const taskEndTime = isExecuting ? currentTime : new Date(liveTask.updatedAt).getTime()
  const totalDurationMs = Math.max(taskEndTime - taskStartTime, 5000)

  // Clicking a phase opens its detail modal; read from the live task so it updates while running
  const selectedSpan = spans.find(s => s.id === selectedSpanId) ?? null

  // Ticks temporais da escala
  const ticks = [
    { label: '0s', pct: 0 },
    { label: fmtDuration(totalDurationMs * 0.25), pct: 25 },
    { label: fmtDuration(totalDurationMs * 0.5), pct: 50 },
    { label: fmtDuration(totalDurationMs * 0.75), pct: 75 },
    { label: fmtDuration(totalDurationMs), pct: 98 },
  ]

  const handleCancelExecution = async () => {
    if (stopping) return
    setStopping(true)
    setError(null)
    setStatusMessage('Solicitando cancelamento ao servidor...')
    try {
      await api.post(`/factory/tasks/${liveTask.id}/cancel`, {})
      setStatusMessage('Execução interrompida pelo usuário.')
      await refresh()
      onUpdate()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setStopping(false)
    }
  }

  // Progress shows up through the polled session; here only the outcome matters
  const startAction = async (action: 'plan' | 'approve-plan', starting: string, finished: string) => {
    setProcessing(true)
    setError(null)
    setStatusMessage(starting)
    try {
      const outcome = await runFactoryAction(liveTask.id, action, { onStarted: onUpdate })
      if (outcome.error) setError(outcome.error)
      setStatusMessage(outcome.ok ? finished : outcome.cancelled ? 'Execução interrompida pelo usuário.' : null)
    } catch (err) {
      setError((err as Error).message)
      setStatusMessage(null)
    } finally {
      setProcessing(false)
      refresh()
      onUpdate()
    }
  }
  const handleApprovePlan = () => startAction('approve-plan', 'Iniciando construção na worktree...', 'Construção e testes concluídos com sucesso!')
  const handleStartPlan = () => startAction('plan', 'Iniciando planejamento arquitetural...', 'Planejamento concluído com sucesso!')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '85vh',
        background: 'var(--surface)',
        color: 'var(--ink)',
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--line)',
        overflow: 'hidden',
        width: '100%',
        minWidth: 0,
      }}
    >
      {/* 1. BREADCRUMBS & LIVE HEADER */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onBack}
            
          >
            <ArrowLeft size={14} /> Voltar
          </button>

          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Fábrica de Software &gt; execuções &gt;{' '}
            <b style={{ color: 'var(--fx-architect)', fontFamily: 'var(--font-mono)' }}>{liveTask.id}</b>
            {selectedSpan && <span> &gt; <b style={{ color: 'var(--fx-implementer)' }}>{selectedSpan.name}</b></span>}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Botão de Atualização Manual */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={refreshNow}
            disabled={isRefreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
            }}
            title="Atualizar dados e eventos agora"
          >
            <RefreshCw size={12} className={isRefreshing ? 'spin' : ''} />
            Atualizar
          </button>

          <button
            type="button"
            className="btn btn-sm"
            aria-pressed={!paused}
            onClick={() => setPaused(p => !p)}
            title={paused ? 'Atualização pausada: clique para retomar' : 'Atualizando ao vivo: clique para pausar'}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            {paused ? 'Pausado' : 'Ao vivo'}
          </button>

          {liveTask.state === 'error' && (
            // Same rule as board and drawer: with a plan, rebuild; without one, plan again
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={liveTask.plan ? handleApprovePlan : handleStartPlan}
              disabled={processing}
            >
              <RotateCw size={14} /> {processing ? 'Tentando...' : 'Tentar Novamente'}
            </button>
          )}

          {liveTask.state === 'review' && onOpenReview && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => onOpenReview(liveTask)}>
              <Eye size={14} /> Abrir Revisão
            </button>
          )}

          {isExecuting && (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={handleCancelExecution}
              disabled={stopping}
              title="Interromper execução atual"
            >
              <Square size={12} fill="currentColor" /> {stopping ? 'Parando...' : 'Parar Execução'}
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              className="live-dot"
              style={{ background: isExecuting ? 'var(--ok)' : 'var(--muted)', animation: isExecuting ? undefined : 'none' }}
            />
            <span style={{ fontSize: 12, color: isExecuting ? 'var(--ok)' : 'var(--muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {isExecuting ? 'executando em background' : 'inativo'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. RUN STRIP (TOP BAR DE MÉTRICAS) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 20px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface-2)',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            maxWidth: 420,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={liveTask.title}
        >
          {liveTask.title}
        </span>

        <FactoryStatusChip state={liveTask.state} executing={liveTask.executing} />

        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          iniciado em {new Date(liveTask.createdAt).toLocaleTimeString()}
        </span>

        <div style={{ display: 'inline-flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <FactoryStatChip kind="runtime" value={totalDurationMs} />
          <FactoryStatChip kind="model" value={liveTask.model || liveTask.provider} />
          <FactoryStatChip kind="tools" value={spans.reduce((a, s) => a + (s.toolCalls?.length ?? 0), 0)} />
        </div>
      </div>

      {/* Banner de Execução Contínua em Background */}
      {isExecuting && (
        <div
          style={{
            margin: '14px 20px 0',
            padding: '10px 16px',
            borderRadius: 8,
            background: 'var(--ok-soft)',
            border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 12,
            color: 'var(--ink)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="live-dot" style={{ background: 'var(--ok)' }} />
            <span>
              <strong>Execução contínua no servidor:</strong> O processo roda desacoplado em background. O visualizador sincroniza eventos e progresso automaticamente a cada 1.5s.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            <span>Tempo ativo: <strong style={{ color: 'var(--ok)' }}>{fmtDuration(totalDurationMs)}</strong></span>
            <span>|</span>
            <span>{consolidatedEvents.length} eventos</span>
          </div>
        </div>
      )}

      {error && (
        <div className="callout callout-crit" style={{ margin: '14px 20px 0', fontSize: 13 }}>
          {error}
        </div>
      )}

      {statusMessage && (
        <div className="callout callout-info" style={{ margin: '14px 20px 0', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="live-dot" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 3. A GRANDE MATRIZ EM CASCATA COM ROLAGEM HORIZONTAL E COLUNA STICKY */}
      <div
        style={{
          margin: 20,
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--line)',
          background: 'var(--surface)',
          overflowX: 'auto',
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 980 }}>
          {/* Linha do Eixo de Tempo (Header Row) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '260px 1fr',
              borderBottom: '1px solid var(--line)',
              background: 'var(--surface-2)',
              height: 38,
            }}
          >
            <div
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 6,
                background: 'var(--surface-2)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--muted)',
                borderRight: '1px solid var(--line)',
              }}
            >
              Ator / Fase
            </div>

            <div style={{ position: 'relative', height: '100%' }}>
              {ticks.map((t, idx) => (
                <span
                  key={idx}
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    left: `${t.pct}%`,
                    transform: t.pct === 0 ? 'none' : 'translateX(-50%)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--muted)',
                  }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {/* Raias do Waterfall */}
          {lanes.map(lane => {
            const LaneIcon = lane.icon

            // Filtra blocos/spans pertencentes a esta raia
            const laneSpans = spans.filter(s => {
              if (lane.id === 'engineer') return s.kind === 'code' && s.phase === 'intake'
              if (lane.id === 'code') return s.kind === 'code' && s.phase !== 'intake'
              if (lane.id === 'gates') return s.kind === 'gate'
              return s.agentId === lane.id
            })

            return (
              <div
                key={lane.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '260px 1fr',
                  borderBottom: '1px solid var(--line)',
                  minHeight: 104,
                }}
              >
                {/* Coluna do Ator (Esquerda, Fixa com Sticky) */}
                <div
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 5,
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 4,
                    borderRight: '1px solid var(--line)',
                    background: 'var(--surface)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <LaneIcon size={16} style={{ color: lane.color, opacity: 0.9 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{lane.name}</span>
                  </div>

                  <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lane.role}
                  </span>

                </div>

                {/* Coluna da Linha do Tempo (Direita) */}
                <div style={{ position: 'relative', height: '100%', minHeight: 104, overflow: 'visible' }}>
                  {/* Linhas de Grade Verticais */}
                  {ticks.map((t, idx) => (
                    <span
                      key={idx}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${t.pct}%`,
                        borderLeft: '1px dashed var(--line)',
                        pointerEvents: 'none',
                      }}
                    />
                  ))}

                  {/* Blocos de Fase da Raia */}
                  {laneSpans.map(span => {
                    const sStart = new Date(span.startedAt).getTime()
                    const sEnd = span.finishedAt ? new Date(span.finishedAt).getTime() : currentTime
                    const sDur = span.durationMs ?? (sEnd - sStart)
                    const startPct = Math.max(0, Math.min(88, ((sStart - taskStartTime) / totalDurationMs) * 100))
                    const widthPct = Math.max(10, Math.min(100 - startPct, (sDur / totalDurationMs) * 100))
                    const isSelected = (selectedSpan?.id === span.id)

                    return (
                      <button
                        key={span.id}
                        type="button"
                        onClick={() => setSelectedSpanId(span.id)}
                        style={{
                          position: 'absolute',
                          top: 10,
                          left: `${startPct}%`,
                          width: `${widthPct}%`,
                          height: 84,
                          padding: '8px 12px',
                          borderRadius: 10,
                          border: isSelected ? `2px solid ${lane.color}` : '1px solid var(--line-hi)',
                          background: isSelected ? 'var(--surface-2)' : 'var(--surface)',
                          color: 'var(--ink)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          overflow: 'hidden',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 13, color: span.status === 'success' ? 'var(--ok)' : span.status === 'failed' ? 'var(--crit)' : 'var(--info)' }}>
                            {span.status === 'success' ? '✓' : span.status === 'failed' ? '✕' : '●'}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {span.name}
                          </span>
                          <FactoryStatChip kind="runtime" compact value={sDur} />
                        </div>

                        <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {span.error ? span.error : span.phase}
                        </span>

                        {/* Tool Ticks (Marcas verticais de ferramentas executadas) */}
                        <div style={{ position: 'relative', height: 8, width: '100%', marginTop: 2 }}>
                          {span.toolCalls?.map((tc, tcIdx) => (
                            <span
                              key={tcIdx}
                              title={`${tc.tool}${tc.isError ? ' (erro)' : ''}`}
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                left: `${Math.min(95, (tcIdx + 1) * 7)}%`,
                                width: 3,
                                height: 8,
                                borderRadius: 1,
                                background: tc.isError ? 'var(--crit)' : 'var(--fx-implementer)',
                                opacity: 0.85,
                              }}
                            />
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* AÇÕES DE CONTINUAÇÃO / HUMAN-IN-THE-LOOP */}
      <div style={{ margin: '0 20px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--line)', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitBranch size={16} style={{ color: 'var(--fx-implementer)' }} />
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            Worktree isolada: <b className="mono" style={{ color: 'var(--ink)' }}>{liveTask.branchName}</b>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {liveTask.state === 'intake' && (
            <button type="button" className="btn btn-sm btn-primary" onClick={handleStartPlan} disabled={processing}>
              <Play size={14} /> {processing ? 'Analisando...' : 'Iniciar Planejamento com Architect'}
            </button>
          )}

          {liveTask.state === 'waiting_clarification' && onOpenReview && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => onOpenReview(liveTask)}>
              <MessageSquare size={14} /> Responder Dúvidas do Analyst
            </button>
          )}

          {liveTask.state === 'waiting_approval' && (
            <button type="button" className="btn btn-sm btn-primary" onClick={handleApprovePlan} disabled={processing}>
              <Play size={14} /> {processing ? 'Construindo...' : 'Aprovar Plano e Iniciar Construção'}
            </button>
          )}

          {liveTask.state === 'error' && (
            // Same rule as board and drawer: with a plan, rebuild; without one, plan again
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={liveTask.plan ? handleApprovePlan : handleStartPlan}
              disabled={processing}
            >
              <RotateCw size={14} /> {processing ? 'Tentando...' : 'Tentar Novamente'}
            </button>
          )}

          {liveTask.state === 'review' && onOpenReview && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => onOpenReview(liveTask)}>
              <Eye size={14} /> Abrir Revisão
            </button>
          )}

          {isExecuting && (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={handleCancelExecution}
              disabled={stopping}
            >
              <Square size={13} fill="currentColor" /> {stopping ? 'Parando...' : 'Parar Execução'}
            </button>
          )}
        </div>
      </div>

      {selectedSpan && (
        <PhaseDetailModal span={selectedSpan} events={consolidatedEvents} onClose={() => setSelectedSpanId(null)} />
      )}
    </div>
  )
}
