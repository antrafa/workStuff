// Monta binário e argumentos de cada CLI de IA. Separado do runner porque é aqui que se decide o nível
// de permissão do agente, e isso precisa ser verificável sem subir processo.
// Autoteste: node server/lib/ai/args.ts --selfcheck

import assert from 'node:assert/strict'
import type { ProviderId } from '../aiProviders.ts'
import { say } from '../i18n.ts'
import { jailArgs, type ReadJail } from './jail.ts'

export type RunOptions = {
  prompt: string
  systemPrompt?: string
  model?: string
  effort?: string
  cwd?: string
  addDirs?: string[]
  // bwrap read jail (see jail.ts): optional for Claude and Codex, mandatory for agy
  jail?: ReadJail
}

// Modo leitura: o agente lê e busca arquivos, e nada além disso. Nenhum provedor recebe auto-aprovação.
// O modo com escrita guardada (Cluster Doctor) entra depois, com hook e shim próprios.
const READ_TOOLS = ['Read', 'Grep', 'Glob']

// Linux refuses a single argument of 128 KiB or more (MAX_ARG_STRLEN) with E2BIG, and a review prompt
// carries a whole diff: Claude and Codex read it from stdin instead.
export const MAX_ARG_BYTES = 128 * 1024 - 1

export type CliSpec = { bin: string; args: string[]; stdin?: string }

