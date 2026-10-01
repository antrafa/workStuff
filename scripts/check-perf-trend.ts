// Autoteste da tendência de memória da Performance: node scripts/check-perf-trend.ts
import assert from 'node:assert/strict'
import { containerStats, formatHours, memTrendMiBPerHour } from '../src/features/performance/trend.ts'

const MiB = 1048576
const at = (min: number) => new Date(Date.UTC(2026, 8, 30, 10, min)).toISOString()
// 10 pontos a cada 6 min, subindo 10 MiB por ponto = 100 MiB/h.
const pts = Array.from({ length: 10 }, (_, i) => ({ t: new Date(at(i * 6)).getTime(), bytes: (500 + i * 10) * MiB }))
assert.ok(Math.abs(memTrendMiBPerHour(pts)! - 100) < 1e-9)
assert.equal(memTrendMiBPerHour(pts.slice(0, 5)), null, 'poucos pontos não viram tendência')

const samples = pts.map((p, i) => ({ t: at(i * 6), pods: [{ pod: 'api-0', container: 'api', cpuMilli: 50, cpuLimitMilli: 200, memBytes: p.bytes, memLimitBytes: 1000 * MiB, restartCount: 0, lastTerminatedReason: null, throttlePct: 3 }] }))
const [s] = containerStats(samples)
assert.equal(s.cpuPct, 25)
assert.equal(Math.round(s.memMiB!), 590)
assert.ok(Math.abs(s.hoursToMemLimit! - 4.1) < 1e-9, 'faltam 410 MiB a 100 MiB/h')

const flat = containerStats(samples.map(x => ({ ...x, pods: x.pods.map(p => ({ ...p, memBytes: 500 * MiB })) })))
assert.equal(flat[0].memTrendMiBPerHour, null, 'memória estável não tem tendência')
assert.equal(formatHours(0.25), '15 min')
assert.equal(formatHours(9.4), '9h')
assert.equal(formatHours(72), '3d')
console.log('check-perf-trend: ok')
