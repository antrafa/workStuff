import { Clock, Cpu, Terminal } from 'lucide-react'
import { fmtDuration } from '../factoryRun'
import { tx } from '@/lib/i18n'

type Props = {
  kind: 'runtime' | 'tools' | 'model'
  value?: string | number | null
  compact?: boolean
}


export function FactoryStatChip({ kind, value, compact = false }: Props) {
  let label = ''
  let Icon = Clock
  let color = 'var(--ink)'

  switch (kind) {
    case 'runtime':
      label = typeof value === 'number' ? fmtDuration(value) : String(value ?? '0s')
      Icon = Clock
      color = 'var(--ink-2)'
      break
    case 'tools':
      label = tx({ en: `${value ?? 0} tools`, pt: `${value ?? 0} ferramentas` })
      Icon = Terminal
      color = 'var(--signal)'
      break
    case 'model':
      label = String(value ?? tx({ en: 'AI', pt: 'IA' }))
      Icon = Cpu
      color = 'var(--info)'
      break
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        padding: compact ? '1px 6px' : '3px 10px',
        borderRadius: 'var(--r-sm)',
        background: 'var(--surface-2)',
        border: '1px solid var(--line)',
        color,
        fontFamily: 'var(--font-mono)',
        fontSize: compact ? 11 : 12,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={compact ? 11 : 13} style={{ opacity: 0.8 }} />
      <span>{label}</span>
    </span>
  )
}
