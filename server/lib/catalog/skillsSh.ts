// Busca e instalação de skills do skills.sh (catálogo público da Vercel).
// Autoteste: node server/lib/catalog/skillsSh.ts --selfcheck

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { AGENT_HOME } from '../paths.ts'
import { readJson } from '../jsonFile.ts'

export type SkillHit = { id: string; source: string; skillId: string; name: string; installs: number; installed: boolean }

const SEARCH = 'https://skills.sh/api/search'
// Versão fixa de propósito: o CLI baixa e executa código; atualizar é decisão revisada, não automática.
const CLI = 'skills@1.7.0'
export const CLI_AGENTS = ['claude-code', 'codex', 'antigravity', 'opencode'] as const
export type CliAgent = (typeof CLI_AGENTS)[number]

export const AGENTS_SKILLS_DIR = join(AGENT_HOME, '.agents', 'skills')
const LOCK = join(AGENT_HOME, '.agents', '.skill-lock.json')

// Sem hífen inicial: o valor vai como argumento do CLI e não pode virar uma flag ("--all").
const SOURCE = /^[A-Za-z0-9._][A-Za-z0-9._-]*\/[A-Za-z0-9._][A-Za-z0-9._-]*$/
const SKILL_ID = /^[A-Za-z0-9._][A-Za-z0-9._ :-]{0,99}$/

export function validateInstall(b: Record<string, unknown>): { source: string; skillId: string; agents: CliAgent[] } {
  const source = typeof b.source === 'string' ? b.source.trim() : ''
  const skillId = typeof b.skillId === 'string' ? b.skillId.trim() : ''
  if (!SOURCE.test(source)) throw new Error('origem inválida: use dono/repositório')
  if (!SKILL_ID.test(skillId)) throw new Error('nome de skill inválido')
  const agents = Array.isArray(b.agents) ? [...new Set(b.agents)] : []
  if (!agents.length) throw new Error('escolha ao menos um agente')
  if (!agents.every(a => CLI_AGENTS.includes(a as CliAgent))) throw new Error('agente desconhecido')
  return { source, skillId, agents: agents as CliAgent[] }
}

export const installArgs = (v: ReturnType<typeof validateInstall>) =>
  ['-y', CLI, 'add', v.source, '-g', '-s', v.skillId, ...v.agents.flatMap(a => ['-a', a]), '-y']

// O lock do CLI diz o que já está instalado: chave = nome da skill, source = "dono/repo".
export function installedFrom(lock: { skills?: Record<string, { source?: string }> }): Set<string> {
  return new Set(Object.entries(lock.skills ?? {}).map(([name, v]) => `${v.source}/${name}`))
}

const cache = new Map<string, { at: number; hits: Omit<SkillHit, 'installed'>[] }>()

export async function search(q: string): Promise<SkillHit[]> {
  const query = q.trim()
  if (query.length < 2) throw new Error('digite ao menos 2 letras')
  let hit = cache.get(query)
  if (!hit || Date.now() - hit.at > 10 * 60_000) {
    let res: Response
    try {
      res = await fetch(`${SEARCH}?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(15_000) })
    } catch (e) {
      throw new Error((e as Error).name === 'TimeoutError' ? 'o skills.sh não respondeu em 15s' : `não consegui falar com o skills.sh: ${(e as Error).message}`)
    }
    if (!res.ok) throw new Error(`o skills.sh respondeu ${res.status}`)
    const data = (await res.json()) as { skills?: Omit<SkillHit, 'installed'>[] }
    hit = { at: Date.now(), hits: data.skills ?? [] }
    cache.set(query, hit)
  }
  const installed = installedFrom(readJson(LOCK, {}))
  return hit.hits.map(h => ({ ...h, installed: installed.has(`${h.source}/${h.skillId}`) }))
}

export function install(v: ReturnType<typeof validateInstall>, onLine: (line: string) => void, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', installArgs(v), { env: { ...process.env, DISABLE_TELEMETRY: '1', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => child.kill('SIGTERM'), 5 * 60_000)
    // Tira as cores ANSI do CLI; a tela mostra texto puro.
    const forward = (chunk: Buffer) => chunk.toString('utf-8').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split(/\r?\n/).filter(l => l.trim()).forEach(onLine)
    child.stdout.on('data', forward)
    child.stderr.on('data', forward)
    signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true })
    child.on('error', e => (clearTimeout(timer), reject(e)))
    child.on('close', code => (clearTimeout(timer), resolve(code ?? -1)))
  })
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const ok = validateInstall({ source: 'vercel-labs/skills', skillId: 'find-skills', agents: ['claude-code', 'codex', 'claude-code'] })
  assert.deepEqual(installArgs(ok), ['-y', 'skills@1.7.0', 'add', 'vercel-labs/skills', '-g', '-s', 'find-skills', '-a', 'claude-code', '-a', 'codex', '-y'])
  assert.ok(validateInstall({ source: 'a/b', skillId: 'Convex Best Practices', agents: ['opencode'] }))
  for (const bad of [
    { source: 'a/b; rm -rf /', skillId: 'x', agents: ['codex'] },
    { source: 'https://evil/x', skillId: 'x', agents: ['codex'] },
    { source: 'a/b', skillId: '--all', agents: ['codex'] },
    { source: '-x/b', skillId: 'x', agents: ['codex'] },
    { source: 'a/b', skillId: 'x$(id)', agents: ['codex'] },
    { source: 'a/b', skillId: 'x', agents: [] },
    { source: 'a/b', skillId: 'x', agents: ['cursor'] },
  ]) assert.throws(() => validateInstall(bad), Error, JSON.stringify(bad))
  assert.deepEqual([...installedFrom({ skills: { 'find-skills': { source: 'vercel-labs/skills' } } })], ['vercel-labs/skills/find-skills'])
  assert.equal(installedFrom({}).size, 0)
  console.log('skills.sh selfcheck: ok')
}
