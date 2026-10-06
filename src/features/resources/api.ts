import { api } from '@/lib/api'

export type ResourceStack = { name: string; projectId: number; projectUrl: string; defaultBranch: string }
export type Client = { name: string; stacks: ResourceStack[] }

export type ResourceService = {
  path: string
  app: string
  service: string
  memReq: string | null
  memLim: string | null
  cpuReq: string | null
  cpuLim: string | null
  xms: string | null
  xmx: string | null
  metaspace: string | null
  maxMetaspace: string | null
  memReqMi: number | null
  memLimMi: number | null
  cpuReqMillis: number | null
  cpuLimMillis: number | null
}

export type Clients = { fetchedAt: string; clients: Client[] }
// failed: manifests GitLab did not deliver on the last read (timeout, 5xx error).
export type StackResources = { fetchedAt: string; services: ResourceService[]; failed?: string[] }

export const fetchClients = (refresh = false) =>
  refresh ? api.post<Clients>('/resources/clients/refresh') : api.get<Clients>('/resources/clients')
export const fetchStack = (projectId: number, refresh = false) =>
  refresh ? api.post<StackResources>(`/resources/stacks/${projectId}/refresh`) : api.get<StackResources>(`/resources/stacks/${projectId}`)
export const fetchManifest = (projectId: number, path: string) =>
  api.get<{ content: string }>(`/resources/stacks/${projectId}/manifest?path=${encodeURIComponent(path)}`)

// ── Live usage (the stack linked to a cluster namespace) ──
export type NamespaceLink = { kubeconfigId: string; context: string | null; namespace: string }
export type Recommendation = { level: 'critical' | 'warn' | 'info' | 'ok'; badge: string; text: string }
export type LiveService = { usageMi: number | null; replicas: number; pods: string[]; pct: number | null; recommendation: Recommendation | null }
export type Live = { link: NamespaceLink; environment: string | null; metricsUnavailable: boolean; readAt: string; services: Record<string, LiveService | undefined> }
export type KubeconfigOption = { id: string; environment: string | null; contexts: string[] }

export const fetchLink = (projectId: number) => api.get<{ link: NamespaceLink | null }>(`/resources/stacks/${projectId}/namespace-link`).then(r => r.link)
export const saveLink = (projectId: number, link: { kubeconfigId: string; namespace: string }) => api.put<{ ok: true }>(`/resources/stacks/${projectId}/namespace-link`, link)
export const removeLink = (projectId: number) => api.delete<{ ok: true }>(`/resources/stacks/${projectId}/namespace-link`)
export const fetchLive = (projectId: number) => api.get<Live>(`/resources/stacks/${projectId}/live`)
export const fetchKubeconfigs = () => api.get<{ items: KubeconfigOption[] }>('/k8s/kubeconfigs').then(r => r.items)
export const fetchNamespaces = (kubeconfigId: string) =>
  api.get<{ namespaces: string[]; limitedRbac: boolean }>(`/resources/namespaces?kubeconfigId=${encodeURIComponent(kubeconfigId)}`)

// ── Where manifests come from (a GitLab connection from Repositórios + a group) ──
export type ResourcesConfig = { sourceId: string; groupPath: string; label: string | null }
export type RepoSource = { id: string; provider: 'gitlab' | 'github'; label: string; url: string }

export const fetchConfig = () => api.get<{ config: ResourcesConfig | null }>('/resources/config').then(r => r.config)
export const testConfig = (body: { sourceId: string; groupPath: string }) => api.post<{ groupPath: string; clients: number }>('/resources/config/test', body)
export const saveConfig = (body: { sourceId: string; groupPath: string }) => api.put<{ groupPath: string; clients: number }>('/resources/config', body)
export const fetchRepoSources = () => api.get<RepoSource[]>('/repos/sources')
