// Funções de texto dos conversores, sem dependência: JSON, JSON → YAML e diff por linha.

export function formatJson(input: string, indent = 2): string {
  try {
    return JSON.stringify(JSON.parse(input), null, indent)
  } catch (e) {
    // A mensagem do JSON.parse varia entre motores e nem sempre traz a posição: ela sai de errorAt().
    const pos = errorAt(input)
    const before = input.slice(0, pos).split('\n')
    const found = pos < input.length ? `encontrei ${JSON.stringify(input[pos])}` : 'o texto terminou antes da hora'
    throw new Error(`JSON inválido na linha ${before.length}, coluna ${before[before.length - 1].length + 1}: ${found}`)
  }
}

// Índice do primeiro caractere que torna o JSON inválido. Só valida a estrutura; quem converte é o JSON.parse.
export function errorAt(s: string): number {
  let i = 0
  const ws = () => { while (i < s.length && ' \t\n\r'.includes(s[i])) i++ }
  const fail = (): never => { throw i }
  const literal = (word: string) => (s.startsWith(word, i) ? (i += word.length) : fail())
  const str = () => {
    i++
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\') i++
      else if (s[i] < ' ') fail()
      i++
    }
    if (s[i] !== '"') fail()
    i++
  }
  const num = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i))
    if (!m) fail()
    i += m![0].length
  }
  const value = (): void => {
    ws()
    const c = s[i]
    if (c === '{') {
      i++, ws()
      if (s[i] === '}') return void i++
      for (;;) {
        ws()
        if (s[i] !== '"') fail()
        str(), ws()
        if (s[i] !== ':') fail()
        i++, value(), ws()
        if (s[i] === ',') { i++; continue }
        if (s[i] === '}') return void i++
        fail()
      }
    }
    if (c === '[') {
      i++, ws()
      if (s[i] === ']') return void i++
      for (;;) {
        value(), ws()
        if (s[i] === ',') { i++; continue }
        if (s[i] === ']') return void i++
        fail()
      }
    }
    if (c === '"') return str()
    if (c === 't') return void literal('true')
    if (c === 'f') return void literal('false')
    if (c === 'n') return void literal('null')
    num()
  }
  try {
    value(), ws()
    return i < s.length ? i : s.length
  } catch (pos) {
    return pos as number
  }
}

// Escalar que o YAML leria como outro tipo (número, booleano, null, data) ou que quebra a sintaxe vai entre aspas.
const NEEDS_QUOTES = /^$|^[\s]|[\s]$|^(true|false|yes|no|on|off|null|~|y|n)$|^[-+]?(\d|\.\d)|^[-?:,[\]{}#&*!|>'"%@`]|: | #|\n/i

function scalar(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  const s = String(v)
  return NEEDS_QUOTES.test(s) ? JSON.stringify(s) : s
}

const isEmpty = (v: unknown) => (Array.isArray(v) ? v.length === 0 : typeof v === 'object' && v !== null && Object.keys(v).length === 0)

// Bloco de lista e mapa no estilo dos manifests do Kubernetes ("- " sem recuo extra embaixo da chave).
export function toYaml(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent)
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]`
    return value.map(item => {
      if (typeof item === 'object' && item !== null && !isEmpty(item)) {
        const inner = toYaml(item, indent + 2).slice(indent + 2)
        return `${pad}- ${inner}`
      }
      return `${pad}- ${isEmpty(item) ? (Array.isArray(item) ? '[]' : '{}') : scalar(item)}`
    }).join('\n')
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    if (!entries.length) return `${pad}{}`
    return entries.map(([k, v]) => {
      const key = scalar(k)
      if (typeof v === 'object' && v !== null && !isEmpty(v)) return `${pad}${key}:\n${toYaml(v, Array.isArray(v) ? indent : indent + 2)}`
      return `${pad}${key}: ${isEmpty(v) ? (Array.isArray(v) ? '[]' : '{}') : scalar(v)}`
    }).join('\n')
  }
  return pad + scalar(value)
}

export type DiffLine = { kind: 'igual' | 'removida' | 'adicionada'; text: string; a: number | null; b: number | null }

// Diff por linha pela maior subsequência comum. Quadrático: textos de até alguns milhares de linhas.
// ponytail: O(n·m) em memória, troca por Myers se precisar comparar arquivos grandes.
export const MAX_DIFF_LINES = 4000

export function lineDiff(left: string, right: string): DiffLine[] {
  const a = left.split('\n'), b = right.split('\n')
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) throw new Error(`texto grande demais: até ${MAX_DIFF_LINES} linhas de cada lado`)
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  }
  const out: DiffLine[] = []
  let i = 0, j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) out.push({ kind: 'igual', text: a[i], a: ++i, b: ++j })
    // Empate: a removida vem antes da adicionada, como no diff unificado.
    else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) out.push({ kind: 'removida', text: a[i], a: ++i, b: null })
    else out.push({ kind: 'adicionada', text: b[j], a: null, b: ++j })
  }
  return out
}

export type RegexMatch = { index: number; text: string; groups: string[] }

export function regexMatches(pattern: string, flags: string, input: string, max = 500): RegexMatch[] {
  const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
  const out: RegexMatch[] = []
  for (const m of input.matchAll(re)) {
    out.push({ index: m.index ?? 0, text: m[0], groups: m.slice(1).map(g => g ?? '') })
    if (out.length >= max) break
  }
  return out
}

export async function digest(algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512', text: string): Promise<string> {
  const bytes = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
}
