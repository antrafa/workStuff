import { levelFor } from '@/lib/format'

export function Meter({ percent }: { percent: number }) {
  return (
    <div className={`meter ${levelFor(percent)}`} title={`${percent}%`}>
      <i style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  )
}
