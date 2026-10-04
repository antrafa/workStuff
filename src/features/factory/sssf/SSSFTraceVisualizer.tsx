import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Code2,
  Cpu,
  GitBranch,
  Play,
  ShieldCheck,
  Terminal,
  User,
  Wrench,
} from 'lucide-react'
import { Markdown } from '@/ui'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import type { FactoryTask } from '../../../../server/lib/factory/types.ts'
import { SSSFStatusChip } from './SSSFStatusChip'
import { SSSFStatChip } from './SSSFStatChip'

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

export function SSSFTraceVisualizer({ task, onBack, onUpdate }: Props) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const [sessionEvents, setSessionEvents] = useState<any[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    request: true,
    description: true,
    gates: true,
    outputs: true,
  })
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carrega eventos detalhados da sessão
  useEffect(() => {
    setLoadingEvents(true)
    api.get<any[]>(`/factory/tasks/${task.id}/session`)
      .then(setSessionEvents)
      .catch(() => setSessionEvents([]))
      .finally(() => setLoadingEvents(false))
  }, [task.id])

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
      model: task.model || 'gemini-3.8',
      contextPct: 4,
      color: '#c084fc',
      icon: Cpu,
    },
    {
      id: 'implementer',
      name: 'Implementer',
      role: 'Construção & Codificação',
      model: task.model || 'gemini-3.8',
      contextPct: 8,
      color: '#5ad2dd',
      icon: Wrench,
    },
    {
      id: 'gates',
      name: 'Portões',
      role: 'Portões Mecânicos de Aceitação',
      color: '#facc15',
      icon: ShieldCheck,
    },
    {
      id: 'tester',
      name: 'Tester',
      role: 'Avaliação de Testes & QA',
      model: task.model || 'gemini-3.8',
      color: '#4ade80',
      icon: Terminal,
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      role: 'Auditoria de Segurança & MR',
      model: task.model || 'gemini-3.8',
      color: '#94a3ff',
      icon: ShieldCheck,
    },
  ]

  // Monta lista de fases e blocos a partir dos spans gravados ou dos estados padrão
  const spans = task.spans ?? []
  const taskStartTime = new Date(task.createdAt).getTime()
  const now = Date.now()
  const taskEndTime = task.state === 'done' || task.state === 'review'
    ? (task.updatedAt ? new Date(task.updatedAt).getTime() : now)
    : now
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

  // Disparar ação de aprovação/construção
  const handleApprovePlan = async () => {
    setProcessing(true)
    setError(null)
    try {
      await streamPost(
        `/factory/tasks/${task.id}/approve-plan`,
        (e: any) => {
          if (e.type === 'error') setError(e.message)
          if (e.type === 'done') onUpdate()
        }
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProcessing(false)
      onUpdate()
    }
  }

  // Disparar planejamento com o Architect
  const handleStartPlan = async () => {
    setProcessing(true)
    setError(null)
    try {
      await streamPost(
        `/factory/tasks/${task.id}/plan`,
        (e: any) => {
          if (e.type === 'error') setError(e.message)
          if (e.type === 'done') onUpdate()
        }
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProcessing(false)
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
            Fábrica de Software &gt; sessões &gt;{' '}
            <b style={{ color: '#c084fc', fontFamily: 'ui-monospace, monospace' }}>{task.id}</b>
            {activeSpan && <span> &gt; <b style={{ color: '#5ad2dd' }}>{activeSpan.name}</b></span>}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#4ade80',
              boxShadow: '0 0 10px #4ade80',
              animation: 'pulse 1.5s infinite',
            }}
          />
          <span style={{ fontSize: 12, color: '#4ade80', fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>
            live
          </span>
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
          title={task.title}
        >
          {task.title}
        </span>

        <SSSFStatusChip status={task.state} />

        <span style={{ fontSize: 12, color: '#8b9cb6', fontFamily: 'ui-monospace, monospace' }}>
          iniciado em {new Date(task.createdAt).toLocaleTimeString()}
        </span>

        <div style={{ display: 'inline-flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <SSSFStatChip kind="cost" value={0.0} />
          <SSSFStatChip kind="runtime" value={totalDurationMs} />
          <SSSFStatChip kind="model" value={task.model || task.provider} />
          <SSSFStatChip kind="tools" value={spans.reduce((a, s) => a + (s.toolCalls?.length ?? 0), 0)} />
        </div>
      </div>

      {error && (
        <div style={{ margin: '14px 20px 0', padding: 12, borderRadius: 8, background: 'rgba(255, 111, 103, 0.15)', border: '1px solid rgba(255, 111, 103, 0.45)', color: '#ff6f67', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* 3. A GRANDE MATRIZ EM CASCATA (SWIMLANES WATERFALL) */}
      <div
        style={{
          margin: 20,
          borderRadius: 14,
          border: '1px solid #232c3d',
          background: '#0d1119',
          overflow: 'hidden',
        }}
      >
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
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 12, fontWeight: 700, color: '#8b9cb6', borderRight: '1px solid #232c3d' }}>
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
              {/* Coluna do Ator (Esquerda) */}
              <div
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 4,
                  borderRight: '1px solid #232c3d',
                  background: 'rgba(13, 17, 25, 0.7)',
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
              <div style={{ position: 'relative', height: '100%', minHeight: 104, overflow: 'hidden' }}>
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
                  const sEnd = span.finishedAt ? new Date(span.finishedAt).getTime() : now
                  const sDur = span.durationMs ?? (sEnd - sStart)
                  const startPct = Math.max(0, Math.min(94, ((sStart - taskStartTime) / totalDurationMs) * 100))
                  const widthPct = Math.max(16, Math.min(100 - startPct, (sDur / totalDurationMs) * 100))
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
                        <SSSFStatChip kind="runtime" compact value={sDur} />
                      </div>

                      <span style={{ fontSize: 11, color: '#8b9cb6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {span.error ? span.error : span.phase}
                      </span>

                      {/* Tool Ticks (Pequenas marcas verticais de ferramentas executadas) */}
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

      {/* AÇÕES DE CONTINUAÇÃO / HUMAN-IN-THE-LOOP */}
      <div style={{ margin: '0 20px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d1119', padding: '12px 16px', borderRadius: 12, border: '1px solid #232c3d' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitBranch size={16} style={{ color: '#5ad2dd' }} />
          <span style={{ fontSize: 13, color: '#aabdd5' }}>
            Worktree isolada: <b className="mono" style={{ color: '#f2f5fa' }}>{task.branchName}</b>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {task.state === 'intake' && (
            <button type="button" className="btn btn-sm btn-primary" onClick={handleStartPlan} disabled={processing}>
              <Play size={14} /> {processing ? 'Analisando...' : 'Iniciar Planejamento com Architect'}
            </button>
          )}

          {task.state === 'waiting_approval' && (
            <button type="button" className="btn btn-sm btn-primary" onClick={handleApprovePlan} disabled={processing}>
              <Play size={14} /> {processing ? 'Construindo...' : 'Aprovar Plano e Iniciar Construção'}
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
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#f2f5fa' }}>{activeSpan.name}</span>
              <SSSFStatusChip status={activeSpan.status} />
              <SSSFStatChip kind="runtime" value={activeSpan.durationMs} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#8b9cb6' }}>
              <span>Proprietário: <b style={{ color: '#c084fc' }}>{activeSpan.agentId || 'sistema'}</b></span>
              <span>·</span>
              <span>Tipo: <b style={{ color: '#5ad2dd' }}>{activeSpan.kind}</b></span>
            </div>
          </div>

          {/* Grid Split de 2 Colunas */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
              gap: 20,
              padding: 20,
            }}
          >
            {/* Coluna Esquerda: Acordeões de Entrada, Plano, Portões e Envelopes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                    {task.description || task.title}
                  </div>
                )}
              </div>

              {/* Acordeão: Descrição & Plano Técnico */}
              {task.plan && (
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
                      <Markdown>{task.plan}</Markdown>
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
                    Portões Mecânicos de Aceitação (Gates)
                  </span>
                  <span style={{ fontSize: 11, color: '#4ade80' }}>
                    {task.qaReport?.passed ? '✓ Portão aprovado' : 'Aguardando'}
                  </span>
                </button>
                {openAccordions.gates && (
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ padding: 10, borderRadius: 6, background: '#131a26', borderLeft: '3px solid #4ade80', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: '#f2f5fa' }}>Gate 1: Verificação de Alterações Git (Diff Not Empty)</div>
                      <div style={{ color: '#8b9cb6', marginTop: 2 }}>
                        {task.diffStat ? `${task.diffStat.filesChanged} arquivos modificados (+${task.diffStat.insertions} / -${task.diffStat.deletions})` : 'Validado na worktree'}
                      </div>
                    </div>

                    <div style={{ padding: 10, borderRadius: 6, background: '#131a26', borderLeft: '3px solid #4ade80', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: '#f2f5fa' }}>Gate 2: Suíte Determinística de Testes (Tests Pass)</div>
                      {task.qaReport?.output && (
                        <pre style={{ margin: '6px 0 0', padding: 8, background: '#06080f', borderRadius: 4, fontSize: 11, maxHeight: 120, overflowY: 'auto' }}>
                          {task.qaReport.output}
                        </pre>
                      )}
                      <div style={{ color: '#8b9cb6', marginTop: 2 }}>
                        {task.qaReport?.passed ? 'Todos os testes passaram com código de saída 0.' : 'Nenhuma falha reportada.'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Acordeão: Envelopes de Handoff */}
              {task.handoffs && Object.keys(task.handoffs).length > 0 && (
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
                        {JSON.stringify(task.handoffs, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Coluna Direita: Tabela de Eventos da Sessão */}
            <div
              style={{
                borderRadius: 8,
                border: '1px solid #222b3d',
                background: '#0a0e16',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                maxHeight: 520,
              }}
            >
              <div style={{ padding: '10px 14px', background: '#131a26', borderBottom: '1px solid #222b3d', fontSize: 13, fontWeight: 600, color: '#f2f5fa', display: 'flex', justifyContent: 'space-between' }}>
                <span>Eventos da Execução ({sessionEvents.length})</span>
                {loadingEvents && <span style={{ fontSize: 11, color: '#8b9cb6' }}>carregando...</span>}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sessionEvents.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#8b9cb6', fontSize: 12 }}>
                    Nenhum evento registrado na sessão até o momento.
                  </div>
                ) : (
                  sessionEvents.map((ev, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 4,
                        background: ev.type === 'error' ? 'rgba(255, 111, 103, 0.15)' : 'rgba(19, 26, 38, 0.5)',
                        border: '1px solid rgba(34, 43, 61, 0.5)',
                        fontSize: 12,
                        fontFamily: 'ui-monospace, monospace',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: ev.type === 'tool' ? '#5ad2dd' : ev.type === 'status' ? '#6cb6ff' : ev.type === 'error' ? '#ff6f67' : '#c89bff', fontWeight: 600 }}>
                          {ev.type} {ev.tool ? `(${ev.tool})` : ''}
                        </span>
                        <span style={{ color: '#8b9cb6', fontSize: 10 }}>#{idx + 1}</span>
                      </div>
                      <div style={{ color: '#f2f5fa', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.message || ev.text || (ev.input ? JSON.stringify(ev.input) : '')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
