// Autoteste do cron: node scripts/check-cron.ts
import assert from 'node:assert/strict'
import { nextCronRuns, parseCron } from '../src/features/tools/cron.ts'

const base = new Date(2026, 0, 1, 10, 7, 0) // 1º de janeiro de 2026, 10:07
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

const cases: [string, number, string[]][] = [
  ['*/15 * * * *', 3, ['2026-01-01 10:15', '2026-01-01 10:30', '2026-01-01 10:45']],
  ['0 3 * * *', 2, ['2026-01-02 03:00', '2026-01-03 03:00']],
  ['0 0 1 * *', 2, ['2026-02-01 00:00', '2026-03-01 00:00']],
  ['0 12 * * 1', 2, ['2026-01-05 12:00', '2026-01-12 12:00']],
  ['0 0 29 2 *', 1, ['2028-02-29 00:00']],
  ['0 0 1 * 0', 3, ['2026-01-04 00:00', '2026-01-11 00:00', '2026-01-18 00:00']],
  ['30 2 1-5 * *', 2, ['2026-01-02 02:30', '2026-01-03 02:30']],
  ['0 8,20 * * *', 2, ['2026-01-01 20:00', '2026-01-02 08:00']],
  ['0 9 * * 7', 1, ['2026-01-04 09:00']],
]
for (const [expr, n, expected] of cases) assert.deepEqual(nextCronRuns(expr, n, base).map(fmt), expected, expr)
for (const expr of ['* * * *', '60 * * * *', 'abc * * * *', '*/0 * * * *', '5-2 * * * *']) assert.throws(() => parseCron(expr), undefined, expr)

console.log(`check-cron: ok (${cases.length} válidas, 5 inválidas)`)
