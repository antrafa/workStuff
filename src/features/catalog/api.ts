import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'

export type Kind = 'skill' | 'prompt' | 'rule' | 'persona' | 'template' | 'nota'
export type AgentId = 'claude' | 'codex' | 'gemini' | 'opencode'
export type Status = 'ideia' | 'em-andamento' | 'finalizado' | 'precisa-melhoria'

// on: ativo; stale: ativo mas desatualizado (reativar corrige); elsewhere: ocupado por algo criado fora
// do workStuff (não mexemos); unsupported: o tipo não se ativa em agente (nota).
export type AgentState =
  | { state: 'off' }
  | { state: 'on' }
  | { state: 'stale'; reason: string }
  | { state: 'elsewhere'; reason: string }
  | { state: 'unsupported' }

export type CatalogItem = {
  id: string
  kind: Kind
  slug: string
  title: string
  description: string
  usage: string | null
  apply: string | null
  path: string
  pathLabel: string
  mainFile: string
  root: string
  rootLabel: string
  relPath: string
  lines: number
  updatedAt: string
  status: Status
  notes: string
  duplicates: string[]
  agents: Record<AgentId, AgentState>
}

export type CatalogRoot = { path: string; label: string; missing: boolean; count: number }

export type AgentTarget = {
  id: AgentId
  instructionsFile: string
  instructionsMode: 'reference' | 'pointer'
  instructionsExists: boolean
  skillsDir: string
}

export type Catalog = {
  roots: CatalogRoot[]
  items: CatalogItem[]
  agents: AgentTarget[]
}

export const fetchCatalog = () => api.get<Catalog>('/catalog')
export const saveRoots = (roots: string[]) => api.put<{ ok: true }>('/catalog/roots', { roots })
export const pickFolder = () => api.post<{ path: string | null }>('/catalog/pick-folder')
export const fetchContent = (id: string) => api.get<{ content: string; path: string }>(`/catalog/items/${id}/content`)
export const saveMeta = (id: string, meta: { status?: Status; notes?: string }) => api.put<{ ok: true }>(`/catalog/items/${id}/meta`, meta)
export const openItem = (id: string) => api.post<{ ok: true }>(`/catalog/items/${id}/open`)
export const setAgent = (id: string, agent: AgentId, on: boolean) =>
  on ? api.put<AgentState>(`/catalog/items/${id}/agents/${agent}`, {}) : api.delete<AgentState>(`/catalog/items/${id}/agents/${agent}`)
export const createItem = (body: { root: string; kind: Exclude<Kind, 'nota'>; slug: string; description: string }) =>
  api.post<{ ok: true }>('/catalog/items', body)

// ── skills.sh ──
export type SkillHit = { id: string; source: string; skillId: string; name: string; installs: number; installed: boolean }
export type SkillSearch = { skills: SkillHit[]; agentsDir: string; agentsDirPath: string; inRoots: boolean }
export type CliAgent = 'claude-code' | 'codex' | 'antigravity' | 'opencode'
export type InstallEvent = { type: 'line'; text: string } | { type: 'done'; ok: boolean; code: number; error?: string }

export const searchSkillsSh = (q: string) => api.get<SkillSearch>(`/catalog/skills-sh/search?q=${encodeURIComponent(q)}`)
export const installSkill = (body: { source: string; skillId: string; agents: CliAgent[] }, onEvent: (e: InstallEvent) => void, signal: AbortSignal) =>
  streamPost<InstallEvent>('/catalog/skills-sh/install', onEvent, signal, body)
