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

  const isVersionQuery = args.length === 1 && ['-v', '--version', 'version'].includes(sub)
  if (isVersionQuery) return { kind: 'read', bin, args }
  if (bin === 'git') return classifyGit(args)

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
    const isAuditFix = sub === 'audit' && args[1] === 'fix'
    if (['outdated', 'audit', 'list', 'ls', 'view', 'why'].includes(sub) && !isAuditFix) {
      return { kind: 'read', bin, args }
    }
    if (sub === 'cache' && args[1] === 'verify') return { kind: 'read', bin, args }
    return { kind: 'write', bin, args, action: `${bin} ${sub}` }
  }

  // cargo, mvn, gradle, go e make compilam, baixam e gravam artefatos: nunca contam como leitura.
  return { kind: 'write', bin, args, action: `${bin} ${sub}`.trim() }
}

// Git: só o que comprovadamente não altera repositório, índice ou working tree roda sem confirmação.
// Subcomando desconhecido conta como escrita (cherry-pick, clean, bisect, add, revert…).
const GIT_READ = new Set([
  'status', 'log', 'diff', 'show', 'reflog', 'rev-parse', 'ls-files', 'blame', 'shortlog', 'describe',
  'merge-base', 'rev-list', 'cherry', 'grep', 'range-diff', 'count-objects', 'check-ignore', 'for-each-ref',
])
const BRANCH_WRITE_FLAG = /^(-d|-D|--delete|-m|-M|--move|-c|-C|--copy|-f|--force|-u|--set-upstream-to(=.*)?|--unset-upstream|--edit-description)$/
const BRANCH_FILTER_FLAG = new Set(['--merged', '--no-merged', '--contains', '--no-contains', '--points-at', '--sort', '--format'])

function isBranchListing(rest: string[]): boolean {
  if (rest.some(a => BRANCH_WRITE_FLAG.test(a))) return false
  if (rest.includes('--list') || rest.includes('-l')) return true
  return rest.every((a, i) => a.startsWith('-') || BRANCH_FILTER_FLAG.has(rest[i - 1]))
}

function classifyGit(args: string[]): Classified {
  const bin = 'git'
  const [sub = '', op] = args
  const read: Classified = { kind: 'read', bin, args }
  const write = (action: string): Classified => ({ kind: 'write', bin, args, action })

  if (GIT_READ.has(sub)) return read
  if (sub === 'fsck') return args.includes('--lost-found') ? write('git fsck --lost-found') : read
  if (sub === 'branch') {
    if (isBranchListing(args.slice(1))) return read
    return args.some(a => /^(-d|-D|--delete)$/.test(a)) ? write('remover branch') : write('criar ou alterar branch')
  }
  if (sub === 'worktree') return !op || op === 'list' ? read : write(`git worktree ${op}`)
  if (sub === 'stash') return op === 'list' || op === 'show' ? read : write(`git stash ${op ?? 'push'}`)
  if (sub === 'remote') return !op || op === '-v' || op === 'show' || op === 'get-url' ? read : write(`git remote ${op}`)
  if (sub === 'tag') return !op || ['-l', '--list', '-n', '--contains', '--points-at'].includes(op) ? read : write('criar ou remover tag')
  if (sub === 'fetch') return args.some(a => a === '-p' || a === '--prune') ? write('limpar referências remotas') : read
  return write(`git ${sub}`)
}

// Comando que depende da pasta do projeto (todos, exceto docker fora do compose, que é global ao daemon).
export const needsProject = (bin: string, args: string[]) => !(bin === 'docker' && args[0] !== 'compose')

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

  // Testa classificação de git worktree
  assert.equal(classify('git worktree list', {}).kind, 'read')
  assert.equal(classify('git worktree list --porcelain', {}).kind, 'read')
  assert.equal(classify('git worktree prune -v', {}).kind, 'write')
  assert.equal(classify('git worktree remove temp', {}).kind, 'write')
  assert.equal(classify('git worktree add -b feat temp origin/main', {}).kind, 'write')

  // Git: leitura só com subcomando conhecido; o resto pede confirmação
  for (const line of ['git reflog', 'git branch -vv', "git branch --list 'factory/*'", 'git branch --merged main', 'git stash list', 'git stash show -p 0', 'git remote -v', 'git tag -l', 'git ls-files --others --exclude-standard', 'git fetch origin main', 'git fsck --no-reflogs', 'npm version', 'mvn -v']) {
    assert.equal(classify(line, {}).kind, 'read', line)
  }
  for (const line of ['git stash', 'git branch nova', 'git branch -m velho novo', 'git cherry-pick abc', 'git clean -fd', 'git bisect start', 'git revert HEAD', 'git remote add x y', 'git tag v1', 'git tag -d v1', 'git add -A', 'npm audit fix', 'npm version patch', 'git fsck --lost-found', 'make', 'mvn test', 'go test ./...']) {
    assert.equal(classify(line, {}).kind, 'write', line)
  }
  assert.equal(needsProject('docker', ['system', 'df']), false)
  assert.equal(needsProject('docker', ['compose', 'ps']), true)
  assert.equal(needsProject('git', ['status']), true)

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
  assert.ok(listDevRunbooks(DEFAULT_ROOT).length >= 15, 'dev runbooks padrão encontrados')
  assert.equal(readRoot(), DEFAULT_ROOT)

  // Todo runbook do projeto precisa ter passos executáveis (nenhum bloqueado pelo classificador)
  const all = listDevRunbooks(DEFAULT_ROOT)
  const factoryCount = all.filter(r => r.file.startsWith('factory/')).length
  assert.ok(factoryCount >= 14, `esperado >= 14 runbooks de fábrica, encontrados ${factoryCount}`)
  for (const r of all) {
    const raw = readFileSync(devRunbookPath(DEFAULT_ROOT, r.file), 'utf-8')
    const segs = parseDevRunbook(raw)
    const steps = segs.filter(s => s.type === 'step') as Extract<Segment, { type: 'step' }>[]
    assert.ok(steps.length >= 2, `${r.file} tem poucos passos`)
    for (const s of steps) {
      const mockVals = Object.fromEntries(s.vars.map(v => [v, 'test_val']))
      const cl = classify(s.line, mockVals)
      assert.notEqual(cl.kind, 'blocked', `${r.file}: passo bloqueado: ${s.line} (${cl.kind === 'blocked' ? cl.reason : ''})`)
    }
  }

  console.log('dev-runbooks selfcheck: ok')
}

