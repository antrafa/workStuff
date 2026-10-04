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
  ShieldCheck,
  Square,
  Terminal,
  User,
  Wrench,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react'
import { Markdown } from '@/ui'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import type { FactoryTask } from '../../../../server/lib/factory/types.ts'
import { FactoryStatusChip } from './FactoryStatusChip'
import { FactoryStatChip } from './FactoryStatChip'

type Props = {
  task: FactoryTask
  onBack: () => void
  onUpdate: () => void
}

type LaneDef = {
  id: string
  name: string
  role: string
  model?: string
  contextPct?: number
  color: string
  icon: typeof Cpu
}

function fmtDuration(ms?: number | null): string {
  if (ms == null || isNaN(ms)) return '0.00s'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${(ms / 1000).toFixed(1)}s`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  return `${min}m ${remSec < 10 ? '0' : ''}${remSec}s`
}

export function FactoryTraceVisualizer({ task, onBack, onUpdate }: Props) {
  const [liveTask, setLiveTask] = useState<FactoryTask>(task)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const [sessionEvents, setSessionEvents] = useState<any[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [eventFilter, setEventFilter] = useState<'all' | 'tools' | 'text' | 'status'>('all')
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    request: true,
    description: true,
    gates: true,
    outputs: true,
  })
  const [processing, setProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [_lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date())
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [autoScroll, setAutoScroll] = useState(true)
  const eventsEndRef = useRef<HTMLDivElement | null>(null)

  // Sincroniza liveTask quando a prop task mudar
  useEffect(() => {
    setLiveTask(task)
  }, [task])

  const isExecuting = processing || Boolean(liveTask.executing) || ['planning', 'building', 'qa_security'].includes(liveTask.state)

  // Timer em tempo real durante a execução para atualizar duração e escala temporal
  useEffect(() => {
    if (!isExecuting) return
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [isExecuting])

  const refreshData = async (silent = false) => {
    if (!silent) setIsRefreshing(true)
    try {
      const [events, updatedTask] = await Promise.all([
        api.get<any[]>(`/factory/tasks/${liveTask.id}/session`).catch(() => null),
        api.get<FactoryTask>(`/factory/tasks/${liveTask.id}`).catch(() => null),
      ])
      if (Array.isArray(events)) {
        setSessionEvents(events)
      }
      if (updatedTask) {
        setLiveTask(updatedTask)
      }
      setLastRefreshedAt(new Date())
    } finally {
      if (!silent) setIsRefreshing(false)
      setLoadingEvents(false)
    }
  }

  // Carga inicial dos eventos da sessão
  useEffect(() => {
    setLoadingEvents(true)
    refreshData(true)
  }, [liveTask.id])

  // Polling periódico para atualização em tempo real:
  // 1.5s durante execução; 8s quando inativo
  useEffect(() => {
    if (!autoRefresh) return
    const intervalMs = isExecuting ? 1500 : 8000
    const timer = setInterval(() => {
      refreshData(true)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [autoRefresh, isExecuting, liveTask.id])

  // Consolidação de eventos de texto contínuos para evitar fragmentação de tokens
  const consolidatedEvents = useMemo(() => {
    const result: any[] = []
    for (const ev of sessionEvents) {
      if (ev?.type === 'text' && typeof ev.text === 'string') {
        const last = result[result.length - 1]
        if (last && last.type === 'text') {
          last.text = (last.text || '') + ev.text
          continue
        }
      }
      result.push({ ...ev })
    }
    return result
  }, [sessionEvents])

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
    {
      id: 'engineer',
      name: 'Engenheiro',
      role: 'Usuário (Human-in-the-loop)',
      color: '#c89bff',
      icon: User,
    },
    {
      id: 'code',
      name: 'Workspace',
      role: 'Código (Git Worktree & Commits)',
      color: '#60a5fa',
      icon: Code2,
    },
    {
      id: 'architect',
      name: 'Architect',
      role: 'Planejamento Arquitetural',
      model: liveTask.model || 'gemini-3.8',
      contextPct: 4,
      color: '#c084fc',
      icon: Cpu,
    },
    {
      id: 'implementer',
      name: 'Implementer',
      role: 'Construção & Codificação',
      model: liveTask.model || 'gemini-3.8',
      contextPct: 8,
      color: '#5ad2dd',
      icon: Wrench,
    },
    {
      id: 'gates',
      role: 'Portões Mecânicos de Aceitação',
      name: 'Portões',
      color: '#facc15',
      icon: ShieldCheck,
    },
    {
      id: 'tester',
      name: 'Tester',
      role: 'Avaliação de Testes & QA',
      model: liveTask.model || 'gemini-3.8',
      color: '#4ade80',
      icon: Terminal,
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      role: 'Auditoria de Segurança & MR',
      model: liveTask.model || 'gemini-3.8',
      color: '#94a3ff',
      icon: ShieldCheck,
    },
  ]

  // Monta lista de fases e blocos a partir dos spans gravados ou dos estados padrão
  const spans = liveTask.spans ?? []
  const taskStartTime = new Date(liveTask.createdAt).getTime()
  const taskEndTime = liveTask.state === 'done' || liveTask.state === 'review'
    ? (liveTask.updatedAt ? new Date(liveTask.updatedAt).getTime() : currentTime)
    : currentTime
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
      await refreshData(true)
      onUpdate()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setStopping(false)
    }
  }

  // Disparar ação de aprovação/construção
  const handleApprovePlan = async () => {
    setProcessing(true)
    setError(null)
    setStatusMessage('Iniciando construção na worktree...')
    try {
      await streamPost(
        `/factory/tasks/${liveTask.id}/approve-plan`,
        (e: any) => {
          if (e.type === 'status') {
            setStatusMessage(e.message)
            setSessionEvents(prev => [...prev, { type: 'status', message: e.message, createdAt: new Date().toISOString() }])
          } else if (e.type === 'tool') {
            setSessionEvents(prev => [
              ...prev,
              {
                type: 'tool',
                tool: e.tool,
                input: e.input,
                id: e.id,
                createdAt: new Date().toISOString(),
              },
            ])
            api.get<FactoryTask>(`/factory/tasks/${liveTask.id}`).then(t => t && setLiveTask(t)).catch(() => {})
          } else if (e.type === 'text') {
            setSessionEvents(prev => {
              const last = prev[prev.length - 1]
              if (last && last.type === 'text') {
                return [...prev.slice(0, -1), { ...last, text: (last.text || '') + e.text }]
              }
              return [...prev, { type: 'text', text: e.text, createdAt: new Date().toISOString() }]
            })
          } else if (e.type === 'error') {
            setError(e.message)
            setSessionEvents(prev => [...prev, { type: 'error', message: e.message, isError: true, createdAt: new Date().toISOString() }])
          } else if (e.type === 'cancelled') {
            setStatusMessage(e.message || 'Execução interrompida pelo usuário.')
            setSessionEvents(prev => [...prev, { type: 'status', message: e.message || 'Execução interrompida.', createdAt: new Date().toISOString() }])
            refreshData(true)
            onUpdate()
          } else if (e.type === 'done') {
            setStatusMessage('Construção e testes concluídos com sucesso!')
            refreshData(true)
            onUpdate()
          }
        }
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProcessing(false)
      refreshData(true)
      onUpdate()
    }
  }

  // Disparar planejamento com o Architect
  const handleStartPlan = async () => {
    setProcessing(true)
    setError(null)
    setStatusMessage('Iniciando planejamento arquitetural...')
    try {
      await streamPost(
        `/factory/tasks/${liveTask.id}/plan`,
        (e: any) => {
          if (e.type === 'status') {
            setStatusMessage(e.message)
            setSessionEvents(prev => [...prev, { type: 'status', message: e.message, createdAt: new Date().toISOString() }])
          } else if (e.type === 'tool') {
            setSessionEvents(prev => [
              ...prev,
              {
                type: 'tool',
                tool: e.tool,
                input: e.input,
                id: e.id,
                createdAt: new Date().toISOString(),
              },
            ])
            api.get<FactoryTask>(`/factory/tasks/${liveTask.id}`).then(t => t && setLiveTask(t)).catch(() => {})
          } else if (e.type === 'text') {
            setSessionEvents(prev => {
              const last = prev[prev.length - 1]
              if (last && last.type === 'text') {
                return [...prev.slice(0, -1), { ...last, text: (last.text || '') + e.text }]
              }
              return [...prev, { type: 'text', text: e.text, createdAt: new Date().toISOString() }]
            })
          } else if (e.type === 'error') {
            setError(e.message)
            setSessionEvents(prev => [...prev, { type: 'error', message: e.message, isError: true, createdAt: new Date().toISOString() }])
          } else if (e.type === 'cancelled') {
            setStatusMessage(e.message || 'Execução interrompida pelo usuário.')
            setSessionEvents(prev => [...prev, { type: 'status', message: e.message || 'Execução interrompida.', createdAt: new Date().toISOString() }])
            refreshData(true)
            onUpdate()
          } else if (e.type === 'done') {
            setStatusMessage('Planejamento concluído com sucesso!')
            refreshData(true)
            onUpdate()
          }
        }
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProcessing(false)
      refreshData(true)
      onUpdate()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '85vh',
        background: '#06080f',
        color: '#f2f5fa',
        borderRadius: 16,
        border: '1px solid #232c3d',
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
          borderBottom: '1px solid #222b3d',
          background: '#0d1119',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#131a26', border: '1px solid #232c3d' }}
          >
            <ArrowLeft size={14} /> Voltar
          </button>

          <span style={{ fontSize: 13, color: '#8b9cb6' }}>
            Fábrica de Software &gt; execuções &gt;{' '}
            <b style={{ color: '#c084fc', fontFamily: 'ui-monospace, monospace' }}>{liveTask.id}</b>
            {activeSpan && <span> &gt; <b style={{ color: '#5ad2dd' }}>{activeSpan.name}</b></span>}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Botão de Atualização Manual */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => refreshData(false)}
            disabled={isRefreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#131a26',
              border: '1px solid #232c3d',
              fontSize: 12,
              color: '#8b9cb6',
            }}
            title="Atualizar dados e eventos agora"
          >
            <RefreshCw size={12} className={isRefreshing ? 'spin' : ''} />
            Atualizar
          </button>

          {/* Toggle de Auto-refresh */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setAutoRefresh(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: autoRefresh ? 'rgba(74, 222, 128, 0.1)' : '#131a26',
              border: `1px solid ${autoRefresh ? 'rgba(74, 222, 128, 0.3)' : '#232c3d'}`,
              fontSize: 12,
              color: autoRefresh ? '#4ade80' : '#8b9cb6',
            }}
            title={autoRefresh ? 'Auto-refresh ativo (1.5s durante execução). Clique para pausar.' : 'Auto-refresh pausado. Clique para ativar.'}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: autoRefresh ? '#4ade80' : '#8b9cb6',
              }}
            />
            Auto-refresh: {autoRefresh ? (isExecuting ? '1.5s' : 'Ativo') : 'Pausado'}
          </button>

          {isExecuting && (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={handleCancelExecution}
              disabled={stopping}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
              }}
              title="Interromper execução atual"
            >
              <Square size={12} fill="currentColor" /> {stopping ? 'Parando...' : 'Parar Execução'}
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isExecuting ? '#4ade80' : '#8b9cb6',
                boxShadow: isExecuting ? '0 0 10px #4ade80' : 'none',
                animation: isExecuting ? 'pulse 1.5s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: 12, color: isExecuting ? '#4ade80' : '#8b9cb6', fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>
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
          borderBottom: '1px solid #222b3d',
          background: 'linear-gradient(180deg, #10141f 0%, #0b0f18 100%)',
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

        <FactoryStatusChip status={liveTask.state} />

        <span style={{ fontSize: 12, color: '#8b9cb6', fontFamily: 'ui-monospace, monospace' }}>
          iniciado em {new Date(liveTask.createdAt).toLocaleTimeString()}
        </span>

        <div style={{ display: 'inline-flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <FactoryStatChip kind="cost" value={0.0} />
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
            background: 'linear-gradient(90deg, rgba(74, 222, 128, 0.12) 0%, rgba(90, 210, 221, 0.08) 100%)',
            border: '1px solid rgba(74, 222, 128, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 12,
            color: '#f2f5fa',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#4ade80',
                boxShadow: '0 0 8px #4ade80',
                animation: 'pulse 1.2s infinite',
                flexShrink: 0,
              }}
            />
            <span>
              <strong>Execução contínua no servidor:</strong> O processo roda desacoplado em background. O visualizador sincroniza eventos e progresso automaticamente a cada 1.5s.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, color: '#8b9cb6', fontFamily: 'ui-monospace, monospace' }}>
            <span>Tempo ativo: <strong style={{ color: '#4ade80' }}>{fmtDuration(totalDurationMs)}</strong></span>
            <span>|</span>
            <span>{displayedEvents.length} eventos</span>
          </div>
        </div>
      )}

      {error && (
        <div style={{ margin: '14px 20px 0', padding: 12, borderRadius: 8, background: 'rgba(255, 111, 103, 0.15)', border: '1px solid rgba(255, 111, 103, 0.45)', color: '#ff6f67', fontSize: 13 }}>
          {error}
        </div>
      )}

      {statusMessage && (
        <div style={{ margin: '14px 20px 0', padding: 12, borderRadius: 8, background: 'rgba(90, 210, 221, 0.15)', border: '1px solid rgba(90, 210, 221, 0.35)', color: '#5ad2dd', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#5ad2dd', animation: 'pulse 1.2s infinite' }} />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 3. A GRANDE MATRIZ EM CASCATA COM ROLAGEM HORIZONTAL E COLUNA STICKY */}
      <div
        style={{
          margin: 20,
          borderRadius: 14,
          border: '1px solid #232c3d',
          background: '#0d1119',
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
              borderBottom: '1px solid #232c3d',
              background: '#131a26',
              height: 38,
            }}
          >
            <div
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 6,
                background: '#131a26',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                fontSize: 12,
                fontWeight: 700,
                color: '#8b9cb6',
                borderRight: '1px solid #232c3d',
                boxShadow: '2px 0 6px rgba(0,0,0,0.3)',
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
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 12,
                    color: '#8b9cb6',
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
                  borderBottom: '1px solid rgba(34, 43, 61, 0.6)',
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
                    borderRight: '1px solid #232c3d',
                    background: '#0d1119',
                    boxShadow: '2px 0 6px rgba(0,0,0,0.3)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <LaneIcon size={16} style={{ color: lane.color, opacity: 0.9 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#f2f5fa' }}>{lane.name}</span>
                  </div>

                  <span style={{ fontSize: 11, color: '#8b9cb6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lane.role}
                  </span>

                  {/* Medidor de Ocupação de Contexto (Context Occupancy Bar) */}
                  {lane.contextPct != null && (
                    <div style={{ marginTop: 4, maxWidth: 200 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b9cb6', fontFamily: 'ui-monospace, monospace' }}>
                        <span>CONTEXT</span>
                        <span>{lane.contextPct}%</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 999, background: 'rgba(6, 8, 15, 0.8)', border: '1px solid #232c3d', overflow: 'hidden', marginTop: 2 }}>
                        <div
                          style={{
                            width: `${lane.contextPct * 3}%`,
                            height: '100%',
                            background: `linear-gradient(90deg, ${lane.color}88, ${lane.color})`,
                            boxShadow: `0 0 8px ${lane.color}`,
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    </div>
                  )}
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
                        borderLeft: '1px dashed rgba(174, 191, 212, 0.12)',
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
                          border: isSelected ? `2px solid ${lane.color}` : '1px solid rgba(108, 182, 255, 0.25)',
                          background: isSelected ? 'rgba(19, 26, 38, 0.95)' : 'rgba(13, 17, 25, 0.85)',
                          boxShadow: isSelected ? `0 0 20px ${lane.color}44` : 'none',
                          color: '#f2f5fa',
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
                          <span style={{ fontSize: 13, color: span.status === 'success' ? '#4ade80' : span.status === 'failed' ? '#ff6f67' : '#6cb6ff' }}>
                            {span.status === 'success' ? '✓' : span.status === 'failed' ? '✕' : '●'}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {span.name}
                          </span>
                          <FactoryStatChip kind="runtime" compact value={sDur} />
                        </div>

                        <span style={{ fontSize: 11, color: '#8b9cb6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                                background: tc.isError ? '#ff6f67' : '#5ad2dd',
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
      <div style={{ margin: '0 20px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d1119', padding: '12px 16px', borderRadius: 12, border: '1px solid #232c3d', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitBranch size={16} style={{ color: '#5ad2dd' }} />
          <span style={{ fontSize: 13, color: '#aabdd5' }}>
            Worktree isolada: <b className="mono" style={{ color: '#f2f5fa' }}>{liveTask.branchName}</b>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {liveTask.state === 'intake' && (
            <button type="button" className="btn btn-sm btn-primary" onClick={handleStartPlan} disabled={processing}>
              <Play size={14} /> {processing ? 'Analisando...' : 'Iniciar Planejamento com Architect'}
            </button>
          )}

          {liveTask.state === 'waiting_approval' && (
            <button type="button" className="btn btn-sm btn-primary" onClick={handleApprovePlan} disabled={processing}>
              <Play size={14} /> {processing ? 'Construindo...' : 'Aprovar Plano e Iniciar Construção'}
            </button>
          )}

          {isExecuting && (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={handleCancelExecution}
              disabled={stopping}
              style={{
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
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
            borderRadius: 14,
            border: '1px solid #232c3d',
            background: '#0d1119',
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
              borderBottom: '1px solid #222b3d',
              background: '#131a26',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#f2f5fa' }}>{activeSpan.name}</span>
              <FactoryStatusChip status={activeSpan.status} />
              <FactoryStatChip kind="runtime" value={activeSpan.durationMs} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#8b9cb6' }}>
              <span>Proprietário: <b style={{ color: '#c084fc' }}>{activeSpan.agentId || 'sistema'}</b></span>
              <span>·</span>
              <span>Tipo: <b style={{ color: '#5ad2dd' }}>{activeSpan.kind}</b></span>
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
              <div style={{ borderRadius: 8, border: '1px solid #222b3d', background: '#0a0e16', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleAccordion('request')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '10px 14px',
                    background: '#131a26',
                    border: 'none',
                    color: '#f2f5fa',
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
                  <div style={{ padding: 14, fontSize: 13, color: '#aabdd5', lineHeight: 1.5 }}>
                    {liveTask.description || liveTask.title}
                  </div>
                )}
              </div>

              {/* Acordeão: Descrição & Plano Técnico */}
              {liveTask.plan && (
                <div style={{ borderRadius: 8, border: '1px solid #222b3d', background: '#0a0e16', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggleAccordion('description')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '10px 14px',
                      background: '#131a26',
                      border: 'none',
                      color: '#f2f5fa',
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
              <div style={{ borderRadius: 8, border: '1px solid #222b3d', background: '#0a0e16', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => toggleAccordion('gates')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '10px 14px',
                    background: '#131a26',
                    border: 'none',
                    color: '#f2f5fa',
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
                    <div style={{ padding: 10, borderRadius: 6, background: '#131a26', borderLeft: '3px solid #4ade80', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: '#f2f5fa' }}>Portão 1: Verificação de Alterações Git (Diff Not Empty)</div>
                      <div style={{ color: '#8b9cb6', marginTop: 2 }}>
                        {liveTask.diffStat ? `${liveTask.diffStat.filesChanged} arquivos modificados (+${liveTask.diffStat.insertions} / -${liveTask.diffStat.deletions})` : 'Validado na worktree'}
                      </div>
                    </div>

                    <div style={{ padding: 10, borderRadius: 6, background: '#131a26', borderLeft: '3px solid #4ade80', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: '#f2f5fa' }}>Portão 2: Suíte Determinística de Testes (Tests Pass)</div>
                      {liveTask.qaReport?.output && (
                        <pre style={{ margin: '6px 0 0', padding: 8, background: '#06080f', borderRadius: 4, fontSize: 11, maxHeight: 120, overflowY: 'auto' }}>
                          {liveTask.qaReport.output}
                        </pre>
                      )}
                      <div style={{ color: '#8b9cb6', marginTop: 2 }}>
                        {liveTask.qaReport?.passed ? 'Todos os testes passaram com código de saída 0.' : 'Nenhuma falha reportada.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Acordeão: Envelopes de Handoff */}
              {liveTask.handoffs && Object.keys(liveTask.handoffs).length > 0 && (
                <div style={{ borderRadius: 8, border: '1px solid #222b3d', background: '#0a0e16', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggleAccordion('outputs')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '10px 14px',
                      background: '#131a26',
                      border: 'none',
                      color: '#f2f5fa',
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
                      <pre style={{ margin: 0, padding: 10, background: '#06080f', borderRadius: 6, fontSize: 11, maxHeight: 220, overflowY: 'auto', color: '#5ad2dd' }}>
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
                border: '1px solid #232c3d',
                background: '#0a0e16',
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
                  background: '#131a26',
                  borderBottom: '1px solid #222b3d',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#f2f5fa',
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
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 6px',
                        borderRadius: 10,
                        background: 'rgba(74, 222, 128, 0.15)',
                        border: '1px solid rgba(74, 222, 128, 0.3)',
                        color: '#4ade80',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.2s infinite' }} />
                      tempo real
                    </span>
                  )}
                  {loadingEvents && <span style={{ fontSize: 11, color: '#8b9cb6' }}>carregando...</span>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      color: autoScroll ? '#5ad2dd' : '#8b9cb6',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={autoScroll}
                      onChange={e => setAutoScroll(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: '#5ad2dd' }}
                    />
                    Auto-rolagem
                  </label>

                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                    type="button"
                    onClick={() => setEventFilter('all')}
                    style={{
                      background: eventFilter === 'all' ? '#1f2b3e' : 'transparent',
                      color: eventFilter === 'all' ? '#f2f5fa' : '#8b9cb6',
                      border: '1px solid #232c3d',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setEventFilter('tools')}
                    style={{
                      background: eventFilter === 'tools' ? '#1f2b3e' : 'transparent',
                      color: eventFilter === 'tools' ? '#5ad2dd' : '#8b9cb6',
                      border: '1px solid #232c3d',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    Ferramentas
                  </button>
                  <button
                    type="button"
                    onClick={() => setEventFilter('text')}
                    style={{
                      background: eventFilter === 'text' ? '#1f2b3e' : 'transparent',
                      color: eventFilter === 'text' ? '#c084fc' : '#8b9cb6',
                      border: '1px solid #232c3d',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    Mensagens
                  </button>
                  <button
                    type="button"
                    onClick={() => setEventFilter('status')}
                    style={{
                      background: eventFilter === 'status' ? '#1f2b3e' : 'transparent',
                      color: eventFilter === 'status' ? '#f2f5fa' : '#8b9cb6',
                      border: '1px solid #232c3d',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    Status
                  </button>
                </div>
              </div>
            </div>

            {/* Lista Formatada de Eventos */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayedEvents.length === 0 ? (
                  <div style={{ padding: 28, textAlign: 'center', color: '#8b9cb6', fontSize: 12 }}>
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
                            ? 'rgba(255, 111, 103, 0.1)'
                            : isTool
                            ? 'rgba(90, 210, 221, 0.05)'
                            : isText
                            ? 'rgba(192, 132, 252, 0.05)'
                            : 'rgba(19, 26, 38, 0.5)',
                          borderLeft: isError
                            ? '3px solid #ff6f67'
                            : isTool
                            ? '3px solid #5ad2dd'
                            : isText
                            ? '3px solid #c084fc'
                            : '3px solid #6cb6ff',
                          borderTop: '1px solid rgba(34, 43, 61, 0.4)',
                          borderRight: '1px solid rgba(34, 43, 61, 0.4)',
                          borderBottom: '1px solid rgba(34, 43, 61, 0.4)',
                          fontSize: 12,
                        }}
                      >
                        {/* Header do Item de Evento */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span
                            style={{
                              color: isError
                                ? '#ff6f67'
                                : isTool
                                ? '#5ad2dd'
                                : isText
                                ? '#c084fc'
                                : '#6cb6ff',
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
                          <span style={{ color: '#8b9cb6', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}>
                            #{idx + 1}
                          </span>
                        </div>

                        {/* Conteúdo com quebra e formatação legível */}
                        {isText ? (
                          <div
                            style={{
                              color: '#dbeafe',
                              fontSize: 12,
                              lineHeight: 1.5,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              background: '#06080f',
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
                              background: '#06080f',
                              borderRadius: 4,
                              color: '#aabdd5',
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
                              background: '#06080f',
                              borderRadius: 4,
                              color: '#aabdd5',
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
                          <div style={{ color: '#f2f5fa', fontSize: 11, lineHeight: 1.4 }}>
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
