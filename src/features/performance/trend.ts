// Resumo por container a partir das amostras: último valor e tendência de memória.
// Sem imports de propósito: roda no navegador e no autoteste (node scripts/check-perf-trend.ts).

export type PodSample = {
  pod: string
  container: string
  cpuMilli: number | null
  cpuLimitMilli: number | null
  memBytes: number | null
  memLimitBytes: number | null
  restartCount: number
  lastTerminatedReason: string | null
  throttlePct: number | null
}
export type SampleLike = { t: string; pods: PodSample[] }

export type ContainerStat = {
  key: string
  pod: string
  container: string
  cpuMilli: number | null
  cpuPct: number | null
  memMiB: number | null
  memPct: number | null
  throttlePct: number | null
  restartCount: number
  memTrendMiBPerHour: number | null
  hoursToMemLimit: number | null
}

// Menos pontos que isso é ruído, não tendência; abaixo de 1 MiB/h é oscilação normal de heap.
const TREND_MIN_POINTS = 6
const TREND_MIN_MIB_PER_HOUR = 1

// Mínimos quadrados sobre (horas, MiB): dois pontos extremos pegariam qualquer pico como tendência.
export function memTrendMiBPerHour(points: { t: number; bytes: number }[]): number | null {
  if (points.length < TREND_MIN_POINTS) return null
  const t0 = points[0].t
  const xs = points.map(p => (p.t - t0) / 3_600_000)
  const ys = points.map(p => p.bytes / 1048576)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  let num = 0
  let den = 0
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my)
    den += (x - mx) ** 2
  })
  return den === 0 ? null : num / den
}

export function containerStats(samples: SampleLike[]): ContainerStat[] {
  const latest = new Map<string, ContainerStat>()
  const memSeries = new Map<string, { t: number; bytes: number }[]>()
  for (const s of samples) {
    for (const p of s.pods) {
      const key = `${p.pod}/${p.container}`
      latest.set(key, {
        key,
        pod: p.pod,
        container: p.container,
        cpuMilli: p.cpuMilli,
        cpuPct: p.cpuMilli != null && p.cpuLimitMilli ? Math.min(100, (p.cpuMilli / p.cpuLimitMilli) * 100) : null,
        memMiB: p.memBytes != null ? p.memBytes / 1048576 : null,
        memPct: p.memBytes != null && p.memLimitBytes ? Math.min(100, (p.memBytes / p.memLimitBytes) * 100) : null,
        throttlePct: p.throttlePct,
        restartCount: p.restartCount,
        memTrendMiBPerHour: null,
        hoursToMemLimit: null,
      })
      if (p.memBytes != null) {
        if (!memSeries.has(key)) memSeries.set(key, [])
        memSeries.get(key)!.push({ t: new Date(s.t).getTime(), bytes: p.memBytes })
      }
    }
  }
  for (const [key, points] of memSeries) {
    const stat = latest.get(key)!
    const trend = memTrendMiBPerHour(points)
    if (trend == null || trend < TREND_MIN_MIB_PER_HOUR) continue
    stat.memTrendMiBPerHour = trend
    const last = samples.at(-1)?.pods.find(p => `${p.pod}/${p.container}` === key)
    if (stat.memMiB != null && last?.memLimitBytes) {
      const free = last.memLimitBytes / 1048576 - stat.memMiB
      stat.hoursToMemLimit = free > 0 ? free / trend : 0
    }
  }
  return [...latest.values()]
}

export function formatHours(h: number) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.round(h)}h`
  return `${Math.round(h / 24)}d`
}
