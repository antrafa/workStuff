// Runner da Fábrica de Software com isolamento multi-provedor (Claude, Codex, Antigravity).

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AGENT_HOME } from '../paths.ts'
import { readSettings, setSettingsOverride } from '../settingsStore.ts'
import type { ProviderId } from '../aiProviders.ts'
import type { AiEvent } from '../ai/events.ts'
import { MAX_ARG_BYTES, type CliSpec } from '../ai/args.ts'
import { copyClaudeLogin, prepareReadJail, seedConfigHome, wrapReadJail, type ReadJail } from '../ai/jail.ts'
import { detectSandboxDriver, wrapCommand, type SandboxDriver } from '../sandbox/sandbox.ts'
import { spawnCli, type RunResult } from '../ai/runner.ts'
import { SPECIALIZED_AGENTS } from './agents.ts'
import type { SpecializedAgentId } from './types.ts'
import { agentHomeOf } from './worktree.ts'
import { say } from '../i18n.ts'

const READ_TOOLS = ['Read', 'Grep', 'Glob']
const WRITE_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash']

export type FactoryRunOptions = {
  agentId?: SpecializedAgentId
  // An agent outside the pipeline (ideation), given whole instead of looked up by id
  agent?: { mode: 'read' | 'write'; systemPrompt: string }
  prompt: string
  cwd: string
  provider?: ProviderId
  model?: string
  effort?: string
  // Standalone runs point at the user's own repository, which must never be written to.
  readOnly?: boolean
  // Claude only: continue this CLI session, so a correction keeps what the agent already learned
  resumeSessionId?: string | null
  signal?: AbortSignal
  onEvent: (e: AiEvent) => void
  timeoutMs?: number
}

// Sandbox jail (bwrap on Linux, sandbox-exec on macOS): the whole disk read-only, except the folders the CLI must write to.
// Claude in write mode runs with --dangerously-skip-permissions and Bash, so without
// the jail it could write anywhere the user can.
export type Sandbox = { writable: string[]; tmpDir: string; env?: Record<string, string>; driver?: SandboxDriver }

// Runs fn with a fresh jail tmp dir, or with no sandbox when no driver is available (the caller decides
// whether that is acceptable). The tmp dir is always removed.
export async function withSandbox<T>(writable: string[], fn: (sandbox: Sandbox | undefined) => Promise<T>): Promise<T> {
  const driver = await detectSandboxDriver()
  const tmpDir = driver ? mkdtempSync(join(tmpdir(), 'workstuff-factory-')) : null
  try {
    return await fn(tmpDir ? { writable: writable.filter(existsSync), tmpDir, driver } : undefined)
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  }
}

export function jail(sandbox: Sandbox, cwd: string, bin: string, args: string[]): { bin: string; args: string[] } {
  return wrapCommand(
    sandbox.driver ?? 'bwrap',
    { writable: sandbox.writable, tmpDir: sandbox.tmpDir, cwd, env: sandbox.env, protectGit: true },
    bin,
    args,
  )
}