export function buildArgs(provider: ProviderId, o: RunOptions): CliSpec {
  const fullPrompt = o.systemPrompt ? `${o.systemPrompt}\n\n${o.prompt}` : o.prompt

  if (provider === 'claude') {
    const args = ['--output-format', 'stream-json', '--verbose', '--include-partial-messages']
    if (o.model) args.push('--model', o.model)
    if (o.effort) args.push('--effort', o.effort)
    args.push('--tools', ...READ_TOOLS, '--allowedTools', ...READ_TOOLS, '--strict-mcp-config')
    if (o.addDirs?.length) args.push('--add-dir', ...o.addDirs)
    if (o.systemPrompt) args.push('--append-system-prompt', o.systemPrompt)
    args.push('-p')
    return o.jail ? { bin: 'bwrap', args: jailArgs(o.jail, o.cwd, 'claude', args), stdin: o.prompt } : { bin: 'claude', args, stdin: o.prompt }
  }

  if (provider === 'codex') {
    // read-only: lê arquivo, não escreve e não alcança a rede. A pasta do item pode não ser repositório git.
    const args = ['exec', '--json', '-s', 'read-only', '--skip-git-repo-check']
    if (o.model) args.push('-m', o.model)
    if (o.effort) args.push('-c', `model_reasoning_effort="${o.effort}"`)
    if (o.cwd) args.push('-C', o.cwd)
    for (const dir of o.addDirs ?? []) args.push('--add-dir', dir)
    args.push('-')
    return o.jail ? { bin: 'bwrap', args: jailArgs(o.jail, o.cwd, 'codex', args), stdin: fullPrompt } : { bin: 'codex', args, stdin: fullPrompt }
  }

  // O agy não tem modo leitura que segure: testado em 30/09/2026, ele escreveu arquivo mesmo com
  // --mode plan e --sandbox. A trava é do sistema: o jail de leitura, gravável só na pasta de estado
  // dele e numa temporária. A rede continua (ele precisa da API).
  if (!o.jail) throw new Error(say({ en: 'Antigravity only runs read-only inside bwrap (bubblewrap), which is not available on this machine; choose Claude or Codex in Settings', pt: 'o Antigravity só roda em modo leitura dentro do bwrap (bubblewrap), que não está disponível nesta máquina; escolha Claude ou Codex em Configurações' }))
  // agy documents no plain-text stdin, so its prompt stays an argument and is bounded by it.
  if (Buffer.byteLength(fullPrompt) > MAX_ARG_BYTES) throw new Error(say({ en: 'this prompt is too large for Antigravity (over 128 KiB); choose Claude or Codex in Settings for large reviews', pt: 'este prompt é grande demais para o Antigravity (mais de 128 KiB); escolha Claude ou Codex em Configurações para revisões grandes' }))
  const args = ['--output-format', 'stream-json']
  if (o.model) args.push('--model', o.model)
  if (o.effort) args.push('--effort', o.effort)
  for (const dir of o.addDirs ?? []) args.push('--add-dir', dir)
  args.push('-p', fullPrompt)
  return { bin: 'bwrap', args: jailArgs(o.jail, o.cwd, 'agy', args) }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const AUTO_APPROVE = ['--dangerously-skip-permissions', '--dangerously-bypass-approvals-and-sandbox', '--permission-mode']
  const jail: ReadJail = { home: '/home/u', tmpDir: '/tmp/agy-x', visible: ['/proj', '/home/u/.local/bin'], binDirs: ['/home/u/.local/bin'], writable: ['/home/u/.gemini'], env: {} }
  for (const provider of ['claude', 'codex', 'agy'] as ProviderId[]) {
    const { args } = buildArgs(provider, { prompt: 'oi', model: 'm', effort: 'high', jail })
    for (const flag of AUTO_APPROVE) assert.ok(!args.includes(flag), `${provider} não pode usar ${flag}`)
  }

  const claudeSpec = buildArgs('claude', { prompt: 'pergunta', systemPrompt: 'REGRAS', effort: 'high' })
  const claude = claudeSpec.args
  const tools = claude.indexOf('--tools')
  assert.deepEqual(claude.slice(tools, tools + 4), ['--tools', 'Read', 'Grep', 'Glob'], 'claude só com ferramentas de leitura')
  assert.ok(claude.includes('--strict-mcp-config'), 'claude sem MCPs do usuário')
  assert.equal(claude.at(-1), '-p')
  assert.equal(claudeSpec.stdin, 'pergunta', 'claude recebe o prompt pela entrada padrão')
  assert.ok(!claude.includes('pergunta'), 'o prompt não vira argumento')
  assert.equal(claude[claude.indexOf('--effort') + 1], 'high')

  const codexSpec = buildArgs('codex', { prompt: 'pergunta', systemPrompt: 'REGRAS', effort: 'xhigh', cwd: '/x' })
  const codex = codexSpec.args
  assert.deepEqual(codex.slice(0, 4), ['exec', '--json', '-s', 'read-only'], 'codex em sandbox read-only')
  assert.ok(codex.includes('model_reasoning_effort="xhigh"'))
  assert.equal(codex.at(-1), '-')
  assert.ok(codexSpec.stdin!.startsWith('REGRAS') && codexSpec.stdin!.endsWith('pergunta'), 'system prompt vai junto do prompt, pela entrada padrão')
  assert.throws(() => buildArgs('agy', { prompt: 'x'.repeat(MAX_ARG_BYTES + 1), jail }), /128 KiB/, 'agy recusa prompt maior que um argumento')

  const agy = buildArgs('agy', { prompt: 'pergunta', systemPrompt: 'REGRAS', jail, cwd: '/proj' })
  assert.equal(agy.bin, 'bwrap', 'agy sempre dentro do bwrap')
  assert.deepEqual(agy.args.slice(0, 3), ['--ro-bind', '/', '/'], 'disco inteiro só leitura')
  assert.ok(agy.args.join(' ').includes('--tmpfs /home/u'), 'agy também não vê a home')
  const writable = agy.args.flatMap((a, i) => (a === '--bind' ? [agy.args[i + 1]] : []))
  assert.deepEqual(writable, ['/home/u/.gemini', '/tmp/agy-x'], 'só estado do agy e a temporária são graváveis')
  assert.ok(!writable.includes('/proj'), 'a pasta do projeto nunca é gravável')
  assert.ok(agy.args.at(-1)!.startsWith('REGRAS'), 'agy leva o system prompt junto')
  assert.throws(() => buildArgs('agy', { prompt: 'x' }), /bwrap/, 'sem bwrap, recusa em vez de rodar sem trava')

  assert.ok(!buildArgs('claude', { prompt: 'x' }).args.includes('--model'), 'sem modelo, o CLI usa o padrão dele')
  const jailed = buildArgs('claude', { prompt: 'p', jail, cwd: '/proj' })
  assert.equal(jailed.bin, 'bwrap', 'com jail, claude roda dentro do bwrap')
  assert.equal(jailed.args[jailed.args.indexOf('--chdir') + 1], '/proj')
  assert.equal(jailed.stdin, 'p', 'o prompt atravessa o bwrap pela entrada padrão')
  assert.equal(buildArgs('codex', { prompt: 'p', jail, cwd: '/proj' }).bin, 'bwrap')
  console.log('ai args selfcheck: ok')
}
