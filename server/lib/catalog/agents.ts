// Ativa itens do catálogo nos agentes de IA desta máquina.
//
// Dois mecanismos, porque os agentes funcionam assim:
// - skill: link simbólico na pasta de skills do agente (~/.claude/skills/<slug>);
// - rule/persona/prompt/template: entrada num bloco demarcado do arquivo de instruções global
//   (~/.claude/CLAUDE.md…). O bloco é do workStuff (workstuff:catalogo), separado de blocos de outras ferramentas.
//
// Nada fora do que este painel criou é alterado: link que aponta para outro lugar ou pasta real com o
// mesmo nome aparecem como "gerenciado fora daqui" e bloqueiam a ativação.
//
// Autoteste (numa home temporária): node server/lib/catalog/agents.ts --selfcheck

import assert from 'node:assert/strict'
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync,
  rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { DiscoveredItem, Kind } from './discover.ts'
import { parseFrontmatter } from './frontmatter.ts'

export type AgentId = 'claude' | 'codex' | 'gemini' | 'opencode'
export const AGENT_IDS: AgentId[] = ['claude', 'codex', 'gemini', 'opencode']

export type AgentState =
  | { state: 'off' }
  | { state: 'on' }
  | { state: 'stale'; reason: string }
  | { state: 'elsewhere'; reason: string }
  | { state: 'unsupported' }

// Claude e Gemini resolvem `@caminho` relativo à pasta do arquivo (reference). Codex e OpenCode não têm
// import (openai/codex#17401, sst/opencode#1490): recebem o caminho e leem sob demanda (pointer).
type InstructionTarget = { file: string; mode: 'reference' | 'pointer'; root: string }

export function agentPaths(home: string) {
  const instructions: Record<AgentId, InstructionTarget> = {
    claude: { file: join(home, '.claude', 'CLAUDE.md'), mode: 'reference', root: join(home, '.claude') },
    codex: { file: join(home, '.codex', 'AGENTS.md'), mode: 'pointer', root: join(home, '.codex') },
    gemini: { file: join(home, '.gemini', 'GEMINI.md'), mode: 'reference', root: join(home, '.gemini') },
    opencode: { file: join(home, '.config', 'opencode', 'AGENTS.md'), mode: 'pointer', root: join(home, '.config', 'opencode') },
  }
  // Antigravity lê a mesma pasta do Gemini.
  const skills: Record<AgentId, string> = {
    claude: join(home, '.claude', 'skills'),
    codex: join(home, '.codex', 'skills'),
    gemini: join(home, '.gemini', 'config', 'skills'),
    opencode: join(home, '.config', 'opencode', 'skills'),
  }
  return { instructions, skills }
}

const ACTIVATABLE: Kind[] = ['skill', 'rule', 'persona', 'prompt', 'template']
const KIND_LABEL: Record<Kind, string> = { skill: 'Skill', rule: 'Rule', persona: 'Persona', prompt: 'Prompt', template: 'Template', nota: 'Nota' }

const BLOCK_START = '<!-- workstuff:catalogo:start -->'
const BLOCK_END = '<!-- workstuff:catalogo:end -->'
const POINTER_HEADER = [
  '## Catálogo de IA (workStuff)',
  '',
  'Leia o arquivo indicado antes de agir no assunto correspondente.',
  'Os marcados como **sempre** valem para qualquer tarefa.',
].join('\n')

type Entry = { id: string; body: string }

function readBlock(file: string): { rest: string; entries: Entry[] } {
  const raw = existsSync(file) ? readFileSync(file, 'utf-8') : ''
  const start = raw.indexOf(BLOCK_START)
  const end = raw.indexOf(BLOCK_END)
  if (start === -1 || end === -1 || end < start) return { rest: raw, entries: [] }

  const inner = raw.slice(start + BLOCK_START.length, end)
  const rest = raw.slice(0, start) + raw.slice(end + BLOCK_END.length).replace(/^\n+/, '')
  const parts = inner.split(/<!-- workstuff:item:(.+?) -->/)
  const entries: Entry[] = []
  for (let i = 1; i < parts.length; i += 2) entries.push({ id: parts[i].trim(), body: (parts[i + 1] ?? '').trim() })
  return { rest, entries }
}

