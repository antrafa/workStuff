import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'

export type Environment = 'DES' | 'ITG' | 'HML' | 'PRO'
export type HealthLevel = 'ok' | 'warning' | 'critical'

export type Kubeconfig = {
  id: string
  filename: string
  contexts: string[]
  currentContext: string
  environment: Environment | null
  environmentSource: 'manual' | 'nome' | null
  rancherUrl: string | null
  execAuth: boolean
  updatedAt: string
}

export type Session = { kubeconfig: Kubeconfig; context: string }

export type Pod = {
  name: string
  namespace: string
  status: string
  nodeName: string
  podIP: string
  containers: string[]
  imageTag: string | null
  memRequestMi: number
  memLimitMi: number
  memUsageMi: number | null
  cpuUsageM: number | null
  startTime: string
  restartCount: number
  readyContainers: string
  workload: { kind: string; name: string } | null
  health: { level: HealthLevel; reasons: string[] }
}

export type Node = {
  name: string
  status: 'Ready' | 'NotReady'
  kubeletVersion: string
  internalIP: string
  cpuCapacity: number
  memCapacityGi: number
  cpuUsage: number | null
  memUsageGi: number | null
  cpuRequested: number
  memRequestedGi: number
  pressures: string[]
}

export type PodEvent = { type: string; reason: string; message: string; count: number; at: string }
export type PodDetail = {
  labels: Record<string, string>
  images: { container: string; image: string; resolvedImage: string | null }[]
  configMaps: { name: string; data: Record<string, string>; error?: string }[]
}

// Ambientes onde o servidor aceita reiniciar; a política real é conferida no servidor.
export const canWrite = (env: Environment | null) => env === 'DES' || env === 'ITG' || env === 'HML'

const podPath = (p: { namespace: string; name: string }) => `/k8s/pods/${encodeURIComponent(p.namespace)}/${encodeURIComponent(p.name)}`

export const fetchKubeconfigs = () =>
  api.get<{ items: Kubeconfig[]; invalid: string[]; session: { kubeconfigId: string; context: string } | null }>('/k8s/kubeconfigs')
// Sem sessão o servidor responde {ok:true} em vez de null.
export const fetchSession = () => api.get<Session | { ok: true }>('/k8s/session').then(s => ('kubeconfig' in s ? s : null))
export const connect = (kubeconfigId: string, context?: string) => api.put<Session>('/k8s/session', { kubeconfigId, context })
export const disconnect = () => api.delete<{ ok: true }>('/k8s/session')
export const setEnvironment = (id: string, environment: Environment | null) =>
  api.put<{ ok: true }>(`/k8s/kubeconfigs/${encodeURIComponent(id)}/environment`, { environment })
export const uploadKubeconfig = (filename: string, content: string) => api.post<{ id: string }>('/k8s/kubeconfigs', { filename, content })
export const deleteKubeconfig = (id: string) => api.delete<{ ok: true }>(`/k8s/kubeconfigs/${encodeURIComponent(id)}`)
export const fetchNamespaces = () => api.get<{ namespaces: string[]; limitedRbac: boolean }>('/k8s/namespaces')
export const fetchPods = (namespace?: string) =>
  api.get<{ pods: Pod[]; metricsUnavailable: boolean }>(`/k8s/pods${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''}`)
export const fetchNodes = () => api.get<{ nodes: Node[]; metricsUnavailable: boolean; limitedRbac?: boolean }>('/k8s/nodes')
export const fetchPodEvents = (p: Pod) => api.get<PodEvent[]>(`${podPath(p)}/events`)
export const fetchPodDetail = (p: Pod) => api.get<PodDetail>(`${podPath(p)}/detail`)
export const restartPod = (p: Pod) => api.post<{ ok: true; workload: string }>(`${podPath(p)}/restart`)

export type LogOptions = { container?: string; tail: number | 'all'; previous: boolean; follow: boolean }
export function logsUrl(p: Pod, o: LogOptions) {
  const q = new URLSearchParams({ tail: String(o.tail), previous: String(o.previous), follow: String(o.follow) })
  if (o.container) q.set('container', o.container)
  return `/api${podPath(p)}/logs?${q}`
}

export type DiagnoseEvent =
  | { type: 'logs'; lines: number }
  | { type: 'text'; text: string }
  | { type: 'done'; provider: string; model: string; durationMs: number; stopped: boolean }
  | { type: 'error'; message: string }
  | { type: 'thinking' | 'tool' | 'tool-result' | 'status' | 'result' }

export const diagnosePod = (p: Pod, onEvent: (e: DiagnoseEvent) => void, signal: AbortSignal) =>
  streamPost<DiagnoseEvent>(`${podPath(p)}/diagnose`, onEvent, signal, { container: mainContainer(p), reasons: p.health.reasons })

// O sidecar do Istio não é a aplicação: o log que explica o problema é o do primeiro container de verdade.
export const mainContainer = (p: Pod) => p.containers.find(c => !/^istio-/.test(c)) ?? p.containers[0]

// Estado compartilhado com a barra do topo: sessão ativa e quantos pods com problema na última leitura.
type Shared = { session: Session | null; problems: number; loaded: boolean }
let shared: Shared = { session: null, problems: 0, loaded: false }
const listeners = new Set<() => void>()

export function setShared(patch: Partial<Shared>) {
  shared = { ...shared, ...patch }
  listeners.forEach(l => l())
}

export function refreshSession() {
  return fetchSession()
    .then(session => setShared({ session, loaded: true, ...(session ? {} : { problems: 0 }) }))
    .catch(() => setShared({ session: null, loaded: true }))
}

export function useClusterShared() {
  return useSyncExternalStore(
    l => (listeners.add(l), () => void listeners.delete(l)),
    () => shared,
  )
}
