import { useState, useEffect, useMemo, useRef } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
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
  AlertTriangle,
  BookOpen,
  ClipboardList,
  ShieldAlert,
} from 'lucide-react'
import { Chips, Markdown } from '@/ui'
import { api } from '@/lib/api'
import type { FactoryTask } from '../../../../server/lib/factory/types.ts'
import { FactoryStatusChip } from './FactoryStatusChip'
import { FactoryStatChip } from './FactoryStatChip'
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
  const [eventFilter, setEventFilter] = useState<'all' | 'tools' | 'text' | 'status'>('all')
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    request: true,
    description: true,
    gates: true,
    outputs: true,
  })
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [autoScroll, setAutoScroll] = useState(true)
  const eventsEndRef = useRef<HTMLDivElement | null>(null)

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

  const displayedEvents = useMemo(() => {
    return consolidatedEvents.filter(ev => {
      if (eventFilter === 'tools') return ev.type === 'tool' || ev.type === 'tool-result'
      if (eventFilter === 'text') return ev.type === 'text'
      if (eventFilter === 'status') return ev.type === 'status' || ev.type === 'error'
      return true
    })
  }, [consolidatedEvents, eventFilter])

  // Auto-scroll nos eventos da execução
  useEffect(() => {
    if (autoScroll && eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [displayedEvents.length, autoScroll])

  const toggleAccordion = (key: string) => {
    setOpenAccordions(prev => ({ ...prev, [key]: !prev[key] }))
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

  // Seleciona span ativo padrão se nenhum estiver selecionado
  const activeSpan = spans.find(s => s.id === selectedSpanId) || spans[spans.length - 1] || null

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
            {activeSpan && <span> &gt; <b style={{ color: 'var(--fx-implementer)' }}>{activeSpan.name}</b></span>}
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
            <span>{displayedEvents.length} eventos</span>
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
                    const isSelected = (activeSpan?.id === span.id)

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

      {/* 4. PAINEL DE DETALHES DA FASE (PHASE DETAIL INSPECTOR) */}
      {activeSpan && (
        <div
          style={{
            margin: '0 20px 30px',
            borderRadius: 'var(--r-lg)',
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            overflow: 'hidden',
          }}
        >
          {/* Header do Inspector */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 20px',
              borderBottom: '1px solid var(--line)',
              background: 'var(--surface-2)',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{activeSpan.name}</span>
              <FactoryStatusChip span={activeSpan.status} />
              <FactoryStatChip kind="runtime" value={activeSpan.durationMs} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--muted)' }}>
              <span>Proprietário: <b style={{ color: 'var(--fx-architect)' }}>{activeSpan.agentId || 'sistema'}</b></span>
              <span>·</span>
              <span>Tipo: <b style={{ color: 'var(--fx-implementer)' }}>{activeSpan.kind}</b></span>
            </div>
          </div>

          {/* Grid Split de 2 Colunas com minWidth: 0 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 20,
              padding: 20,
              minWidth: 0,
            }}
          >
            {/* Coluna Esquerda: Acordeões de Entrada, Plano, Portões e Envelopes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              {/* Acordeão: Pedido / Requisitos */}
              <div style={{ borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleAccordion('request')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--surface-2)',
                    border: 'none',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {openAccordions.request ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Pedido / Requisitos da Demanda
                  </span>
                </button>
                {openAccordions.request && (
                  <div style={{ padding: 14, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    {liveTask.description || liveTask.title}
                  </div>
                )}
              </div>

              {/* Acordeão: Descrição & Plano Técnico */}
              {liveTask.plan && (
                <div style={{ borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggleAccordion('description')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--surface-2)',
                      border: 'none',
                      color: 'var(--ink)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {openAccordions.description ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      Plano Técnico do Architect
                    </span>
                  </button>
                  {openAccordions.description && (
                    <div style={{ padding: 14, maxHeight: 300, overflowY: 'auto' }}>
                      <Markdown>{liveTask.plan}</Markdown>
                    </div>
                  )}
                </div>
              )}

              {/* Acordeão: Portões de Aceitação (Gates) */}
              <div style={{ borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleAccordion('gates')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--surface-2)',
                    border: 'none',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {openAccordions.gates ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Portões Mecânicos de Aceitação
                  </span>
                </button>
                {openAccordions.gates && (
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ padding: 10, borderRadius: 6, background: 'var(--surface-2)', borderLeft: '3px solid var(--ok)', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Portão 1: Verificação de Alterações Git (Diff Not Empty)</div>
                      <div style={{ color: 'var(--muted)', marginTop: 2 }}>
                        {liveTask.diffStat ? `${liveTask.diffStat.filesChanged} arquivos modificados (+${liveTask.diffStat.insertions} / -${liveTask.diffStat.deletions})` : 'Validado na worktree'}
                      </div>
                    </div>

                    <div style={{ padding: 10, borderRadius: 6, background: 'var(--surface-2)', borderLeft: '3px solid var(--ok)', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Portão 2: Suíte Determinística de Testes (Tests Pass)</div>
                      {liveTask.qaReport?.output && (
                        <pre style={{ margin: '6px 0 0', padding: 8, background: 'var(--bg)', borderRadius: 4, fontSize: 11, maxHeight: 120, overflowY: 'auto' }}>
                          {liveTask.qaReport.output}
                        </pre>
                      )}
                      <div style={{ color: 'var(--muted)', marginTop: 2 }}>
                        {liveTask.qaReport?.passed ? 'Todos os testes passaram com código de saída 0.' : 'Nenhuma falha reportada.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Acordeão: Envelopes de Handoff */}
              {liveTask.handoffs && Object.keys(liveTask.handoffs).length > 0 && (
                <div style={{ borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggleAccordion('outputs')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--surface-2)',
                      border: 'none',
                      color: 'var(--ink)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {openAccordions.outputs ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      Envelopes Estruturados de Handoff
                    </span>
                  </button>
                  {openAccordions.outputs && (
                    <div style={{ padding: 14 }}>
                      <pre style={{ margin: 0, padding: 10, background: 'var(--bg)', borderRadius: 6, fontSize: 11, maxHeight: 220, overflowY: 'auto', color: 'var(--fx-implementer)' }}>
                        {JSON.stringify(liveTask.handoffs, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Coluna Direita: Tabela de Eventos da Sessão Consolidada */}
            <div
              style={{
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                maxHeight: 560,
                minWidth: 0,
              }}
            >
              {/* Header com Filtros */}
              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--surface-2)',
                  borderBottom: '1px solid var(--line)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Eventos da Execução ({displayedEvents.length})</span>
                  {isExecuting && (
                    <span className="badge badge-ok">
                      <span className="live-dot" style={{ width: 5, height: 5, background: 'var(--ok)' }} />
                      tempo real
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      color: autoScroll ? 'var(--signal)' : 'var(--muted)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={autoScroll}
                      onChange={e => setAutoScroll(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: 'var(--signal)' }}
                    />
                    Auto-rolagem
                  </label>

                  <Chips
                    options={[
                      { id: 'all', label: 'Todos' },
                      { id: 'tools', label: 'Ferramentas' },
                      { id: 'text', label: 'Mensagens' },
                      { id: 'status', label: 'Status' },
                    ]}
                    value={eventFilter}
                    onChange={setEventFilter}
                  />
              </div>
            </div>

            {/* Lista Formatada de Eventos */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayedEvents.length === 0 ? (
                  <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                    Nenhum evento registrado nesta categoria até o momento.
                  </div>
                ) : (
                  displayedEvents.map((ev, idx) => {
                    const isTool = ev.type === 'tool' || ev.type === 'tool-result'
                    const isError = ev.type === 'error' || Boolean(ev.isError)
                    const isText = ev.type === 'text'

                    return (
                      <div
                        key={idx}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          background: isError
                            ? 'var(--crit-soft)'
                            : isTool
                            ? 'color-mix(in srgb, var(--fx-implementer) 5%, transparent)'
                            : isText
                            ? 'color-mix(in srgb, var(--fx-architect) 5%, transparent)'
                            : 'var(--surface-2)',
                          borderLeft: isError
                            ? '3px solid var(--crit)'
                            : isTool
                            ? '3px solid var(--fx-implementer)'
                            : isText
                            ? '3px solid var(--fx-architect)'
                            : '3px solid var(--info)',
                          borderTop: '1px solid var(--line)',
                          borderRight: '1px solid var(--line)',
                          borderBottom: '1px solid var(--line)',
                          fontSize: 12,
                        }}
                      >
                        {/* Header do Item de Evento */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span
                            style={{
                              color: isError
                                ? 'var(--crit)'
                                : isTool
                                ? 'var(--fx-implementer)'
                                : isText
                                ? 'var(--fx-architect)'
                                : 'var(--info)',
                              fontWeight: 600,
                              fontSize: 11,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            {isTool && <Wrench size={12} />}
                            {isText && <MessageSquare size={12} />}
                            {isError && <AlertTriangle size={12} />}
                            {ev.type === 'text'
                              ? 'Mensagem do Agente'
                              : ev.type === 'tool'
                              ? `Ferramenta: ${ev.tool}`
                              : ev.type === 'tool-result'
                              ? `Resultado: ${ev.tool}`
                              : ev.type}
                          </span>
                          <span style={{ color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
                            #{idx + 1}
                          </span>
                        </div>

                        {/* Conteúdo com quebra e formatação legível */}
                        {isText ? (
                          <div
                            style={{
                              color: 'var(--ink)',
                              fontSize: 12,
                              lineHeight: 1.5,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              background: 'var(--bg)',
                              padding: 8,
                              borderRadius: 4,
                              maxHeight: 220,
                              overflowY: 'auto',
                            }}
                          >
                            {ev.text}
                          </div>
                        ) : ev.input ? (
                          <pre
                            style={{
                              margin: 0,
                              padding: 6,
                              background: 'var(--bg)',
                              borderRadius: 4,
                              color: 'var(--ink-2)',
                              fontSize: 11,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              maxHeight: 140,
                              overflowY: 'auto',
                            }}
                          >
                            {typeof ev.input === 'object' ? JSON.stringify(ev.input, null, 2) : String(ev.input)}
                          </pre>
                        ) : ev.content ? (
                          <pre
                            style={{
                              margin: 0,
                              padding: 6,
                              background: 'var(--bg)',
                              borderRadius: 4,
                              color: 'var(--ink-2)',
                              fontSize: 11,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              maxHeight: 140,
                              overflowY: 'auto',
                            }}
                          >
                            {typeof ev.content === 'object' ? JSON.stringify(ev.content, null, 2) : String(ev.content)}
                          </pre>
                        ) : (
                          <div style={{ color: 'var(--ink)', fontSize: 11, lineHeight: 1.4 }}>
                            {ev.message || ev.text}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
                <div ref={eventsEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
