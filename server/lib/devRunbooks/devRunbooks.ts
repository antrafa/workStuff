// Runbooks de Dev: automações e procedimentos locais do dia a dia do desenvolvedor (Git, Docker, npm/pnpm).
// Comandos de leitura rodam direto; comandos que alteram o ambiente (escrita) exibem prévia e pedem confirmação.
// Autoteste: node server/lib/devRunbooks/devRunbooks.ts --selfcheck

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { DEFAULT_DEV_RUNBOOKS_DIR, dataFile, expandHome } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'

const execFileAsync = promisify(execFile)

export type Segment =
  | { type: 'text'; md: string }
  | { type: 'step'; id: number; line: string; vars: string[] }

const CONFIG = dataFile('dev-runbooks.json')
const AUDIT = dataFile('dev-runbook-audit.log')
export const DEFAULT_ROOT = DEFAULT_DEV_RUNBOOKS_DIR

export const readRoot = (): string => {
  const configured = readJson<{ root: string | null }>(CONFIG, { root: null }).root
  if (configured && configured !== 'default') {
    const expanded = expandHome(configured)
    if (statSync(expanded, { throwIfNoEntry: false })?.isDirectory()) {
      return expanded
    }
  }
  return DEFAULT_ROOT
}

export const saveRoot = (root: string) => writeJson(CONFIG, { root })

export function listDevRunbooks(root: string): { file: string; title: string }[] {
  const out: { file: string; title: string }[] = []
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) return out
  const walk = (dir: string, depth: number) => {
    if (depth > 3 || out.length >= 300) return
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const full = join(dir, name)
      const st = statSync(full, { throwIfNoEntry: false })
      if (st?.isDirectory()) walk(full, depth + 1)
      else if (st?.isFile() && name.endsWith('.md') && st.size < 512 * 1024) {
        const title = readFileSync(full, 'utf-8').match(/^#\s+(.+)$/m)?.[1]?.trim() ?? name.replace(/\.md$/, '')
        out.push({ file: relative(root, full), title })
      }
    }
  }
  walk(root, 0)
  return out
}

export function devRunbookPath(root: string, file: string): string {
  const full = resolve(root, file)
  if (!full.startsWith(resolve(root) + sep) || !full.endsWith('.md')) throw new Error('runbook fora da pasta configurada')
  return full
}

const VAR = /\{\{\s*([a-zA-Z][\w-]{0,40})\s*\}\}/g

