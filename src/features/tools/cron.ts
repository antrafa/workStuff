// Cron: responde "esse agendamento roda quando?" listando as próximas execuções, em horário local.
// Autoteste: node scripts/check-cron.ts

type Field = { name: string; min: number; max: number }

const FIELDS: Field[] = [
  { name: 'minuto', min: 0, max: 59 },
  { name: 'hora', min: 0, max: 23 },
  { name: 'dia do mês', min: 1, max: 31 },
  { name: 'mês', min: 1, max: 12 },
  { name: 'dia da semana', min: 0, max: 7 },
]

// Quatro anos cobrem qualquer expressão válida, inclusive 29 de fevereiro.
const LIMIT_MINUTES = 4 * 366 * 24 * 60

function expandPart(part: string, { name, min, max }: Field) {
  const [range, stepText] = part.split('/')
  if (stepText !== undefined && !/^\d+$/.test(stepText)) throw new Error(`passo inválido em "${name}": ${part}`)
  const step = stepText ? Number(stepText) : 1
  if (step === 0) throw new Error(`passo não pode ser zero em "${name}"`)

  let start = min
  let end = max
  if (range !== '*') {
    const m = range.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) throw new Error(`valor inválido em "${name}": ${range}`)
    start = Number(m[1])
    end = m[2] !== undefined ? Number(m[2]) : stepText ? max : start
    if (start < min || end > max || start > end) throw new Error(`"${name}" fora do intervalo ${min}-${max}: ${range}`)
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
  if (parts.length !== 5) throw new Error(`esperados 5 campos (minuto hora dia mês dia-da-semana), recebidos ${parts.length}`)

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts.map((t, i) => expandField(t, FIELDS[i]))
  // 7 e 0 são ambos domingo no cron.
  if (dayOfWeek.has(7)) dayOfWeek.add(0)

  // Com os dois campos de dia restritos, o cron usa OU: "0 0 1 * 0" roda todo dia 1º E todo domingo.
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
