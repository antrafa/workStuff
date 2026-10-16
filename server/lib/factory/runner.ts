// Runner da Fábrica de Software com isolamento multi-provedor (Claude, Codex, Antigravity).

import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AGENT_HOME } from '../paths.ts'
import { which } from '../run.ts'
import { readSettings } from '../settingsStore.ts'
import type { ProviderId } from '../aiProviders.ts'
import type { AiEvent } from '../ai/events.ts'
import { MAX_ARG_BYTES, type CliSpec } from '../ai/args.ts'
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

// bwrap jail: the whole disk read-only, except the folders the CLI must write to.
// Claude in write mode runs with --dangerously-skip-permissions and Bash, so without
// the jail it could write anywhere the user can. Tested 2026-10-04: inside the jail
// Claude authenticates, writes in cwd and gets EROFS outside it.
export type Sandbox = { writable: string[]; tmpDir: string; env?: Record<string, string> }

// Runs fn with a fresh jail tmp dir, or with no sandbox when bwrap is missing (the caller decides
// whether that is acceptable). The tmp dir is always removed.
export async function withSandbox<T>(writable: string[], fn: (sandbox: Sandbox | undefined) => Promise<T>): Promise<T> {
  const tmpDir = (await which('bwrap')) ? mkdtempSync(join(tmpdir(), 'workstuff-factory-')) : null
  try {
    return await fn(tmpDir ? { writable: writable.filter(existsSync), tmpDir } : undefined)
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  }
}

export function jail(sandbox: Sandbox, cwd: string, bin: string, args: string[]): { bin: string; args: string[] } {
  return {
    bin: 'bwrap',
    args: [
      '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc',
      ...sandbox.writable.flatMap(dir => ['--bind', dir, dir]),
      // A worktree's .git file points git at its gitdir, and the pipeline runs git there outside
      // the jail: an agent that rewrote it would choose the config (and the commands) git runs.
      ...sandbox.writable.flatMap(dir => ['--ro-bind-try', join(dir, '.git'), join(dir, '.git')]),
      '--bind', sandbox.tmpDir, sandbox.tmpDir, '--setenv', 'TMPDIR', sandbox.tmpDir,
      ...Object.entries(sandbox.env ?? {}).flatMap(([k, v]) => ['--setenv', k, v]),
      // Own pid namespace: stopping bwrap also kills what the agent started (npm test, a build),
      // which would otherwise keep writing to the worktree after the stop
      '--unshare-pid', '--die-with-parent', '--chdir', cwd,
      bin, ...args,
    ],
  }
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
  },
): CliSpec {
  const { mode, cwd, sandbox } = options
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
    if (mode === 'read') return { bin: 'claude', args, stdin: options.prompt }
    if (!sandbox) throw new Error(say({ en: 'a write-mode agent only runs inside bwrap (bubblewrap), which is not available on this machine', pt: 'o agente com escrita só roda dentro do bwrap (bubblewrap), que não está disponível nesta máquina' }))
    return { ...jail(sandbox, cwd, 'claude', ['--dangerously-skip-permissions', ...args]), stdin: options.prompt }
  }

  if (provider === 'codex') {
    // In write mode bwrap is the sandbox: codex's own cannot start nested inside it (tested 2026-10-05),
    // and on its own it left the worktree's .git file writable.
    const args = ['exec', '--json', '--skip-git-repo-check']
    args.push(...(mode === 'read' ? ['-s', 'read-only'] : ['--dangerously-bypass-approvals-and-sandbox']))
    if (options.model) args.push('-m', options.model)
    if (options.effort) args.push('-c', `model_reasoning_effort="${options.effort}"`)
    args.push('-C', cwd, '-')
    if (mode === 'read') return { bin: 'codex', args, stdin: fullPrompt }
    if (!sandbox) throw new Error(say({ en: 'Codex in write mode only runs inside bwrap (bubblewrap), which is not available on this machine', pt: 'o Codex com escrita só roda dentro do bwrap (bubblewrap), que não está disponível nesta máquina' }))
    return { ...jail(sandbox, cwd, 'codex', args), stdin: fullPrompt }
  }

  // agy writes to disk even in --mode plan (see server/lib/ai/args.ts): it only ever runs jailed.
  if (!sandbox) throw new Error(say({ en: 'Antigravity only runs inside bwrap (bubblewrap), which is not available on this machine; pick Claude or Codex in Settings', pt: 'o Antigravity só roda dentro do bwrap (bubblewrap), que não está disponível nesta máquina; escolha Claude ou Codex em Configurações' }))
  const args = ['--output-format', 'stream-json']
  if (mode === 'read') args.push('--mode', 'plan')
  else args.push('--mode', 'accept-edits', '--dangerously-skip-permissions')
  if (options.model) args.push('--model', options.model)
  if (options.effort) args.push('--effort', options.effort)
  if (Buffer.byteLength(fullPrompt) > MAX_ARG_BYTES) throw new Error(say({ en: 'this prompt is too large for Antigravity (over 128 KiB); choose Claude or Codex in Settings', pt: 'este prompt é grande demais para o Antigravity (mais de 128 KiB); escolha Claude ou Codex em Configurações' }))
  args.push('-p', fullPrompt)
  return jail({ ...sandbox, writable: mode === 'write' ? sandbox.writable : sandbox.writable.filter(d => d !== cwd) }, cwd, 'agy', args)
}