export function parseDevRunbook(md: string): Segment[] {
  const out: Segment[] = []
  let text: string[] = []
  let id = 0
  const lines = md.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^```\s*(bash|sh|shell|console)?\s*$/)
    if (!fence || !fence[1]) {
      text.push(lines[i])
      continue
    }
    if (text.join('').trim()) out.push({ type: 'text', md: text.join('\n') })
    text = []

    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) {
      const line = lines[i].trim().replace(/^\$\s+/, '')
      if (!line || line.startsWith('#')) continue
      out.push({
        type: 'step',
        id: id++,
        line,
        vars: [...new Set([...line.matchAll(VAR)].map(m => m[1]))],
      })
    }
  }

  if (text.join('').trim()) out.push({ type: 'text', md: text.join('\n') })
  return out
}

const VALUE = /^[a-zA-Z0-9_./@:=-]{1,250}$/

export function fill(line: string, values: Record<string, string>): string {
  return line.replace(VAR, (_all, name: string) => {
    const v = values[name]
    if (v === undefined || v === '') throw new Error(`preencha a variável ${name}`)
    if (!VALUE.test(v)) throw new Error(`valor inválido para ${name}: use apenas letras, números e . _ - / @ : =`)
    return v
  })
}

const UNQUOTED_SHELL = /[;&|<>`$(){}\\*?~!#[\]\n\r]/
const ALLOWED_BINS = new Set([
  'git',
  'docker',
  'docker-compose',
  'npm',
  'pnpm',
  'yarn',
  'cargo',
  'mvn',
  'gradle',
  'go',
  'make',
])

export function tokenize(line: string): { tokens: string[] } | { error: string } {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false

  for (const ch of line) {
    if (quote === "'") {
      if (ch === "'") quote = null
      else current += ch
    } else if (quote === '"') {
      if (ch === '"') quote = null
      else if (ch === '`' || ch === '$' || ch === '\\' || ch === '\n' || ch === '\r') {
        return { error: `"${ch}" dentro de aspas duplas é interpretado pelo shell; use aspas simples` }
      } else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (/[ \t]/.test(ch)) {
      if (started || current) tokens.push(current)
      current = ''
      started = false
    } else if (UNQUOTED_SHELL.test(ch)) {
      return { error: `só um comando por vez, sem operadores de shell ("${ch}")` }
    } else {
      current += ch
      started = true
    }
  }
  if (quote) return { error: 'aspas sem fechamento' }
  if (started || current) tokens.push(current)
  return { tokens }
}

export type Classified =
  | { kind: 'read'; bin: string; args: string[] }
  | { kind: 'write'; bin: string; args: string[]; action: string }
  | { kind: 'blocked'; reason: string }

export function classify(line: string, values: Record<string, string>): Classified {
  let filled: string
  try {
    filled = fill(line, values)
  } catch (e) {
    return { kind: 'blocked', reason: (e as Error).message }
  }

  const trimmed = filled.trim().replace(/^\$\s+/, '')
  if (!trimmed) return { kind: 'blocked', reason: 'comando vazio' }

  const parsed = tokenize(trimmed)
  if ('error' in parsed) return { kind: 'blocked', reason: parsed.error }
  const { tokens } = parsed

  const bin = tokens[0]
  if (!ALLOWED_BINS.has(bin)) {
    return { kind: 'blocked', reason: `comando "${bin}" não permitido; use apenas ferramentas de dev homologadas (git, docker, npm, etc.)` }
  }

  const args = tokens.slice(1)
  const sub = args[0] ?? ''

  // Classificação Git
  if (bin === 'git') {
    if (['status', 'log', 'diff', 'show', 'remote', 'tag'].includes(sub)) {
      return { kind: 'read', bin, args }
    }
    if (sub === 'branch') {
      const isDelete = args.some(a => a === '-d' || a === '-D' || a.startsWith('--delete'))
      return isDelete ? { kind: 'write', bin, args, action: 'remover branch' } : { kind: 'read', bin, args }
    }
    if (sub === 'fetch') {
      const isPrune = args.some(a => a === '-p' || a === '--prune')
      return isPrune ? { kind: 'write', bin, args, action: 'limpar referências remotas' } : { kind: 'read', bin, args }
    }
    if (sub === 'stash') {
      const op = args[1] ?? 'list'
      if (['list', 'show'].includes(op)) return { kind: 'read', bin, args }
      return { kind: 'write', bin, args, action: `git stash ${op}` }
    }
    if (['rebase', 'merge', 'checkout', 'switch', 'restore', 'reset', 'commit', 'pull', 'push'].includes(sub)) {
      return { kind: 'write', bin, args, action: `git ${sub}` }
    }
    return { kind: 'read', bin, args }
  }

  // Classificação Docker
  if (bin === 'docker' || bin === 'docker-compose') {
    if (['ps', 'images', 'logs', 'stats', 'top', 'inspect', 'version', 'info'].includes(sub)) {
      return { kind: 'read', bin, args }
    }
    if (sub === 'system' && args[1] === 'df') return { kind: 'read', bin, args }
    if (sub === 'compose') {
      const op = args[1] ?? ''
      if (['ps', 'logs', 'config', 'version'].includes(op)) return { kind: 'read', bin, args }
      return { kind: 'write', bin, args, action: `docker compose ${op}` }
    }
    return { kind: 'write', bin, args, action: `${bin} ${sub}` }
  }

  // Classificação npm / pnpm / yarn
  if (bin === 'npm' || bin === 'pnpm' || bin === 'yarn') {
    if (['outdated', 'audit', 'list', 'ls', 'view', 'why'].includes(sub)) {
      return { kind: 'read', bin, args }
    }
    if (sub === 'cache' && args[1] === 'verify') return { kind: 'read', bin, args }
    return { kind: 'write', bin, args, action: `${bin} ${sub}` }
  }

  return { kind: 'read', bin, args }
}

export async function execDevCommand(bin: string, args: string[], cwd?: string, timeoutMs = 60_000): Promise<string> {
  const dir = cwd && statSync(cwd, { throwIfNoEntry: false })?.isDirectory() ? cwd : undefined
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      cwd: dir,
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    })
    return (stdout + (stderr ? `\n${stderr}` : '')).trim()
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    const out = (err.stdout ?? '') + (err.stderr ? `\n${err.stderr}` : '')
    throw new Error(out.trim() || err.message || 'comando falhou')
  }
}

