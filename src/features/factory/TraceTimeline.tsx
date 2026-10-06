import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Cpu,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react'
import type { ExecutionSpan } from '../../../server/lib/factory/types.ts'
import { locale, tx } from '@/lib/i18n'

type Props = {
  spans?: ExecutionSpan[]
}

function formatDuration(ms?: number): string {
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// Span kind color: the same --fx-* variables as the rest of the factory (factory.css)
function getKindBadge(span: ExecutionSpan) {
  switch (span.kind) {
    case 'code':
      return { label: tx({ en: 'Deterministic code', pt: 'Código Determinístico' }), icon: Code2, color: 'var(--fx-code)' }
    case 'gate':
      return { label: tx({ en: 'Acceptance gate', pt: 'Portão de Aceitação' }), icon: ShieldCheck, color: 'var(--fx-gates)' }
    case 'agent':
    default:
      return {
        label: tx({ en: 'AI agent', pt: 'Agente IA' }),
        icon: Cpu,
        color: span.agentId ? `var(--fx-${span.agentId})` : 'var(--fx-engineer)',
      }
  }
}

export function TraceTimeline({ spans = [] }: Props) {
  const [expandedSpanId, setExpandedSpanId] = useState<string | null>(null)

  if (spans.length === 0) {
    return (
      <div className="card card-pad stack" style={{ textAlign: 'center', padding: 32, gap: 12 }}>
        <Clock size={32} style={{ margin: '0 auto', color: 'var(--muted)' }} />
        <span style={{ fontWeight: 600 }}>{tx({ en: 'No execution trace yet', pt: 'Nenhum trace de execução disponível' })}</span>
        <span className="muted" style={{ fontSize: 13, maxWidth: 440, margin: '0 auto' }}>
          {tx({
            en: 'As the phases run (planning, worktree, agents, gates and commits), the timeline and the tool calls show up here as a waterfall.',
            pt: 'À medida que as fases forem disparadas (planejamento, worktree, agentes, portões e commits), a linha do tempo e as chamadas de ferramentas aparecerão aqui em cascata.',
          })}
        </span>
      </div>
    )
  }

  // Time bounds for the waterfall
  const timestamps = spans.flatMap(s => [
    new Date(s.startedAt).getTime(),
    s.finishedAt ? new Date(s.finishedAt).getTime() : Date.now(),
  ])
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const totalDuration = Math.max(maxTime - minTime, 1000)

  const toggleExpand = (id: string) => {
    setExpandedSpanId(prev => (prev === id ? null : id))
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Run summary */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <span className="eyebrow">{tx({ en: 'Execution waterfall', pt: 'Cascata de execução' })}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {tx({ en: 'Total time: ', pt: 'Duração total acumulada: ' })}{formatDuration(totalDuration)}
        </span>
      </div>

      {/* Spans */}
      <div className="stack" style={{ gap: 8 }}>
        {spans.map(span => {
          const startTime = new Date(span.startedAt).getTime()
          const endTime = span.finishedAt ? new Date(span.finishedAt).getTime() : Date.now()
          const duration = span.durationMs ?? (endTime - startTime)
          const offsetPct = Math.max(0, Math.min(98, ((startTime - minTime) / totalDuration) * 100))
          const widthPct = Math.max(2, Math.min(100 - offsetPct, (duration / totalDuration) * 100))

          const kindConfig = getKindBadge(span)
          const KindIcon = kindConfig.icon
          const isExpanded = expandedSpanId === span.id

          return (
            <div
              key={span.id}
              className="card"
              style={{
                borderColor: isExpanded ? 'var(--line-hi)' : 'var(--line)',
                overflow: 'hidden',
                transition: 'border-color 0.2s ease',
              }}
            >
              {/* Span header */}
              <div
                className="row"
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: isExpanded ? 'var(--surface-2)' : 'transparent',
                }}
                onClick={() => toggleExpand(span.id)}
              >
                <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                  {isExpanded ? <ChevronDown size={14} className="muted" /> : <ChevronRight size={14} className="muted" />}

                  {/* Status Icon */}
                  {span.status === 'success' && <CheckCircle2 size={16} style={{ color: 'var(--ok)' }} />}
                  {span.status === 'failed' && <XCircle size={16} style={{ color: 'var(--crit)' }} />}
                  {span.status === 'running' && (
                    <Clock size={16} className="spin" style={{ color: 'var(--signal)' }} />
                  )}

                  {/* Span name */}
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{span.name}</span>

                  {/* Kind badge */}
                  <span
                    className="row"
                    style={{
                      gap: 4,
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: `color-mix(in srgb, ${kindConfig.color} 15%, transparent)`,
                      color: kindConfig.color,
                      border: `1px solid color-mix(in srgb, ${kindConfig.color} 30%, transparent)`,
                    }}
                  >
                    <KindIcon size={12} />
                    {kindConfig.label}
                  </span>
                </div>

                <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {formatDuration(duration)}
                  </span>
                </div>
              </div>

              {/* Waterfall bar */}
              <div
                style={{
                  height: 4,
                  background: 'var(--surface-3)',
                  position: 'relative',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: `${offsetPct}%`,
                    width: `${widthPct}%`,
                    height: '100%',
                    background: span.status === 'failed' ? 'var(--crit)' : kindConfig.color,
                    borderRadius: 2,
                  }}
                />
              </div>

              {/* Expanded details (tools, envelopes, errors) */}
              {isExpanded && (
                <div
                  className="stack"
                  style={{
                    padding: 14,
                    borderTop: '1px solid var(--line)',
                    background: 'var(--surface)',
                    gap: 12,
                  }}
                >
                  {span.error && (
                    <div className="callout callout-crit">
                      {span.error}
                    </div>
                  )}

                  {/* Tool calls */}
                  {span.toolCalls && span.toolCalls.length > 0 && (
                    <div className="stack" style={{ gap: 6 }}>
                      <span className="eyebrow">
                        {tx({ en: `Tools run (${span.toolCalls.length})`, pt: `Ferramentas executadas (${span.toolCalls.length})` })}
                      </span>
                      <div className="stack" style={{ gap: 6 }}>
                        {span.toolCalls.map((tc, idx) => (
                          <div
                            key={idx}
                            className="card card-pad"
                            style={{
                              background: 'var(--surface-3)',
                              padding: 8,
                              fontSize: 12,
                            }}
                          >
                            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                              <span className="row" style={{ gap: 6, fontWeight: 600 }}>
                                <Terminal size={13} style={{ color: 'var(--signal)' }} />
                                {tc.tool}
                              </span>
                              {tc.durationMs && <span className="muted">{formatDuration(tc.durationMs)}</span>}
                            </div>
                            {tc.input != null && (
                              <pre
                                style={{
                                  margin: 0,
                                  fontSize: 11,
                                  background: 'var(--surface)',
                                  padding: 6,
                                  borderRadius: 4,
                                  overflowX: 'auto',
                                }}
                              >
                                {typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Output envelope */}
                  {span.details && Object.keys(span.details).length > 0 && (
                    <div className="stack" style={{ gap: 4 }}>
                      <span className="eyebrow">{tx({ en: 'Execution details', pt: 'Detalhes da execução' })}</span>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 11,
                          background: 'var(--surface-3)',
                          padding: 8,
                          borderRadius: 4,
                          overflowX: 'auto',
                        }}
                      >
                        {JSON.stringify(span.details, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Start and end */}
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                    <span>{tx({ en: 'Start: ', pt: 'Início: ' })}{new Date(span.startedAt).toLocaleTimeString(locale())}</span>
                    {span.finishedAt && <span>{tx({ en: 'End: ', pt: 'Fim: ' })}{new Date(span.finishedAt).toLocaleTimeString(locale())}</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
