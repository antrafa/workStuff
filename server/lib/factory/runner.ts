// Runner da Fábrica de Software com isolamento multi-provedor (Claude, Codex, Antigravity).

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
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
  signal?: AbortSignal
  onEvent: (e: AiEvent) => void
  timeoutMs?: number
}

export function buildFactoryArgs(
  provider: ProviderId,
  options: {
    agentId: SpecializedAgentId
    prompt: string
    systemPrompt: string
    mode: 'read' | 'write'
    cwd: string
    model?: string
    effort?: string
    agySandbox?: { stateDir: string; tmpDir: string }
  },
): { bin: string; args: string[] } {
  const fullPrompt = `${options.systemPrompt}\n\n${options.prompt}`

  if (provider === 'claude') {
    const tools = options.mode === 'write' ? WRITE_TOOLS : READ_TOOLS
    const args = ['--output-format', 'stream-json', '--verbose', '--include-partial-messages']
    if (options.model) args.push('--model', options.model)
    if (options.effort) args.push('--effort', options.effort)
    args.push('--tools', ...tools, '--allowedTools', ...tools, '--strict-mcp-config')
    if (options.mode === 'write') {
      args.push('--dangerously-skip-permissions')
    }
    args.push('--append-system-prompt', options.systemPrompt)
    args.push('-p', options.prompt)
    return { bin: 'claude', args }
  }

  if (provider === 'codex') {
    const args = ['exec', '--json', '--skip-git-repo-check']
    if (options.mode === 'read') {
      args.push('-s', 'read-only')
    } else {
      args.push('-s', 'workspace-write')
    }
    if (options.model) args.push('-m', options.model)
    if (options.effort) args.push('-c', `model_reasoning_effort="${options.effort}"`)
    if (options.cwd) args.push('-C', options.cwd)
    args.push(fullPrompt)
    return { bin: 'codex', args }
  }

  // Antigravity (agy)
  if (options.agySandbox) {
    const { stateDir, tmpDir } = options.agySandbox
    const args = [
      '--ro-bind', '/', '/',
      '--dev', '/dev',
      '--proc', '/proc',
      // No modo escrita, libera somente a pasta de trabalho (worktree) para escrita!
      ...(options.mode === 'write' && options.cwd ? ['--bind', options.cwd, options.cwd] : []),
      '--bind', stateDir, stateDir,
      '--bind', tmpDir, tmpDir,
      '--setenv', 'TMPDIR', tmpDir,
      '--die-with-parent',
      ...(options.cwd ? ['--chdir', options.cwd] : []),
      'agy', '--output-format', 'stream-json',
    ]

    if (options.mode === 'read') {
      args.push('--mode', 'plan')
    } else {
      args.push('--mode', 'accept-edits', '--dangerously-skip-permissions')
    }
    if (options.model) args.push('--model', options.model)
    if (options.effort) args.push('--effort', options.effort)
    args.push('-p', fullPrompt)

    return { bin: 'bwrap', args }
  }

  // Sem bwrap (ex: macOS), executa agy diretamente respeitando o modo (plan ou accept-edits)
  const args = ['--output-format', 'stream-json']
  if (options.mode === 'read') {
    args.push('--mode', 'plan')
  } else {
    args.push('--mode', 'accept-edits', '--dangerously-skip-permissions')
  }
  if (options.model) args.push('--model', options.model)
  if (options.effort) args.push('--effort', options.effort)
  args.push('-p', fullPrompt)

  return { bin: 'agy', args }
}

export async function runFactoryAgent(options: FactoryRunOptions): Promise<RunResult> {
  const settings = readSettings()
  const provider = options.provider ?? settings.provider
  const model = options.model || settings.model
  const effort = options.effort || settings.effort
  const agent = SPECIALIZED_AGENTS[options.agentId]

  const tmpDir = provider === 'agy' && (await which('bwrap')) ? mkdtempSync(join(tmpdir(), 'workstuff-agy-factory-')) : null
  const agySandbox = tmpDir ? { stateDir: join(homedir(), '.gemini'), tmpDir } : undefined

  try {
    const cliSpec = buildFactoryArgs(provider, {
      agentId: options.agentId,
      prompt: options.prompt,
      systemPrompt: agent.systemPrompt,
      mode: agent.mode,
      cwd: options.cwd,
      model,
      effort,
      agySandbox,
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
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // ignora
      }
    }
  }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  // Teste Claude: leitura vs escrita
  const claudeRead = buildFactoryArgs('claude', {
    agentId: 'architect',
    prompt: 'oi',
    systemPrompt: 'sys',
    mode: 'read',
    cwd: '/tmp',
  })
  assert.ok(!claudeRead.args.includes('--dangerously-skip-permissions'))

  const claudeWrite = buildFactoryArgs('claude', {
    agentId: 'implementer',
    prompt: 'oi',
    systemPrompt: 'sys',
    mode: 'write',
    cwd: '/tmp',
  })
  assert.ok(claudeWrite.args.includes('--dangerously-skip-permissions'))

  // Teste Codex: leitura vs escrita
  const codexRead = buildFactoryArgs('codex', {
    agentId: 'architect',
    prompt: 'oi',
    systemPrompt: 'sys',
    mode: 'read',
    cwd: '/tmp',
  })
  assert.ok(codexRead.args.includes('read-only'))

  const codexWrite = buildFactoryArgs('codex', {
    agentId: 'implementer',
    prompt: 'oi',
    systemPrompt: 'sys',
    mode: 'write',
    cwd: '/tmp',
  })
  assert.ok(codexWrite.args.includes('workspace-write'))

  // Teste AGY: plan vs accept-edits
  const agyRead = buildFactoryArgs('agy', {
    agentId: 'architect',
    prompt: 'oi',
    systemPrompt: 'sys',
    mode: 'read',
    cwd: '/tmp',
  })
  assert.ok(agyRead.args.includes('--mode') && agyRead.args.includes('plan'))

  const agyWrite = buildFactoryArgs('agy', {
    agentId: 'implementer',
    prompt: 'oi',
    systemPrompt: 'sys',
    mode: 'write',
    cwd: '/tmp',
  })
  assert.ok(agyWrite.args.includes('--mode') && agyWrite.args.includes('accept-edits'))

  console.log('factory runner selfcheck: ok')
}