export function buildFactoryArgs(
  provider: ProviderId,
  options: {
    prompt: string
    systemPrompt: string
    mode: 'read' | 'write'
    cwd: string
    model?: string
    effort?: string
    resumeSessionId?: string | null
    sandbox?: Sandbox
    // Read mode: the read jail (server/lib/ai/jail.ts), where the agent sees only its worktree
    readJail?: ReadJail
  },
): CliSpec {
  const { mode, cwd, sandbox, readJail } = options
  const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`

  if (provider === 'claude') {
    const tools = mode === 'write' ? WRITE_TOOLS : READ_TOOLS
    const args = ['--output-format', 'stream-json', '--verbose', '--include-partial-messages']
    if (options.model) args.push('--model', options.model)
    if (options.effort) args.push('--effort', options.effort)
    if (options.resumeSessionId) args.push('--resume', options.resumeSessionId)
    args.push('--tools', ...tools, '--allowedTools', ...tools, '--strict-mcp-config')
    // The prompt goes on stdin: as one argument it fails with E2BIG past 128 KiB (see server/lib/ai/args.ts)
    args.push('--append-system-prompt', options.systemPrompt, '-p')
    if (mode === 'read') return readJail ? { ...wrapReadJail(readJail, cwd, 'claude', args), stdin: options.prompt } : { bin: 'claude', args, stdin: options.prompt }
    if (sandbox) return { ...jail(sandbox, cwd, 'claude', ['--dangerously-skip-permissions', ...args]), stdin: options.prompt }
    const policy = readSettings().sandboxPolicy
    if (policy === 'relaxed') return { bin: 'claude', args: ['--dangerously-skip-permissions', ...args], stdin: options.prompt }
    throw new Error(say({
      en: 'a write-mode agent only runs inside a sandbox (bwrap or sandbox-exec), which is not available on this machine',
      pt: 'o agente com escrita só roda dentro de uma sandbox (bwrap ou sandbox-exec), que não está disponível nesta máquina',
    }))
  }

  if (provider === 'codex') {
    // In write mode the sandbox isolates codex: codex's own cannot start nested inside it (tested 2026-10-05),
    // and on its own it left the worktree's .git file writable.
    const args = ['exec', '--json', '--skip-git-repo-check']
    args.push(...(mode === 'read' ? ['-s', 'read-only'] : ['--dangerously-bypass-approvals-and-sandbox']))
    if (options.model) args.push('-m', options.model)
    if (options.effort) args.push('-c', `model_reasoning_effort="${options.effort}"`)
    args.push('-C', cwd, '-')
    if (mode === 'read') return readJail ? { ...wrapReadJail(readJail, cwd, 'codex', args), stdin: fullPrompt } : { bin: 'codex', args, stdin: fullPrompt }
    if (sandbox) return { ...jail(sandbox, cwd, 'codex', args), stdin: fullPrompt }
    const policy = readSettings().sandboxPolicy
    if (policy === 'relaxed') return { bin: 'codex', args, stdin: fullPrompt }
    throw new Error(say({
      en: 'Codex in write mode only runs inside a sandbox (bwrap or sandbox-exec), which is not available on this machine',
      pt: 'o Codex com escrita só roda dentro de uma sandbox (bwrap ou sandbox-exec), que não está disponível nesta máquina',
    }))
  }

  // agy writes to disk even in --mode plan (see server/lib/ai/args.ts): it only ever runs jailed.
  const args = ['--output-format', 'stream-json']
  if (mode === 'read') args.push('--mode', 'plan')
  else args.push('--mode', 'accept-edits', '--dangerously-skip-permissions')
  if (options.model) args.push('--model', options.model)
  if (options.effort) args.push('--effort', options.effort)
  if (Buffer.byteLength(fullPrompt) > MAX_ARG_BYTES) throw new Error(say({ en: 'this prompt is too large for Antigravity (over 128 KiB); choose Claude or Codex in Settings', pt: 'este prompt é grande demais para o Antigravity (mais de 128 KiB); escolha Claude ou Codex em Configurações' }))
  args.push('-p', fullPrompt)

  if (mode === 'read' && readJail) return wrapReadJail(readJail, cwd, 'agy', args)
  if (sandbox) {
    return jail(mode === 'write' ? sandbox : { ...sandbox, writable: sandbox.writable.filter(d => d !== cwd) }, cwd, 'agy', args)
  }
  const policy = readSettings().sandboxPolicy
  if (policy === 'relaxed') return { bin: 'agy', args }
  throw new Error(say({
    en: 'Antigravity only runs inside a sandbox (bwrap or sandbox-exec), which is not available on this machine; pick Claude or Codex in Settings',
    pt: 'o Antigravity só roda dentro de uma sandbox (bwrap ou sandbox-exec), que não está disponível nesta máquina; escolha Claude ou Codex em Configurações',
  }))
}

// The jailed CLI gets its own config home next to the worktree, never the real ~/.claude or ~/.codex:
// a hook, MCP server or instruction file planted there would run outside the jail on the next run.
// It persists across the task's runs, so --resume finds the session. Only the login is copied in.
// ponytail: agy still writes the real ~/.gemini; give it its own home once its CLI supports one.
function prepareAgentHome(provider: ProviderId, cwd: string): { dirs: string[]; env: Record<string, string> } {
  if (provider === 'agy') return { dirs: [cwd, join(AGENT_HOME, '.gemini')], env: {} }
  const home = join(agentHomeOf(cwd), provider)
  return { dirs: [cwd, home], env: seedConfigHome(provider, home) }
}

// Access token only: a refresh inside the jail could rotate the refresh token and log the user's
// own CLI out. The token lasts ~8 h and the user's CLI keeps renewing it.

export async function runFactoryAgent(options: FactoryRunOptions): Promise<RunResult> {
  const settings = readSettings()
  const provider = options.provider ?? settings.provider
  const model = options.model || settings.model
  const effort = options.effort || settings.effort
  const agent = options.agent ?? (options.agentId && SPECIALIZED_AGENTS[options.agentId])
  if (!agent) throw new Error(say({ en: 'factory run without an agent', pt: 'execução da fábrica sem agente' }))
  const mode = options.readOnly ? 'read' : agent.mode

  const spawnOptions = {
    prompt: options.prompt,
    cwd: options.cwd,
    signal: options.signal,
    onEvent: options.onEvent,
    timeoutMs: options.timeoutMs ?? 15 * 60_000,
    stallMs: 4 * 60_000,
  }
  const argsFor = (extra: { sandbox?: Sandbox; readJail?: ReadJail }) => buildFactoryArgs(provider, {
    prompt: options.prompt,
    systemPrompt: agent.systemPrompt,
    mode,
    cwd: options.cwd,
    model,
    effort,
    resumeSessionId: provider === 'claude' ? options.resumeSessionId : null,
    ...extra,
  })

  // Read mode sees only its worktree. The config home stays next to the worktree so --resume finds
  // the session; without bwrap it runs as before (agy then refuses in buildFactoryArgs).
  if (mode === 'read') {
    const prepared = await prepareReadJail(provider, [options.cwd], join(agentHomeOf(options.cwd), provider))
    try {
      return await spawnCli(provider, model, argsFor({ readJail: prepared?.jail }), { ...spawnOptions, env: prepared?.jail.env })
    } finally {
      prepared?.cleanup()
    }
  }

  const home = prepareAgentHome(provider, options.cwd)
  return withSandbox(home.dirs, async sandbox => spawnCli(provider, model, argsFor({ sandbox: sandbox ? { ...sandbox, env: home.env } : undefined }), { ...spawnOptions, env: home.env }))
}


if (import.meta.main && process.argv.includes('--selfcheck')) {
  const base = { prompt: 'oi', systemPrompt: 'sys', cwd: '/wt' }
  const sandbox = { writable: ['/wt', '/home/u/.claude'], tmpDir: '/tmp/x' }

  const claudeRead = buildFactoryArgs('claude', { ...base, mode: 'read' })
  assert.equal(claudeRead.bin, 'claude')
  assert.ok(!claudeRead.args.includes('--dangerously-skip-permissions'))
  assert.equal(claudeRead.stdin, 'oi', 'o prompt vai pela entrada padrão')
  const readJail = { home: '/home/u', tmpDir: '/tmp/r', visible: ['/wt'], binDirs: ['/usr/bin'], writable: ['/wt.agent-home/claude'], env: {} }
  const claudeJailed = buildFactoryArgs('claude', { ...base, mode: 'read', readJail })
  assert.equal(claudeJailed.bin, 'bwrap', 'leitura com bwrap roda no jail de leitura')
  assert.ok(claudeJailed.args.join(' ').includes('--tmpfs /home/u'), 'o agente de leitura não vê a home')
  assert.ok(!claudeJailed.args.join(' ').includes('--bind /wt /wt'), 'a worktree fica só leitura')
  assert.equal(buildFactoryArgs('agy', { ...base, mode: 'read', readJail }).bin, 'bwrap', 'agy em leitura usa o jail de leitura')
  assert.ok(!claudeRead.args.includes('oi'), 'o prompt não vira argumento')

  const claudeWrite = buildFactoryArgs('claude', { ...base, mode: 'write', sandbox })
  assert.equal(claudeWrite.bin, 'bwrap', 'claude com escrita sempre dentro do bwrap')
  assert.deepEqual(claudeWrite.args.slice(0, 3), ['--ro-bind', '/', '/'])
  assert.ok(claudeWrite.args.includes('--unshare-pid'), 'parar o jail mata os processos que o agente iniciou')
  assert.ok(claudeWrite.args.includes('--dangerously-skip-permissions'))
  assert.throws(() => buildFactoryArgs('claude', { ...base, mode: 'write' }), /bwrap/, 'sem bwrap, recusa')
  const resumed = buildFactoryArgs('claude', { ...base, mode: 'read', resumeSessionId: 's1' }).args
  assert.equal(resumed[resumed.indexOf('--resume') + 1], 's1', 'correção continua a mesma sessão')

  const gitIdx = claudeWrite.args.indexOf('/wt/.git')
  assert.equal(claudeWrite.args[gitIdx - 1], '--ro-bind-try', '.git da worktree somente leitura no jail')
  const withEnv = buildFactoryArgs('claude', { ...base, mode: 'write', sandbox: { ...sandbox, env: { CLAUDE_CONFIG_DIR: '/wt.agent-home/claude' } } }).args
  assert.equal(withEnv[withEnv.indexOf('CLAUDE_CONFIG_DIR') + 1], '/wt.agent-home/claude', 'config própria do agente')

  assert.ok(buildFactoryArgs('codex', { ...base, mode: 'read' }).args.includes('read-only'))
  const codexWrite = buildFactoryArgs('codex', { ...base, mode: 'write', sandbox })
  assert.equal(codexWrite.bin, 'bwrap', 'codex com escrita dentro do bwrap')
  assert.equal(codexWrite.args.at(-1), '-')
  assert.equal(codexWrite.stdin, 'sys\n\noi', 'o prompt atravessa o bwrap pela entrada padrão')
  assert.throws(() => buildFactoryArgs('codex', { ...base, mode: 'write' }), /bwrap/, 'codex com escrita sem bwrap, recusa')

  const login = mkdtempSync(join(tmpdir(), 'workstuff-runner-test-'))
  try {
    writeFileSync(join(login, 'in.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, mcpOAuth: { x: 1 } }))
    copyClaudeLogin(join(login, 'in.json'), join(login, 'out.json'))
    assert.deepEqual(JSON.parse(readFileSync(join(login, 'out.json'), 'utf-8')), { claudeAiOauth: { accessToken: 'a', expiresAt: 1 } }, 'só o token de acesso entra no sandbox')
  } finally {
    rmSync(login, { recursive: true, force: true })
  }

  const agyRead = buildFactoryArgs('agy', { ...base, mode: 'read', sandbox })
  assert.equal(agyRead.bin, 'bwrap')
  assert.ok(agyRead.args.includes('plan'))
  assert.ok(!agyRead.args.join(' ').includes('--bind /wt /wt'), 'agy em leitura não recebe a pasta como gravável')
  const agyWrite = buildFactoryArgs('agy', { ...base, mode: 'write', sandbox })
  assert.ok(agyWrite.args.includes('accept-edits'))
  assert.ok(agyWrite.args.join(' ').includes('--bind /wt /wt'))
  assert.throws(() => buildFactoryArgs('agy', { ...base, mode: 'read' }), /bwrap/, 'agy sem bwrap, recusa')

  // sandbox-exec driver tests
  const execSandbox: Sandbox = { ...sandbox, driver: 'sandbox-exec' }
  const claudeExec = buildFactoryArgs('claude', { ...base, mode: 'write', sandbox: execSandbox })
  assert.equal(claudeExec.bin, 'sandbox-exec')
  assert.equal(claudeExec.args[0], '-p')
  assert.ok(claudeExec.args[1].includes('(deny file-write*)'))
  assert.equal(claudeExec.args[2], 'claude')

  const codexExec = buildFactoryArgs('codex', { ...base, mode: 'write', sandbox: execSandbox })
  assert.equal(codexExec.bin, 'sandbox-exec')
  assert.equal(codexExec.args[2], 'codex')

  const agyExecWrite = buildFactoryArgs('agy', { ...base, mode: 'write', sandbox: execSandbox })
  assert.equal(agyExecWrite.bin, 'sandbox-exec')
  assert.equal(agyExecWrite.args[2], 'agy')

  const execReadJail = { ...readJail, driver: 'sandbox-exec' as const }
  const claudeExecRead = buildFactoryArgs('claude', { ...base, mode: 'read', readJail: execReadJail })
  assert.equal(claudeExecRead.bin, 'sandbox-exec')
  assert.equal(buildFactoryArgs('agy', { ...base, mode: 'read', readJail: execReadJail }).bin, 'sandbox-exec')

  // Relaxed mode tests
  setSettingsOverride({ sandboxPolicy: 'relaxed' })
  try {
    const claudeRelaxed = buildFactoryArgs('claude', { ...base, mode: 'write' })
    assert.equal(claudeRelaxed.bin, 'claude')
    assert.ok(claudeRelaxed.args.includes('--dangerously-skip-permissions'))

    const codexRelaxed = buildFactoryArgs('codex', { ...base, mode: 'write' })
    assert.equal(codexRelaxed.bin, 'codex')
    assert.ok(codexRelaxed.args.includes('--dangerously-bypass-approvals-and-sandbox'))

    const agyRelaxed = buildFactoryArgs('agy', { ...base, mode: 'write' })
    assert.equal(agyRelaxed.bin, 'agy')
    assert.ok(agyRelaxed.args.includes('accept-edits'))

    const agyRelaxedRead = buildFactoryArgs('agy', { ...base, mode: 'read' })
    assert.equal(agyRelaxedRead.bin, 'agy')
    assert.ok(agyRelaxedRead.args.includes('plan'))
  } finally {
    setSettingsOverride(null)
  }

  console.log('factory runner selfcheck: ok')
}