function writeBlock(file: string, rest: string, entries: Entry[], header?: string) {
  mkdirSync(dirname(file), { recursive: true })
  // Backup só na primeira escrita, para guardar o arquivo como era antes do workStuff mexer.
  const backup = `${file}.workstuff.bak`
  if (existsSync(file) && !existsSync(backup)) copyFileSync(file, backup)

  const body = entries.map(e => `<!-- workstuff:item:${e.id} -->\n${e.body}`).join('\n\n')
  const block = entries.length ? `${BLOCK_START}\n${header ? `${header}\n\n` : ''}${body}\n${BLOCK_END}\n\n` : ''
  writeFileSync(file, block + rest.replace(/^\n+/, ''))
}

// Nome do link inclui o id do item: dois itens com o mesmo slug em pastas diferentes não colidem.
const linkName = (item: DiscoveredItem) => `${item.kind}-${item.slug}-${item.id.slice(0, 6)}.md`
const linkPath = (target: InstructionTarget, item: DiscoveredItem) => join(target.root, 'workstuff', linkName(item))

function expectedBody(target: InstructionTarget, item: DiscoveredItem) {
  if (target.mode === 'reference') return `@workstuff/${linkName(item)}`
  const fm = parseFrontmatter(readFileSync(item.mainFile, 'utf-8'))
  const when = fm.apply === 'always' ? '**sempre**' : `quando: ${item.usage || item.description || 'relevante'}`
  return `- \`${item.mainFile}\`\n  ${KIND_LABEL[item.kind]} ${item.slug} — ${when}`
}

const pointsTo = (link: string, target: string) => {
  try {
    return realpathSync(link) === realpathSync(target)
  } catch {
    return false
  }
}

function skillState(dir: string, item: DiscoveredItem): AgentState {
  const link = join(dir, item.slug)
  const stat = lstatSync(link, { throwIfNoEntry: false })
  if (!stat) return { state: 'off' }
  if (!stat.isSymbolicLink()) return { state: 'elsewhere', reason: `já existe uma pasta real "${item.slug}" em ${dir}` }
  if (pointsTo(link, item.path)) return { state: 'on' }
  return { state: 'elsewhere', reason: `${link} aponta para ${readlinkSync(link)}` }
}

function instructionState(target: InstructionTarget, item: DiscoveredItem): AgentState {
  const entry = readBlock(target.file).entries.find(e => e.id === item.id)
  if (!entry) return { state: 'off' }
  if (target.mode === 'reference' && !pointsTo(linkPath(target, item), item.mainFile)) {
    return { state: 'stale', reason: 'o link do arquivo sumiu ou aponta para outro lugar' }
  }
  if (entry.body !== expectedBody(target, item)) return { state: 'stale', reason: 'a descrição mudou desde que foi ativado' }
  return { state: 'on' }
}

export function stateOf(home: string, agent: AgentId, item: DiscoveredItem): AgentState {
  if (!ACTIVATABLE.includes(item.kind)) return { state: 'unsupported' }
  const paths = agentPaths(home)
  return item.kind === 'skill' ? skillState(paths.skills[agent], item) : instructionState(paths.instructions[agent], item)
}

export function activate(home: string, agent: AgentId, item: DiscoveredItem) {
  const current = stateOf(home, agent, item)
  if (current.state === 'unsupported') throw new Error(`${KIND_LABEL[item.kind]} não é ativável em agente`)
  if (current.state === 'elsewhere') throw new Error(`não ativei para não sobrescrever: ${current.reason}`)

  const paths = agentPaths(home)
  if (item.kind === 'skill') {
    const link = join(paths.skills[agent], item.slug)
    if (current.state === 'on') return
    mkdirSync(paths.skills[agent], { recursive: true })
    symlinkSync(item.path, link)
    return
  }

  const target = paths.instructions[agent]
  if (target.mode === 'reference') {
    const link = linkPath(target, item)
    mkdirSync(dirname(link), { recursive: true })
    if (lstatSync(link, { throwIfNoEntry: false })) unlinkSync(link) // link do próprio workStuff (nome leva o id)
    symlinkSync(item.mainFile, link)
  }
  const { rest, entries } = readBlock(target.file)
  const next = [{ id: item.id, body: expectedBody(target, item) }, ...entries.filter(e => e.id !== item.id)]
  writeBlock(target.file, rest, next, target.mode === 'pointer' ? POINTER_HEADER : undefined)
}

