import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import { tx } from '@/lib/i18n'

export type ProviderKind = 'gitlab' | 'github'
export type Protocol = 'ssh' | 'https'
export type TokenSource = 'stored' | 'env' | 'gh' | 'none'

export type Source = {
  id: string
  provider: ProviderKind
  url: string
  label: string
  protocol: Protocol
  tokenSource: TokenSource
  basePath: string
  workspace: string
  workspaceLabel: string
  workspaceExists: boolean
  token: string | null
}

export type SourceInput = {
  provider: ProviderKind
  url: string
  label?: string
  protocol: Protocol
  tokenSource: TokenSource
  token?: string
  basePath: string
  workspace: string
}

export type LocalState = 'cloned' | 'occupied' | 'free'
export type Group = { name: string; fullPath: string; description: string; dest: string | null }
export type Project = {
  name: string
  fullPath: string
  description: string
  archived: boolean
  lastActivity: string | null
  webUrl: string
  dest: string | null
  local: LocalState | null
}
export type Listing = { path: string; base: string; webUrl: string | null; dest: string | null; groups: Group[]; projects: Project[] }

export type CloneStatus = 'cloned' | 'exists' | 'skipped' | 'failed'
export type CloneResult = { fullPath: string; dest: string; status: CloneStatus; detail: string }
export type CloneEvent =
  | { type: 'start'; total: number; archivedSkipped: number }
  | ({ type: 'result' } & CloneResult)
  | { type: 'done'; summary: Record<CloneStatus, number>; stopped: boolean }

export const fetchSources = () => api.get<Source[]>('/repos/sources')
export const fetchHints = () => api.get<{ GITLAB_TOKEN: boolean; GITHUB_TOKEN: boolean; gh: boolean }>('/repos/hints')
export const testConnection = (body: Partial<SourceInput> & { id?: string }) => api.post<{ user: string; groups: number; projects: number }>('/repos/test', body)
export const sshCheck = (url: string) => api.post<{ ok: boolean; detail: string }>('/repos/ssh-check', { url })
export const createSource = (body: SourceInput) => api.post<Source>('/repos/sources', body)
export const updateSource = (id: string, body: SourceInput) => api.put<Source>(`/repos/sources/${id}`, body)
export const deleteSource = (id: string) => api.delete<{ ok: true }>(`/repos/sources/${id}`)
export const pickFolder = () => api.post<{ path: string | null }>('/repos/pick-folder')
export const browse = (id: string, path?: string) => api.get<Listing>(`/repos/sources/${id}/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`)
export const openProject = (id: string, fullPath: string) => api.post<{ ok: true }>(`/repos/sources/${id}/open`, { fullPath })
export const cloneRepos = (id: string, body: { fullPath: string; kind: 'project' | 'group'; includeArchived: boolean }, onEvent: (e: CloneEvent) => void, signal: AbortSignal) =>
  streamPost<CloneEvent>(`/repos/sources/${id}/clone`, onEvent, signal, body)

// Takes a path or a full URL: "https://gitlab.com/a/b/-/tree/x" → "a/b".
export function pathFromInput(raw: string) {
  const v = raw.trim()
  const noHost = /^https?:\/\//.test(v) ? v.replace(/^https?:\/\/[^/]+/, '') : v
  return noHost.split('/-/')[0].replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
}

export const tilde = (p: string | null) => (p ? p.replace(/^\/home\/[^/]+/, '~') : '—')

// Path shown from the connection's workspace ("~/workspace/produto/…"), shorter than the absolute one.
// Only the part below the workspace ("produto/backend/api"): in the list rows that is what changes.
export const belowWorkspace = (s: Pick<Source, 'workspace'>, p: string | null) =>
  p && p.startsWith(s.workspace) ? p.slice(s.workspace.length).replace(/^\//, '') || tx({ en: '(workspace root)', pt: '(raiz do workspace)' }) : tilde(p)

export const inWorkspace = (s: Pick<Source, 'workspace' | 'workspaceLabel'>, p: string | null) =>
  p && p.startsWith(s.workspace) ? `${s.workspaceLabel}${p.slice(s.workspace.length)}` : tilde(p)

export type ArtifactDir = 'target' | 'node_modules' | 'dist' | 'build'

export type WorkspaceRepo = {
  name: string
  path: string
  relPath: string
  workspace: string
  workspaceLabel: string
  branch: string
  dirtyCount: number
  stashCount: number
  ahead: number
  behind: number
  compareRef: string | null
  lastCommitAt: string | null
  lastCommitSubject: string | null
  mergedBranches: string[]
  artifactDirs: ArtifactDir[]
  artifactBytes: number
  artifactPartial: boolean
}

export type WorkspaceScan = {
  workspaces: { path: string; label: string }[]
  repos: WorkspaceRepo[]
}

export const fetchWorkspace = () => api.get<WorkspaceScan>('/repos/workspace')
export const openWorkspaceRepo = (repoPath: string) => api.post<{ ok: true }>('/repos/workspace/open', { repoPath })
export const fetchGitWorkspaceRepo = (repoPath: string) => api.post<WorkspaceRepo>('/repos/workspace/fetch', { repoPath })
export const pruneWorkspaceBranches = (repoPath: string) =>
  api.post<{ deleted: string[]; repo: WorkspaceRepo }>('/repos/workspace/prune-branches', { repoPath })
export const cleanWorkspaceArtifacts = (repoPath: string, dirs?: ArtifactDir[]) =>
  api.post<{ cleaned: ArtifactDir[]; freedBytes: number; freedPartial: boolean; repo: WorkspaceRepo }>('/repos/workspace/clean-artifacts', { repoPath, dirs })

