// The Requests screen's text in and out: headers typed one per line, {{variables}} of an environment,
// a curl command pasted from the browser's DevTools or a README, and the same request back as curl.
// Pure functions, tested by scripts/check-http.ts.

export type HeaderPair = { name: string; value: string }
export type RequestDraft = { method: string; url: string; headers: string; body: string }

// "Name: value" per line; blank lines and lines starting with # are skipped (a quick way to switch one off)
export function parseHeaderLines(text: string): HeaderPair[] {
  return text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes(':')).map(l => {
    const at = l.indexOf(':')
    return { name: l.slice(0, at).trim(), value: l.slice(at + 1).trim() }
  })
}

// "name=value" per line, same rules as the headers
export function parseVars(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n').map(l => l.trim())) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const at = line.indexOf('=')
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return out
}

// {{name}} becomes the value; a name the environment lacks stays as typed and is reported
export function applyVars(text: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>()
  const out = text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, name: string) => {
    if (name in vars) return vars[name]
    missing.add(name)
    return whole
  })
  return { text: out, missing: [...missing] }
}

// Shell words the way bash splits a pasted command: quotes, backslash escapes and line continuations
export function shellWords(command: string): string[] {
  const words: string[] = []
  let word = ''
  let started = false
  let quote: '"' | "'" | null = null
  const text = command.replace(/\\\r?\n/g, ' ')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote === "'") {
      if (ch === "'") quote = null
      else word += ch
      continue
    }
    if (quote === '"') {
      if (ch === '"') quote = null
      else if (ch === '\\' && /["\\$`]/.test(text[i + 1] ?? '')) word += text[++i]
      else word += ch
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      started = true
    } else if (ch === '\\' && i + 1 < text.length) {
      word += text[++i]
      started = true
    } else if (/\s/.test(ch)) {
      if (started) words.push(word)
      word = ''
      started = false
    } else {
      word += ch
      started = true
    }
  }
  if (quote) throw new Error(`unclosed ${quote} quote`)
  if (started) words.push(word)
  return words
}

const DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode'])
// Flags with a value that change nothing in the request the screen sends
const IGNORED_WITH_VALUE = new Set(['-o', '--output', '-m', '--max-time', '--connect-timeout', '-w', '--write-out', '--retry', '-A'])

export function parseCurl(command: string): RequestDraft {
  const words = shellWords(command.trim())
  if (words[0] !== 'curl') throw new Error('the command must start with curl')
  let method = ''
  let url = ''
  const headers: string[] = []
  const data: string[] = []
  for (let i = 1; i < words.length; i++) {
    const w = words[i]
    const value = () => {
      if (i + 1 >= words.length) throw new Error(`${w} needs a value`)
      return words[++i]
    }
    if (w === '-X' || w === '--request') method = value().toUpperCase()
    else if (w === '-H' || w === '--header') headers.push(value())
    else if (DATA_FLAGS.has(w)) data.push(value())
    else if (w === '--json') {
      data.push(value())
      headers.push('Content-Type: application/json', 'Accept: application/json')
    } else if (w === '-u' || w === '--user') headers.push(`Authorization: Basic ${btoa(value())}`)
    else if (w === '-b' || w === '--cookie') headers.push(`Cookie: ${value()}`)
    else if (w === '-A' || w === '--user-agent') headers.push(`User-Agent: ${value()}`)
    else if (w === '--url') url = value()
    else if (IGNORED_WITH_VALUE.has(w)) value()
    else if (w.startsWith('-')) continue // -s, -L, -k, -i, --compressed, -v: no value, nothing to carry
    else if (!url) url = w
  }
  if (!url) throw new Error('no URL in the command')
  return { method: method || (data.length ? 'POST' : 'GET'), url, headers: headers.join('\n'), body: data.join('&') }
}

const quoted = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

export function toCurl(req: { method: string; url: string; headers: HeaderPair[]; body: string }): string {
  const parts = ['curl', ...(req.method === 'GET' ? [] : ['-X', req.method]), quoted(req.url)]
  for (const h of req.headers) parts.push('-H', quoted(`${h.name}: ${h.value}`))
  if (req.body && req.method !== 'GET' && req.method !== 'HEAD') parts.push('--data-raw', quoted(req.body))
  return parts.join(' ')
}
