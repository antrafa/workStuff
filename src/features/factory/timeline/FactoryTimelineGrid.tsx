import type { FactoryTask } from '../../../../server/lib/factory/types.ts'
import { FactoryTimelineCard } from './FactoryTimelineCard'
import { Boxes } from 'lucide-react'
import { Empty } from '@/ui'

type Props = {
  tasks: FactoryTask[]
  onOpenTrace: (task: FactoryTask) => void
  onDelete?: (task: FactoryTask) => void
}

export function FactoryTimelineGrid({ tasks, onOpenTrace, onDelete }: Props) {
  if (tasks.length === 0) {
    return (
      <Empty icon={Boxes} title="Nenhuma execução registrada">
        Crie uma nova tarefa na fábrica para iniciar o fluxo determinístico e acompanhar os agentes em tempo real.
      </Empty>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Session counter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
        <span className="mono muted" style={{ fontSize: 14 }}>
          <b style={{ color: 'var(--ink)' }}>{tasks.length}</b> execuções gravadas
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
