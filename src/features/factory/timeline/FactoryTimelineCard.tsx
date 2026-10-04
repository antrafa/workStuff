import { useState } from 'react'
import type { FactoryTask } from '../../../../server/lib/factory/types.ts'
import { FactoryStatusChip } from './FactoryStatusChip'
import { FactoryStatChip } from './FactoryStatChip'
import { FactoryPhaseDots } from './FactoryPhaseDots'

type Props = {
  task: FactoryTask
  onOpenTrace: (task: FactoryTask) => void
  onDelete?: (task: FactoryTask) => void
}

type TimelineDot = {
  id: string
  xPct: number
  color: string
  title: string
  isLatest?: boolean
}

type TimelineLane = {
  id: string
  label: string
  color: string
  dots: TimelineDot[]
}

const LANE_CONFIGS = [
  { id: 'architect', label: 'architect', color: '#c084fc' },
  { id: 'implementer', label: 'builder', color: '#5ad2dd' },
  { id: 'tester', label: 'tester', color: '#4ade80' },
  { id: 'reviewer', label: 'reviewer', color: '#94a3ff' },
  { id: 'code', label: 'code', color: '#60a5fa' },
]

export function FactoryTimelineCard({ task, onOpenTrace, onDelete }: Props) {
  const [isHovered, setIsHovered] = useState(false)

  // Calcula duração total
  const startTime = new Date(task.createdAt).getTime()
  const endTime = task.updatedAt ? new Date(task.updatedAt).getTime() : Date.now()
  const durationMs = Math.max(endTime - startTime, 1000)

  // Extrai ferramentas e spans em raias
  const spans = task.spans ?? []
  const totalTools = spans.reduce((acc, s) => acc + (s.toolCalls?.length ?? 0), 0)

  // Monta ticks da escala temporal
  const ticks = [
    { label: '0s', pct: 0 },
    { label: durationMs < 60_000 ? `${Math.round(durationMs / 2000)}s` : `${(durationMs / 120_000).toFixed(1)}m`, pct: 50 },
    { label: durationMs < 60_000 ? `${Math.round(durationMs / 1000)}s` : `${(durationMs / 60_000).toFixed(1)}m`, pct: 98 },
  ]

  // Mapeia dots para cada raia
  const lanes: TimelineLane[] = LANE_CONFIGS.map(cfg => {
    const laneSpans = spans.filter(s => {
      if (cfg.id === 'code') return s.kind === 'code' || s.kind === 'gate'
      return s.agentId === cfg.id
    })

    const dots: TimelineDot[] = []
    laneSpans.forEach(s => {
      const spanStart = new Date(s.startedAt).getTime()
      const relTime = Math.max(0, spanStart - startTime)
      const xPct = Math.min(96, Math.max(2, (relTime / durationMs) * 100))

      dots.push({
        id: s.id,
        xPct,
        color: cfg.color,
        title: `${s.name} (${s.status})`,
      })

      // Adiciona dots para cada tool call se houver
      s.toolCalls?.forEach((tc, tcIdx) => {
        const toolPct = Math.min(98, xPct + ((tcIdx + 1) * 3))
        dots.push({
          id: `${s.id}-tc-${tcIdx}`,
          xPct: toolPct,
          color: tc.isError ? '#ff6f67' : '#5ad2dd',
          title: `Tool: ${tc.tool}`,
        })
      })
    })

    return {
      id: cfg.id,
      label: cfg.label,
      color: cfg.color,
      dots,
    }
  }).filter(l => l.dots.length > 0 || spans.length === 0)

  // Marca último dot se estiver rodando
  const isRunning = task.state === 'planning' || task.state === 'building' || task.state === 'qa_security'
  if (isRunning) {
    const allDots = lanes.flatMap(l => l.dots)
    if (allDots.length > 0) {
      allDots[allDots.length - 1].isLatest = true
    }
  }

  // Abreviação amigável do ID
  const shortId = task.id.replace(/^fac-/, '').slice(-8)

  return (
    <div
      className="timeline-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onOpenTrace(task)}
      style={{
        height: 380,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '18px 20px',
        position: 'relative',
        borderRadius: 16,
        background: 'linear-gradient(180deg, #10141f 0%, #0b0f18 100%)',
        border: task.state === 'error'
          ? '1px solid rgba(255, 111, 103, 0.6)'
          : isRunning
            ? '1px solid rgba(108, 182, 255, 0.6)'
            : '1px solid #222b3d',
        color: '#f2f5fa',
        cursor: 'pointer',
        overflow: 'hidden',
        boxShadow: isHovered
          ? '0 10px 30px rgba(148, 163, 255, 0.15), 0 0 16px rgba(108, 182, 255, 0.12)'
          : '0 4px 16px rgba(0,0,0,0.3)',
        transform: isHovered ? 'translateY(-2px)' : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Botão de Excluir no canto superior */}
      {onDelete && isHovered && (
        <button
          type="button"
          title="Excluir tarefa"
          onClick={e => {
            e.stopPropagation()
            onDelete(task)
          }}
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            width: 26,
            height: 26,
            padding: 0,
            border: 'none',
            borderRadius: 6,
            background: 'rgba(255, 111, 103, 0.15)',
            color: '#ff6f67',
            fontSize: 16,
            cursor: 'pointer',
            lineHeight: 1,
            zIndex: 10,
          }}
        >
          ×
        </button>
      )}

      {/* ID em Roxo */}
      <span
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 15,
          fontWeight: 700,
          color: '#c084fc',
          letterSpacing: '0.04em',
        }}
      >
        {shortId}
      </span>

      {/* Nome da Esteira / Branch em Ciano */}
      <span
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 13,
          color: '#5ad2dd',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={task.branchName}
      >
        esteira · {task.branchName}
      </span>

      {/* Título / Demanda */}
      <span
        style={{
          fontSize: 13,
          color: '#f2f5fa',
          lineHeight: 1.4,
          maxHeight: 38,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
        title={task.title}
      >
        {task.title}
      </span>

      {/* MINI WATERFALL TIMELINE */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 6,
          height: 150,
          flex: 'none',
          overflow: 'hidden',
        }}
      >
        {/* Eixo temporal com marcas */}
        <div style={{ display: 'flex', alignItems: 'flex-end', height: 22, marginBottom: 4 }}>
          <span style={{ width: 84, flex: 'none' }} />
          <div style={{ position: 'relative', flex: 1, height: '100%', borderBottom: '1px solid #232c3d' }}>
            {ticks.map((t, idx) => (
              <span
                key={idx}
                style={{
                  position: 'absolute',
                  bottom: 3,
                  left: `${t.pct}%`,
                  transform: t.pct === 0 ? 'none' : 'translateX(-50%)',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 11,
                  color: '#8b9cb6',
                }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>

        {/* Raias de Agentes */}
        {lanes.slice(0, 3).map(lane => (
          <div
            key={lane.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 34,
            }}
          >
            <span
              style={{
                width: 84,
                flex: 'none',
                fontSize: 12,
                fontFamily: 'ui-monospace, monospace',
                color: lane.color,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                paddingRight: 6,
              }}
            >
              {lane.label}
            </span>

            <div
              style={{
                position: 'relative',
                flex: 1,
                height: '100%',
                borderBottom: '1px solid rgba(34, 43, 61, 0.45)',
              }}
            >
              {lane.dots.map(dot => (
                <span
                  key={dot.id}
                  title={dot.title}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: `${dot.xPct}%`,
                    width: dot.isLatest ? 11 : 7,
                    height: dot.isLatest ? 11 : 7,
                    borderRadius: '50%',
                    background: dot.color,
                    boxShadow: dot.isLatest ? `0 0 10px ${dot.color}` : undefined,
                    transform: 'translate(-50%, -50%)',
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* FOOTER DO CARD */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 'auto',
          paddingTop: 8,
          borderTop: '1px solid rgba(34, 43, 61, 0.45)',
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <FactoryStatusChip status={task.state} />
          <FactoryPhaseDots spans={spans} state={task.state} />
        </div>
        <span style={{ fontSize: 11, color: '#8b9cb6', fontFamily: 'ui-monospace, monospace' }}>
          {new Date(task.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
        </span>
      </div>

      {/* STAT CHIPS FOOTER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <FactoryStatChip kind="cost" value={0.0} />
        <FactoryStatChip kind="runtime" value={durationMs} />
        <FactoryStatChip kind="tools" value={totalTools} />
      </div>
    </div>
  )
}