// The jailed CLI gets its own config home next to the worktree, never the real ~/.claude or ~/.codex:
// a hook, MCP server or instruction file planted there would run outside the jail on the next run.
// It persists across the task's runs, so --resume finds the session. Only the login is copied in.
// ponytail: agy still writes the real ~/.gemini; give it its own home once its CLI supports one.
function prepareAgentHome(provider: ProviderId, cwd: string): { dirs: string[]; env: Record<string, string> } {
  if (provider === 'agy') return { dirs: [cwd, join(AGENT_HOME, '.gemini')], env: {} }
  const home = join(agentHomeOf(cwd), provider)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  if (provider === 'codex') {
    for (const file of ['auth.json', 'config.toml']) {
      const src = join(AGENT_HOME, '.codex', file)
      if (existsSync(src)) copyFileSync(src, join(home, file))
    }
    return { dirs: [cwd, home], env: { CODEX_HOME: home } }
  }
  copyClaudeLogin(join(AGENT_HOME, '.claude', '.credentials.json'), join(home, '.credentials.json'))
  return { dirs: [cwd, home], env: { CLAUDE_CONFIG_DIR: home } }
}

// Access token only: a refresh inside the jail could rotate the refresh token and log the user's
// own CLI out. The token lasts ~8 h and the user's CLI keeps renewing it.
function copyClaudeLogin(src: string, dest: string): void {
  if (!existsSync(src)) return
  try {
    const { refreshToken: _dropped, ...oauth } = JSON.parse(readFileSync(src, 'utf-8')).claudeAiOauth ?? {}
    writeFileSync(dest, JSON.stringify({ claudeAiOauth: oauth }), { mode: 0o600 })
  } catch (e) {
    throw new Error(say({ en: `could not copy the Claude login into the sandbox: ${(e as Error).message}`, pt: `não foi possível copiar o login do Claude para o sandbox: ${(e as Error).message}` }))
  }
}

export async function runFactoryAgent(options: FactoryRunOptions): Promise<RunResult> {
  const settings = readSettings()
  const provider = options.provider ?? settings.provider
  const model = options.model || settings.model
  const effort = options.effort || settings.effort
  const agent = options.agent ?? (options.agentId && SPECIALIZED_AGENTS[options.agentId])
  if (!agent) throw new Error(say({ en: 'factory run without an agent', pt: 'execução da fábrica sem agente' }))
  const mode = options.readOnly ? 'read' : agent.mode

  const needsJail = provider === 'agy' || mode === 'write'
  const home = needsJail ? prepareAgentHome(provider, options.cwd) : { dirs: [], env: {} }

  return withSandbox(home.dirs, async sandbox => {
    const cliSpec = buildFactoryArgs(provider, {
      prompt: options.prompt,
      systemPrompt: agent.systemPrompt,
      mode,
      cwd: options.cwd,
      model,
      effort,
      resumeSessionId: provider === 'claude' ? options.resumeSessionId : null,
      sandbox: needsJail && sandbox ? { ...sandbox, env: home.env } : undefined,
    })

    return spawnCli(provider, model, cliSpec, {
      prompt: options.prompt,
      cwd: options.cwd,
      signal: options.signal,
      onEvent: options.onEvent,
      timeoutMs: options.timeoutMs ?? 15 * 60_000,
      stallMs: 4 * 60_000,
    })
  })
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const base = { prompt: 'oi', systemPrompt: 'sys', cwd: '/wt' }
  const sandbox = { writable: ['/wt', '/home/u/.claude'], tmpDir: '/tmp/x' }

  const claudeRead = buildFactoryArgs('claude', { ...base, mode: 'read' })
  assert.equal(claudeRead.bin, 'claude')
  assert.ok(!claudeRead.args.includes('--dangerously-skip-permissions'))
  assert.equal(claudeRead.stdin, 'oi', 'o prompt vai pela entrada padrão')
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

  console.log('factory runner selfcheck: ok')
}
