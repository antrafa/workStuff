// Runner da Fábrica de Software com isolamento multi-provedor (Claude, Codex, Antigravity).

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { which } from '../run.ts'
import { readSettings } from '../settingsStore.ts'
import type { ProviderId } from '../aiProviders.ts'
import type { AiEvent } from '../ai/events.ts'
import { spawnCli, type RunResult } from '../ai/runner.ts'
import { SPECIALIZED_AGENTS } from './agents.ts'
import type { SpecializedAgentId } from './types.ts'

const READ_TOOLS = ['Read', 'Grep', 'Glob']
const WRITE_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash']

export type FactoryRunOptions = {
  agentId: SpecializedAgentId
  prompt: string
  cwd: string
  provider?: ProviderId
  model?: string
  effort?: string
  // Standalone runs point at the user's own repository, which must never be written to.
  readOnly?: boolean
  signal?: AbortSignal
  onEvent: (e: AiEvent) => void
  timeoutMs?: number
}

// bwrap jail: the whole disk read-only, except the folders the CLI must write to.
// Claude in write mode runs with --dangerously-skip-permissions and Bash, so without
// the jail it could write anywhere the user can. Tested 2026-10-04: inside the jail
// Claude authenticates, writes in cwd and gets EROFS outside it.
export type Sandbox = { writable: string[]; tmpDir: string }

function jail(sandbox: Sandbox, cwd: string, bin: string, args: string[]): { bin: string; args: string[] } {
  return {
    bin: 'bwrap',
    args: [
      '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc',
      ...sandbox.writable.flatMap(dir => ['--bind', dir, dir]),
      '--bind', sandbox.tmpDir, sandbox.tmpDir, '--setenv', 'TMPDIR', sandbox.tmpDir,
      '--die-with-parent', '--chdir', cwd,
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
    sandbox?: Sandbox
  },
): { bin: string; args: string[] } {
  const { mode, cwd, sandbox } = options
  const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`

  if (provider === 'claude') {
    const tools = mode === 'write' ? WRITE_TOOLS : READ_TOOLS
    const args = ['--output-format', 'stream-json', '--verbose', '--include-partial-messages']
    if (options.model) args.push('--model', options.model)
    if (options.effort) args.push('--effort', options.effort)
    args.push('--tools', ...tools, '--allowedTools', ...tools, '--strict-mcp-config')
    args.push('--append-system-prompt', options.systemPrompt, '-p', options.prompt)
    if (mode === 'read') return { bin: 'claude', args }
    if (!sandbox) throw new Error('o agente com escrita só roda dentro do bwrap (bubblewrap), que não está disponível nesta máquina')
    return jail(sandbox, cwd, 'claude', ['--dangerously-skip-permissions', ...args])
  }

  if (provider === 'codex') {
    // workspace-write is codex's own OS sandbox: writes only inside -C.
    const args = ['exec', '--json', '--skip-git-repo-check', '-s', mode === 'read' ? 'read-only' : 'workspace-write']
    if (options.model) args.push('-m', options.model)
    if (options.effort) args.push('-c', `model_reasoning_effort="${options.effort}"`)
    args.push('-C', cwd, fullPrompt)
    return { bin: 'codex', args }
  }

  // agy writes to disk even in --mode plan (see server/lib/ai/args.ts): it only ever runs jailed.
  if (!sandbox) throw new Error('o Antigravity só roda dentro do bwrap (bubblewrap), que não está disponível nesta máquina; escolha Claude ou Codex em Configurações')
  const args = ['--output-format', 'stream-json']
  if (mode === 'read') args.push('--mode', 'plan')
  else args.push('--mode', 'accept-edits', '--dangerously-skip-permissions')
  if (options.model) args.push('--model', options.model)
  if (options.effort) args.push('--effort', options.effort)
  args.push('-p', fullPrompt)
  return jail({ ...sandbox, writable: mode === 'write' ? sandbox.writable : sandbox.writable.filter(d => d !== cwd) }, cwd, 'agy', args)
}

function sandboxDirs(provider: ProviderId, cwd: string): string[] {
  if (provider === 'agy') return [cwd, join(homedir(), '.gemini')]
  return [cwd, join(homedir(), '.claude'), join(homedir(), '.claude.json')].filter(existsSync)
}

export async function runFactoryAgent(options: FactoryRunOptions): Promise<RunResult> {
  const settings = readSettings()
  const provider = options.provider ?? settings.provider
  const model = options.model || settings.model
  const effort = options.effort || settings.effort
  const agent = SPECIALIZED_AGENTS[options.agentId]
  const mode = options.readOnly ? 'read' : agent.mode

  const needsJail = provider === 'agy' || (provider === 'claude' && mode === 'write')
  const tmpDir = needsJail && (await which('bwrap')) ? mkdtempSync(join(tmpdir(), 'workstuff-factory-')) : null
  const sandbox = tmpDir ? { writable: sandboxDirs(provider, options.cwd), tmpDir } : undefined

  try {
    const cliSpec = buildFactoryArgs(provider, {
      prompt: options.prompt,
      systemPrompt: agent.systemPrompt,
      mode,
      cwd: options.cwd,
      model,
      effort,
      sandbox,
    })

    return await spawnCli(provider, model, cliSpec, {
      prompt: options.prompt,
      cwd: options.cwd,
      signal: options.signal,
      onEvent: options.onEvent,
      timeoutMs: options.timeoutMs ?? 15 * 60_000,
      stallMs: 4 * 60_000,
    })
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const base = { prompt: 'oi', systemPrompt: 'sys', cwd: '/wt' }
  const sandbox = { writable: ['/wt', '/home/u/.claude'], tmpDir: '/tmp/x' }

  const claudeRead = buildFactoryArgs('claude', { ...base, mode: 'read' })
  assert.equal(claudeRead.bin, 'claude')
  assert.ok(!claudeRead.args.includes('--dangerously-skip-permissions'))

  const claudeWrite = buildFactoryArgs('claude', { ...base, mode: 'write', sandbox })
  assert.equal(claudeWrite.bin, 'bwrap', 'claude com escrita sempre dentro do bwrap')
  assert.deepEqual(claudeWrite.args.slice(0, 3), ['--ro-bind', '/', '/'])
  assert.ok(claudeWrite.args.includes('--dangerously-skip-permissions'))
  assert.throws(() => buildFactoryArgs('claude', { ...base, mode: 'write' }), /bwrap/, 'sem bwrap, recusa')

  assert.ok(buildFactoryArgs('codex', { ...base, mode: 'read' }).args.includes('read-only'))
  assert.ok(buildFactoryArgs('codex', { ...base, mode: 'write' }).args.includes('workspace-write'))

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