export function audit(entry: { file: string; step: number; command: string; cwd?: string; kind: string; ok: boolean }) {
  mkdirSync(join(AUDIT, '..'), { recursive: true })
  appendFileSync(AUDIT, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n')
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const md = [
    '# Limpeza Git',
    'Procedimento de limpeza:',
    '```bash',
    '# comentário não vira passo',
    'git status -s',
    '$ git branch --merged main',
    'git branch -d {{branch}}',
    'docker compose down',
    'npm ci',
    'rm -rf /',
    '```',
  ].join('\n')

  const segs = parseDevRunbook(md)
  const steps = segs.filter(s => s.type === 'step') as Extract<Segment, { type: 'step' }>[]
  assert.equal(steps.length, 6)
  assert.equal(steps[0].line, 'git status -s')
  assert.equal(steps[1].line, 'git branch --merged main')
  assert.equal(steps[2].line, 'git branch -d {{branch}}')
  assert.deepEqual(steps[2].vars, ['branch'])

  assert.equal(classify(steps[0].line, {}).kind, 'read')
  assert.equal(classify(steps[1].line, {}).kind, 'read')
  assert.equal(classify(steps[2].line, { branch: 'feature-x' }).kind, 'write')
  assert.equal(classify(steps[3].line, {}).kind, 'write')
  assert.equal(classify(steps[4].line, {}).kind, 'write')
  assert.equal(classify(steps[5].line, {}).kind, 'blocked')

  // Testa rejeição de operadores de shell
  assert.equal(classify('git status; rm -rf .', {}).kind, 'blocked')
  assert.equal(classify('git log | grep erro', {}).kind, 'blocked')
  assert.equal(classify('git branch -d $(whoami)', {}).kind, 'blocked')

  const root = mkdtempSync(join(tmpdir(), 'dev-runbooks-'))
  try {
    mkdirSync(join(root, 'git'))
    writeFileSync(join(root, 'git', 'clean.md'), md)
    writeFileSync(join(root, 'leia.txt'), 'x')
    assert.deepEqual(listDevRunbooks(root), [{ file: join('git', 'clean.md'), title: 'Limpeza Git' }])
    assert.throws(() => devRunbookPath(root, '../fora.md'), /fora da pasta/)
    assert.throws(() => devRunbookPath(root, 'leia.txt'), /fora da pasta/)
    assert.equal(devRunbookPath(root, 'git/clean.md'), join(root, 'git', 'clean.md'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  assert.ok(statSync(DEFAULT_ROOT, { throwIfNoEntry: false })?.isDirectory(), 'pasta padrão de dev-runbooks existe')
  assert.ok(listDevRunbooks(DEFAULT_ROOT).length >= 6, 'dev runbooks padrão encontrados')
  assert.equal(readRoot(), DEFAULT_ROOT)
  console.log('dev-runbooks selfcheck: ok')
}