export function deactivate(home: string, agent: AgentId, item: DiscoveredItem) {
  const current = stateOf(home, agent, item)
  if (current.state === 'elsewhere') throw new Error(`não desativei: ${current.reason}; foi criado fora do workStuff`)
  if (current.state === 'off' || current.state === 'unsupported') return

  const paths = agentPaths(home)
  if (item.kind === 'skill') {
    unlinkSync(join(paths.skills[agent], item.slug))
    return
  }
  const target = paths.instructions[agent]
  if (target.mode === 'reference') {
    const link = linkPath(target, item)
    if (lstatSync(link, { throwIfNoEntry: false })) unlinkSync(link)
  }
  const { rest, entries } = readBlock(target.file)
  writeBlock(target.file, rest, entries.filter(e => e.id !== item.id), target.mode === 'pointer' ? POINTER_HEADER : undefined)
}

export function agentTargets(home: string) {
  const { instructions, skills } = agentPaths(home)
  return AGENT_IDS.map(id => ({
    id,
    instructionsFile: instructions[id].file,
    instructionsMode: instructions[id].mode,
    instructionsExists: existsSync(instructions[id].file),
    skillsDir: skills[id],
  }))
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const home = mkdtempSync(join(tmpdir(), 'agents-home-'))
  const src = mkdtempSync(join(tmpdir(), 'catalog-src-'))
  mkdirSync(join(src, 'revisar-pr'))
  writeFileSync(join(src, 'revisar-pr', 'SKILL.md'), '---\nname: revisar-pr\n---\n')
  writeFileSync(join(src, 'rule-react.md'), '---\ndescription: Componentes pequenos\n---\n# react')
  const base = { title: '', description: '', usage: null, apply: null, root: src, relPath: '', lines: 1, updatedAt: '' }
  const skill: DiscoveredItem = { ...base, id: 'aaaaaaaaaaaa', kind: 'skill', slug: 'revisar-pr', path: join(src, 'revisar-pr'), mainFile: join(src, 'revisar-pr', 'SKILL.md') }
  const rule: DiscoveredItem = { ...base, id: 'bbbbbbbbbbbb', kind: 'rule', slug: 'react', description: 'Componentes pequenos', path: join(src, 'rule-react.md'), mainFile: join(src, 'rule-react.md') }

  // CLAUDE.md pré-existente, com o bloco de outra ferramenta: tem que sobreviver intacto.
  const claudeMd = join(home, '.claude', 'CLAUDE.md')
  mkdirSync(dirname(claudeMd), { recursive: true })
  const original = '<!-- outra-ferramenta:start -->\n@rules/rule-x.md\n<!-- outra-ferramenta:end -->\n\n# Minhas instruções\n'
  writeFileSync(claudeMd, original)

  activate(home, 'claude', rule)
  assert.equal(stateOf(home, 'claude', rule).state, 'on')
  const written = readFileSync(claudeMd, 'utf-8')
  assert.ok(written.includes('@workstuff/rule-react-bbbbbb.md'))
  assert.ok(written.includes(original.trim()), 'conteúdo e bloco de outra ferramenta preservados')
  assert.equal(readFileSync(`${claudeMd}.workstuff.bak`, 'utf-8'), original)

  activate(home, 'codex', rule)
  assert.ok(readFileSync(join(home, '.codex', 'AGENTS.md'), 'utf-8').includes(`\`${rule.mainFile}\``))

  deactivate(home, 'claude', rule)
  assert.equal(stateOf(home, 'claude', rule).state, 'off')
  assert.equal(readFileSync(claudeMd, 'utf-8'), original, 'desativar devolve o arquivo ao estado original')

  activate(home, 'claude', skill)
  assert.equal(stateOf(home, 'claude', skill).state, 'on')
  deactivate(home, 'claude', skill)
  assert.equal(stateOf(home, 'claude', skill).state, 'off')

  // Link de outra ferramenta (~/.agents) com o mesmo nome: não pode ser sobrescrito nem removido.
  const other = mkdtempSync(join(tmpdir(), 'other-'))
  mkdirSync(join(home, '.codex', 'skills'), { recursive: true })
  symlinkSync(other, join(home, '.codex', 'skills', 'revisar-pr'))
  assert.equal(stateOf(home, 'codex', skill).state, 'elsewhere')
  assert.throws(() => activate(home, 'codex', skill), /não ativei/)
  assert.throws(() => deactivate(home, 'codex', skill), /não desativei/)
  assert.equal(resolve(readlinkSync(join(home, '.codex', 'skills', 'revisar-pr'))), other)

  assert.equal(stateOf(home, 'claude', { ...rule, kind: 'nota' }).state, 'unsupported')

  for (const d of [home, src, other]) rmSync(d, { recursive: true })
  console.log('agents selfcheck: ok')
}
