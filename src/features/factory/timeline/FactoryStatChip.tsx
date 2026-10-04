import { Clock, Cpu, DollarSign, Layers, Terminal } from 'lucide-react'

type Props = {
  kind: 'runtime' | 'cost' | 'tokens' | 'tools' | 'model'
  value?: string | number | null
  compact?: boolean
}

function fmtDuration(ms?: number | null): string {
  if (ms == null || isNaN(ms)) return '0.00s'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${(ms / 1000).toFixed(1)}s`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  return `${min}m ${remSec < 10 ? '0' : ''}${remSec}s`
}

function fmtTokens(n?: number | null): string {
  if (n == null || isNaN(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function FactoryStatChip({ kind, value, compact = false }: Props) {
  let label = ''
  let Icon = Clock
  let color = 'var(--text)'

  switch (kind) {
    case 'runtime':
      label = typeof value === 'number' ? fmtDuration(value) : String(value ?? '0s')
      Icon = Clock
      color = '#aabdd5'
      break
    case 'cost':
      label = typeof value === 'number' ? `$${value.toFixed(4)}` : String(value ?? '$0.0000')
      Icon = DollarSign
      color = '#4ade80'
      break
    case 'tokens':
      label = typeof value === 'number' ? fmtTokens(value) : String(value ?? '0')
      Icon = Layers
      color = '#c89bff'
      break
    case 'tools':
      label = `${value ?? 0} ferramentas`
      Icon = Terminal
      color = '#5ad2dd'
      break
    case 'model':
      label = String(value ?? 'IA')
      Icon = Cpu
      color = '#6cb6ff'
      break
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        padding: compact ? '1px 6px' : '3px 10px',
        borderRadius: 6,
        background: 'rgba(19, 26, 38, 0.7)',
        border: '1px solid rgba(34, 43, 61, 0.8)',
        color,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: compact ? 11 : 12,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={compact ? 11 : 13} style={{ opacity: 0.8 }} />
      <span>{label}</span>
    </span>
  )
}
