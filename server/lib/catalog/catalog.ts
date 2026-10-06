import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AGENT_HOME, expandHome, tildify } from '../paths.ts'
import { AGENT_IDS, activate, agentTargets, deactivate, stateOf, type AgentId } from './agents.ts'
import { discover, type DiscoveredItem, type Kind } from './discover.ts'
import { readConfig, readMeta, saveMeta, saveRoots, STATUSES, type Status } from './store.ts'
import { say } from '../i18n.ts'

export class CatalogError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}


function load() {
  const config = readConfig()
  return { config, ...discover(config.roots) }
}

export function listCatalog() {
  const { config, items, missingRoots } = load()
  const meta = readMeta()
  const sameName = (i: DiscoveredItem) => items.filter(o => o.kind === i.kind && o.slug === i.slug && o.id !== i.id)

  return {
    roots: config.roots.map(path => ({
      path,
      label: tildify(path),
      missing: missingRoots.includes(path),
      count: items.filter(i => i.root === path).length,
    })),
    agents: agentTargets(AGENT_HOME).map(t => ({ ...t, instructionsFile: tildify(t.instructionsFile), skillsDir: tildify(t.skillsDir) })),
    items: items.map(i => ({
      ...i,
      pathLabel: tildify(i.path),
      rootLabel: tildify(i.root),
      status: meta[i.path]?.status ?? 'ideia',
      notes: meta[i.path]?.notes ?? '',
      duplicates: sameName(i).map(o => tildify(o.root)),
      agents: Object.fromEntries(AGENT_IDS.map(a => [a, stateOf(AGENT_HOME, a, i)])),
    })),
  }
}

function findItem(id: string) {
  const item = load().items.find(i => i.id === id)
  if (!item) throw new CatalogError(say({ en: 'item not found; the folder may have changed, refresh the list', pt: 'item não encontrado; a pasta pode ter mudado, atualize a lista' }), 404)
  return item
}

export function setRoots(input: unknown) {
  if (!Array.isArray(input)) throw new CatalogError(say({ en: 'send the list of folders', pt: 'informe a lista de pastas' }))
  const roots = [...new Set(input.map(r => expandHome(String(r).trim())).filter(Boolean))]
  for (const r of roots) {
    if (!statSync(r, { throwIfNoEntry: false })?.isDirectory()) throw new CatalogError(say({ en: `folder not found: ${r}`, pt: `pasta não encontrada: ${r}` }))
  }
  saveRoots(roots)
}

export function updateMeta(id: string, body: { status?: unknown; notes?: unknown }) {
  const item = findItem(id)
  if (body.status !== undefined && !STATUSES.includes(body.status as Status)) throw new CatalogError(say({ en: 'invalid status', pt: 'status inválido' }))
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 20_000)) throw new CatalogError(say({ en: 'invalid notes', pt: 'notas inválidas' }))
  saveMeta(item.path, {
    ...(body.status !== undefined && { status: body.status as Status }),
    ...(body.notes !== undefined && { notes: body.notes as string }),
  })
}

const isAgent = (v: string): v is AgentId => AGENT_IDS.includes(v as AgentId)

export function setAgent(id: string, agent: string, on: boolean) {
  if (!isAgent(agent)) throw new CatalogError(say({ en: `unknown agent: ${agent}`, pt: `agente desconhecido: ${agent}` }), 404)
  const item = findItem(id)
  try {
    if (on) activate(AGENT_HOME, agent, item)
    else deactivate(AGENT_HOME, agent, item)
  } catch (e) {
    throw new CatalogError((e as Error).message, 409)
  }
  return stateOf(AGENT_HOME, agent, item)
}

export function readContent(id: string) {
  const item = findItem(id)
  return { content: readFileSync(item.mainFile, 'utf-8'), path: tildify(item.mainFile) }
}

export const itemPath = (id: string) => findItem(id).path

// Pedido de revisão crítica do item, só leitura.
export function reviewRequest(id: string) {
  const item = findItem(id)
  const notes = readMeta()[item.path]?.notes?.trim()
  const prompt = [
    `Leia ${item.mainFile}${item.kind === 'skill' ? ' e os demais arquivos da pasta' : ''} e revise criticamente este item de um catálogo de IA (${item.kind}).`,
    notes ? `\nNotas do autor sobre o que falta ou onde travou:\n${notes}\n` : '',
    'Responda em português, direto, sem preâmbulo nem repetir o conteúdo lido, com no máximo estas seções:',
    '**Pontos fortes** (bullets curtos), **O que melhorar** (bullets acionáveis, citando trecho quando fizer sentido)',
    'e, se fizer sentido, **Próximo passo** (uma ação concreta). Não altere nenhum arquivo.',
  ].join('\n')
  return { prompt, cwd: item.kind === 'skill' ? item.path : dirname(item.mainFile) }
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/
const CREATABLE: Exclude<Kind, 'nota'>[] = ['skill', 'prompt', 'rule', 'persona', 'template']
const PREFIX: Record<string, string> = { rule: 'rule-', persona: 'persona-', template: 'template-', prompt: 'prompt-' }

// Cria o arquivo com o frontmatter da convenção; o conteúdo é escrito no editor, não em formulário.
export function createItem(body: { root?: unknown; kind?: unknown; slug?: unknown; description?: unknown }) {
  const roots = readConfig().roots
  if (typeof body.root !== 'string' || !roots.includes(body.root)) throw new CatalogError(say({ en: 'choose one of the catalog folders', pt: 'escolha uma das pastas do catálogo' }))
  if (!CREATABLE.includes(body.kind as never)) throw new CatalogError(say({ en: 'invalid type', pt: 'tipo inválido' }))
  if (typeof body.slug !== 'string' || !SLUG.test(body.slug)) throw new CatalogError(say({ en: 'name in lowercase, no accents, separated by hyphens', pt: 'nome em minúsculas, sem acento, separado por hífen' }))
  if (typeof body.description !== 'string' || !body.description.trim()) throw new CatalogError(say({ en: 'the description is required', pt: 'a descrição é obrigatória' }))

  const kind = body.kind as (typeof CREATABLE)[number]
  const description = body.description.trim().replace(/\n/g, ' ')
  const file = kind === 'skill' ? join(body.root, body.slug, 'SKILL.md') : join(body.root, `${PREFIX[kind]}${body.slug}.md`)
  if (existsSync(file)) throw new CatalogError(say({ en: `${tildify(file)} already exists`, pt: `${tildify(file)} já existe` }), 409)

  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, ['---', `name: ${body.slug}`, `description: ${description}`, '---', '', `# ${body.slug}`, '', ''].join('\n'))
  return file
}
