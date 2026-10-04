import type { FactoryTask } from '../../../../server/lib/factory/types.ts'
import { FactoryTimelineCard } from './FactoryTimelineCard'
import { Boxes } from 'lucide-react'

type Props = {
  tasks: FactoryTask[]
  onOpenTrace: (task: FactoryTask) => void
  onDelete?: (task: FactoryTask) => void
}

export function FactoryTimelineGrid({ tasks, onOpenTrace, onDelete }: Props) {
  if (tasks.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'linear-gradient(180deg, #10141f 0%, #0b0f18 100%)',
          borderRadius: 16,
          border: '1px solid #222b3d',
        }}
      >
        <Boxes size={48} style={{ color: '#8b9cb6', margin: '0 auto 16px', opacity: 0.7 }} />
        <h3 style={{ fontSize: 18, color: '#f2f5fa', margin: '0 0 8px' }}>Nenhuma execução registrada</h3>
        <p style={{ color: '#8b9cb6', fontSize: 14, maxWidth: 440, margin: '0 auto' }}>
          Crie uma nova tarefa na fábrica para iniciar o fluxo determinístico e acompanhar os agentes em tempo real.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Session counter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
        <span style={{ fontSize: 14, fontFamily: 'ui-monospace, monospace', color: '#8b9cb6' }}>
          <b style={{ color: '#f2f5fa' }}>{tasks.length}</b> execuções gravadas
        </span>
      </div>

      {/* Grid of timeline cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 20,
        }}
      >
        {tasks.map(task => (
          <FactoryTimelineCard
            key={task.id}
            task={task}
            onOpenTrace={onOpenTrace}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
