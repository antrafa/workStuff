// Monta binário e argumentos de cada CLI de IA. Separado do runner porque é aqui que se decide o nível
// de permissão do agente, e isso precisa ser verificável sem subir processo.
// Autoteste: node server/lib/ai/args.ts --selfcheck

import assert from 'node:assert/strict'
import type { ProviderId } from '../aiProviders.ts'

export type RunOptions = {
  prompt: string
  systemPrompt?: string
  model?: string
  effort?: string
  cwd?: string
  addDirs?: string[]
  // Só para o agy: onde fica o estado dele e a pasta temporária liberada para escrita dentro do bwrap.
  agySandbox?: { stateDir: string; tmpDir: string }
}

// Modo leitura: o agente lê e busca arquivos, e nada além disso. Nenhum provedor recebe auto-aprovação.
// O modo com escrita guardada (Cluster Doctor) entra depois, com hook e shim próprios.
const READ_TOOLS = ['Read', 'Grep', 'Glob']

export function buildArgs(provider: ProviderId, o: RunOptions): { bin: string; args: string[] } {
  const fullPrompt = o.systemPrompt ? `${o.systemPrompt}\n\n${o.prompt}` : o.prompt

  if (provider === 'claude') {
    const args = ['--output-format', 'stream-json', '--verbose', '--include-partial-messages']
    if (o.model) args.push('--model', o.model)
    if (o.effort) args.push('--effort', o.effort)
    args.push('--tools', ...READ_TOOLS, '--allowedTools', ...READ_TOOLS, '--strict-mcp-config')
    if (o.addDirs?.length) args.push('--add-dir', ...o.addDirs)
    if (o.systemPrompt) args.push('--append-system-prompt', o.systemPrompt)
    args.push('-p', o.prompt)
    return { bin: 'claude', args }
  }

  if (provider === 'codex') {
    // read-only: lê arquivo, não escreve e não alcança a rede. A pasta do item pode não ser repositório git.
    const args = ['exec', '--json', '-s', 'read-only', '--skip-git-repo-check']
    if (o.model) args.push('-m', o.model)
    if (o.effort) args.push('-c', `model_reasoning_effort="${o.effort}"`)
    if (o.cwd) args.push('-C', o.cwd)
    for (const dir of o.addDirs ?? []) args.push('--add-dir', dir)
    args.push(fullPrompt)
    return { bin: 'codex', args }
  }

  // O agy não tem modo leitura que segure: testado em 30/09/2026, ele escreveu arquivo mesmo com
  // --mode plan e --sandbox. A trava é do sistema: bwrap monta o disco inteiro como só leitura,
  // menos a pasta de estado dele e uma temporária. A rede continua (ele precisa da API).
  if (!o.agySandbox) throw new Error('o Antigravity só roda em modo leitura dentro do bwrap (bubblewrap), que não está disponível nesta máquina; escolha Claude ou Codex em Configurações')
  const { stateDir, tmpDir } = o.agySandbox
  const args = [
    '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc',
    '--bind', stateDir, stateDir, '--bind', tmpDir, tmpDir, '--setenv', 'TMPDIR', tmpDir,
    '--die-with-parent', ...(o.cwd ? ['--chdir', o.cwd] : []),
    'agy', '--output-format', 'stream-json',
  ]
  if (o.model) args.push('--model', o.model)
  if (o.effort) args.push('--effort', o.effort)
  for (const dir of o.addDirs ?? []) args.push('--add-dir', dir)
  args.push('-p', fullPrompt)
  return { bin: 'bwrap', args }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const AUTO_APPROVE = ['--dangerously-skip-permissions', '--dangerously-bypass-approvals-and-sandbox', '--permission-mode']
  const sandbox = { stateDir: '/home/u/.gemini', tmpDir: '/tmp/agy-x' }
  for (const provider of ['claude', 'codex', 'agy'] as ProviderId[]) {
    const { args } = buildArgs(provider, { prompt: 'oi', model: 'm', effort: 'high', agySandbox: sandbox })
    for (const flag of AUTO_APPROVE) assert.ok(!args.includes(flag), `${provider} não pode usar ${flag}`)
  }

  const claude = buildArgs('claude', { prompt: 'pergunta', systemPrompt: 'REGRAS', effort: 'high' }).args
  const tools = claude.indexOf('--tools')
  assert.deepEqual(claude.slice(tools, tools + 4), ['--tools', 'Read', 'Grep', 'Glob'], 'claude só com ferramentas de leitura')
  assert.ok(claude.includes('--strict-mcp-config'), 'claude sem MCPs do usuário')
  assert.deepEqual(claude.slice(-2), ['-p', 'pergunta'])
  assert.equal(claude[claude.indexOf('--effort') + 1], 'high')

  const codex = buildArgs('codex', { prompt: 'pergunta', systemPrompt: 'REGRAS', effort: 'xhigh', cwd: '/x' }).args
  assert.deepEqual(codex.slice(0, 4), ['exec', '--json', '-s', 'read-only'], 'codex em sandbox read-only')
  assert.ok(codex.includes('model_reasoning_effort="xhigh"'))
  assert.ok(codex.at(-1)!.startsWith('REGRAS') && codex.at(-1)!.endsWith('pergunta'), 'system prompt vai junto do prompt')

  const agy = buildArgs('agy', { prompt: 'pergunta', systemPrompt: 'REGRAS', agySandbox: sandbox, cwd: '/proj' })
  assert.equal(agy.bin, 'bwrap', 'agy sempre dentro do bwrap')
  assert.deepEqual(agy.args.slice(0, 3), ['--ro-bind', '/', '/'], 'disco inteiro só leitura')
  const writable = agy.args.flatMap((a, i) => (a === '--bind' ? [agy.args[i + 1]] : []))
  assert.deepEqual(writable, ['/home/u/.gemini', '/tmp/agy-x'], 'só estado do agy e a temporária são graváveis')
  assert.ok(!writable.includes('/proj'), 'a pasta do projeto nunca é gravável')
  assert.ok(agy.args.at(-1)!.startsWith('REGRAS'), 'agy leva o system prompt junto')
  assert.throws(() => buildArgs('agy', { prompt: 'x' }), /bwrap/, 'sem bwrap, recusa em vez de rodar sem trava')

  assert.ok(!buildArgs('claude', { prompt: 'x' }).args.includes('--model'), 'sem modelo, o CLI usa o padrão dele')
  console.log('ai args selfcheck: ok')
}
