import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'

export type Status = 'success' | 'failed' | 'running' | 'pending' | 'canceled' | 'skipped' | 'manual' | 'unknown'

export type Pipeline = {
  id: string
  status: Status
  ref: string
  sha: string
  title: string
  webUrl: string
  createdAt: string
  durationSec: number | null
}

export type Job = {
  id: string
  name: string
  stage: string
  status: Status
  allowFailure: boolean
  failedStep: string | null
  webUrl: string
  durationSec: number | null
}

export type Watch = {
  id: string
  sourceId: string
  fullPath: string
  provider: 'gitlab' | 'github' | null
  sourceLabel: string | null
  latest: Pipeline | null
  error: string | null
}

export type ExplainEvent =
  | { type: 'log'; lines: number; truncated: boolean; clone: string | null }
  | { type: 'text'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done'; provider: string; model: string; durationMs: number; stopped: boolean }
  | { type: string }

export const fetchWatches = () => api.get<Watch[]>('/pipelines/watch')
export const addWatch = (sourceId: string, fullPath: string) => api.post('/pipelines/watch', { sourceId, fullPath })
export const removeWatch = (id: string) => api.delete(`/pipelines/watch/${id}`)
export const fetchPipelines = (id: string) => api.get<Pipeline[]>(`/pipelines/watch/${id}/pipelines`)
export const fetchJobs = (id: string, pipelineId: string) => api.get<Job[]>(`/pipelines/watch/${id}/pipelines/${pipelineId}/jobs`)
export const fetchJobLog = (id: string, jobId: string) => api.get<{ text: string; truncated: boolean }>(`/pipelines/watch/${id}/jobs/${jobId}/log`)

export const explainJob = (watchId: string, job: Job, ref: string, onEvent: (e: ExplainEvent) => void, signal: AbortSignal) =>
  streamPost<ExplainEvent>(`/pipelines/watch/${watchId}/jobs/${job.id}/explain`, onEvent, signal, {
    name: job.name, stage: job.stage, failedStep: job.failedStep ?? '', ref,
  })

export const STATUS: Record<Status, { label: string; badge: string }> = {
  success: { label: 'passou', badge: 'badge-ok' },
  failed: { label: 'falhou', badge: 'badge-crit' },
  running: { label: 'rodando', badge: 'badge-info' },
  pending: { label: 'na fila', badge: 'badge-info' },
  manual: { label: 'manual', badge: 'badge-warn' },
  canceled: { label: 'cancelada', badge: 'badge-warn' },
  skipped: { label: 'pulada', badge: '' },
  unknown: { label: 'desconhecido', badge: '' },
}

export function duration(sec: number | null) {
  if (sec === null) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  return m < 60 ? `${m}min ${sec % 60}s` : `${Math.floor(m / 60)}h ${m % 60}min`
}
