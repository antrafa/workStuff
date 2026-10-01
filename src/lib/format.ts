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
  if (s < 60) return `há ${s}s`
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} d`
}

export function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString()
}
