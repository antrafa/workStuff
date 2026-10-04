import { SPAN_STATUS, TASK_STATE } from '../factoryRun'
import { RUNNING_STATES, type ExecutionSpan, type FactoryTaskState } from '../../../../server/lib/factory/types.ts'

type Props =
  | { state: FactoryTaskState; executing?: boolean; span?: never }
  | { span: ExecutionSpan['status']; state?: never; executing?: never }

// Badge of a task state or of a span status, from the single label map in factoryRun.
export function FactoryStatusChip(props: Props) {
  const entry = props.span ? SPAN_STATUS[props.span] : TASK_STATE[props.state]
  const live = props.span ? props.span === 'running' : props.executing || RUNNING_STATES.includes(props.state)
  const tone = entry?.tone ?? 'muted'
  return (
    <span className={tone === 'muted' ? 'badge' : `badge badge-${tone}`} style={{ gap: 6 }}>
      {live && <span className="live-dot" />}
      {entry?.label ?? props.state ?? props.span}
    </span>
  )
}
