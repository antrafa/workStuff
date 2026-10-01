import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }

export function Empty({ icon: Icon, title, children, action }: Props) {
  return (
    <div className="empty">
      <Icon size={34} strokeWidth={1.5} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
