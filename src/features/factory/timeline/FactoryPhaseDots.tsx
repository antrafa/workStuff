import type { ExecutionSpan } from '../../../../server/lib/factory/types.ts'

type Props = {
  spans?: ExecutionSpan[]
  state?: string
}

export function FactoryPhaseDots({ spans = [], state = 'intake' }: Props) {
  // Se houver spans gravadas, desenha cada span
  if (spans.length > 0) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {spans.map(span => {
          const isSuccess = span.status === 'success'
          const isRunning = span.status === 'running'
          const isFail = span.status === 'failed'

          return (
            <span
              key={span.id}
              title={`${span.name}: ${span.status}`}
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: isSuccess
                  ? 'var(--ok)'
                  : isRunning
                    ? 'var(--info)'
                    : isFail
                      ? 'var(--crit)'
                      : 'var(--line-hi)',
                transition: 'all 0.2s ease',
              }}
            />
          )
        })}
      </div>
    )
  }

  // Fallback baseado no estado da tarefa: 4 fases padrão (Entrada, Planejamento, Construção/QA, Revisão)
  const phases = ['intake', 'planning', 'building', 'review']
  const stateIdx = phases.indexOf(state)

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {phases.map((p, idx) => {
        const isPast = stateIdx > idx || state === 'done'
        const isCurrent = stateIdx === idx && state !== 'done'
        const isError = state === 'error'

        return (
          <span
            key={p}
            title={p}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: isError
                ? 'var(--crit)'
                : isPast
                  ? 'var(--ok)'
                  : isCurrent
                    ? 'var(--info)'
                    : 'var(--line-hi)',
            }}
          />
        )
      })}
    </div>
  )
}
