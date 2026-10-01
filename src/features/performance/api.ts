import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import type { PodSample } from './trend'

export type Status = 'running' | 'stopped' | 'failed'
export type Target = { pod: string; containers: string[] }

export type Observation = {
  id: string
  kubeconfigId: string
  context: string
  namespace: string
  targets: Target[]
  intervalSeconds: number
  status: Status
  startedAt: string
  stoppedAt: string | null
  failure: string | null
  lastTickAt: string | null
  lastError: string | null
  meshOff: string | null
  throttleOff: string | null
  live: boolean
}

export type MeshWindow = { workload: string; requests: number; errors: number; rps: number | null; avgMs: number | null; p50Ms: number | null; p95Ms: number | null; p99Ms: number | null }
export type Sample = { t: string; pods: PodSample[]; events: { pod: string; reason: string; message: string; t: string }[]; mesh: MeshWindow[] | null; backfilled?: boolean }

export type ReportMeta = { id: string; observationId: string; namespace: string; pods: number; from: string; to: string; historyHours: number; generatedAt: string; provider: string; model: string }

export type KubeconfigOption = { id: string; contexts: string[]; currentContext: string; environment: string | null }

export const fetchKubeconfigs = () => api.get<{ items: KubeconfigOption[]; session: { kubeconfigId: string; context: string } | null }>('/k8s/kubeconfigs')

const q = (kubeconfigId: string, context: string) => `kubeconfigId=${encodeURIComponent(kubeconfigId)}&context=${encodeURIComponent(context)}`
export const fetchNamespaces = (k: string, c: string) => api.get<{ namespaces: string[]; limitedRbac: boolean }>(`/performance/namespaces?${q(k, c)}`)
export const fetchPods = (k: string, c: string, ns: string) =>
  api.get<{ pods: { name: string; containers: string[] }[] }>(`/performance/pods?${q(k, c)}&namespace=${encodeURIComponent(ns)}`).then(r => r.pods)

export const fetchObservations = () => api.get<{ observations: Observation[] }>('/performance/observations').then(r => r.observations)
export const startObservation = (body: { kubeconfigId: string; context: string; namespace: string; targets: Target[]; intervalSeconds: number }) =>
  api.post<Observation>('/performance/observations', body)
export const stopObservation = (id: string) => api.post(`/performance/observations/${id}/stop`)
export const resumeObservation = (id: string) => api.post<Observation>(`/performance/observations/${id}/resume`)
export const deleteObservation = (id: string) => api.delete(`/performance/observations/${id}`)
export const fetchHistory = (id: string, hours: number) => api.get<{ samples: Sample[]; hours: number; stepSec: number }>(`/performance/observations/${id}/history?hours=${hours}`)

// Backlog de uma vez e depois as amostras novas; "stopped" quando não há coleta ativa.
export type StreamEvent = { type: 'backlog'; samples: Sample[] } | { type: 'sample'; sample: Sample } | { type: 'stopped'; status: Status; failure: string | null }
export const openStream = (id: string, onEvent: (e: StreamEvent) => void) => {
  const es = new EventSource(`/api/performance/observations/${id}/stream`)
  es.onmessage = m => {
    const e = JSON.parse(m.data) as StreamEvent
    onEvent(e)
    if (e.type === 'stopped') es.close()
  }
  return () => es.close()
}

export type ReportEvent = { type: 'text'; text: string } | { type: 'status'; message: string } | { type: 'done'; report: ReportMeta } | { type: 'error'; message: string } | { type: 'tool' | 'tool-result' | 'thinking' | 'result' }
export const generateReport = (id: string, body: { from: string; to: string; historyHours: number }, onEvent: (e: ReportEvent) => void, signal: AbortSignal) =>
  streamPost<ReportEvent>(`/performance/observations/${id}/report`, onEvent, signal, body)
export const fetchReports = () => api.get<{ reports: ReportMeta[] }>('/performance/reports').then(r => r.reports)
export const fetchReport = (id: string) => api.get<ReportMeta & { report: string }>(`/performance/reports/${id}`)
export const deleteReport = (id: string) => api.delete(`/performance/reports/${id}`)
