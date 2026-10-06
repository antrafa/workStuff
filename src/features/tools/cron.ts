// Cron: answers "when does this schedule run?" by listing the next runs, in local time.
// Autoteste: node scripts/check-cron.ts
import { tx } from '../../lib/i18n.ts'

type Field = { name: string; min: number; max: number }

const FIELDS: Field[] = [
  { name: tx({ en: 'minute', pt: 'minuto' }), min: 0, max: 59 },
  { name: tx({ en: 'hour', pt: 'hora' }), min: 0, max: 23 },
  { name: tx({ en: 'day of month', pt: 'dia do mês' }), min: 1, max: 31 },
  { name: tx({ en: 'month', pt: 'mês' }), min: 1, max: 12 },
  { name: tx({ en: 'day of week', pt: 'dia da semana' }), min: 0, max: 7 },
]

// Four years cover any valid expression, February 29 included.
const LIMIT_MINUTES = 4 * 366 * 24 * 60

function expandPart(part: string, { name, min, max }: Field) {
  const [range, stepText] = part.split('/')
  if (stepText !== undefined && !/^\d+$/.test(stepText)) throw new Error(tx({ en: `invalid step in "${name}": ${part}`, pt: `passo inválido em "${name}": ${part}` }))
  const step = stepText ? Number(stepText) : 1
  if (step === 0) throw new Error(tx({ en: `step cannot be zero in "${name}"`, pt: `passo não pode ser zero em "${name}"` }))

  let start = min
  let end = max
  if (range !== '*') {
    const m = range.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) throw new Error(tx({ en: `invalid value in "${name}": ${range}`, pt: `valor inválido em "${name}": ${range}` }))
    start = Number(m[1])
    end = m[2] !== undefined ? Number(m[2]) : stepText ? max : start
    if (start < min || end > max || start > end) throw new Error(tx({ en: `"${name}" outside the range ${min}-${max}: ${range}`, pt: `"${name}" fora do intervalo ${min}-${max}: ${range}` }))
  }

  const values: number[] = []
  for (let v = start; v <= end; v += step) values.push(v)
  return values
}

function expandField(text: string, field: Field) {
  const values = new Set<number>()
  for (const part of text.split(',')) for (const v of expandPart(part, field)) values.add(v)
  return values
}

export function parseCron(expression: string) {
  const parts = expression.trim().split(/\s+/).filter(Boolean)
  if (parts.length !== 5) throw new Error(tx({ en: `expected 5 fields (minute hour day month day-of-week), got ${parts.length}`, pt: `esperados 5 campos (minuto hora dia mês dia-da-semana), recebidos ${parts.length}` }))

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts.map((t, i) => expandField(t, FIELDS[i]))
  // 7 and 0 are both Sunday in cron.
  if (dayOfWeek.has(7)) dayOfWeek.add(0)

  // With both day fields restricted, cron uses OR: "0 0 1 * 0" runs every 1st AND every Sunday.
  return { minute, hour, dayOfMonth, month, dayOfWeek, dayByOr: parts[2] !== '*' && parts[4] !== '*' }
}

type Cron = ReturnType<typeof parseCron>

function matches(d: Date, c: Cron) {
  if (!c.minute.has(d.getMinutes()) || !c.hour.has(d.getHours()) || !c.month.has(d.getMonth() + 1)) return false
  const inMonth = c.dayOfMonth.has(d.getDate())
  const inWeek = c.dayOfWeek.has(d.getDay())
  return c.dayByOr ? inMonth || inWeek : inMonth && inWeek
}

export function nextCronRuns(expression: string, count = 5, from = new Date()) {
  const cron = parseCron(expression)
  const d = new Date(from)
  d.setSeconds(0, 0)
  const runs: Date[] = []
  for (let i = 0; i < LIMIT_MINUTES && runs.length < count; i++) {
    d.setMinutes(d.getMinutes() + 1)
    if (matches(d, cron)) runs.push(new Date(d))
  }
  return runs
}
