import { tx } from './i18n.ts'

export function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0
}

export function levelFor(percent: number): '' | 'warn' | 'crit' {
  if (percent >= 85) return 'crit'
  if (percent >= 65) return 'warn'
  return ''
}

export function relTime(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  const [n, unit] = s < 60 ? [s, 's'] : s < 3600 ? [Math.round(s / 60), ' min'] : s < 86400 ? [Math.round(s / 3600), ' h'] : [Math.round(s / 86400), ' d']
  return tx({ en: `${n}${unit} ago`, pt: `há ${n}${unit}` })
}

export function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString()
}
