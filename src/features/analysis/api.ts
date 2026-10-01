import { api } from '@/lib/api'

export type ReportEntry = {
  report: string
  generatedAt: string
  gitCommit: string | null
  provider: string
  model: string
  durationMs: number
}

export type SavedReport = {
  projectPath: string
  pathLabel: string
  name: string
  generatedAt: string
  gitCommit: string | null
  provider: string
  model: string
  exists: boolean
  stale: boolean
  behind: number | null
  reportFile: string | null
  hasGraph: boolean
}

export type RunEvent =
  | { type: 'meta'; mode: 'cached' | 'full'; provider?: string; model?: string; persona?: boolean }
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: string; detail: string }
  | { type: 'status'; message: string }
  | { type: 'done'; entry: ReportEntry }
  | { type: 'error'; message: string }

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: string; detail: string }
  | { type: 'done'; provider: string; model: string; durationMs: number; stopped: boolean }
  | { type: 'error'; message: string }

const q = (projectPath: string) => `projectPath=${encodeURIComponent(projectPath)}`

export const fetchReports = () => api.get<{ items: SavedReport[] }>('/analysis/reports').then(r => r.items)
export const fetchReport = (projectPath: string) => api.get<{ entry: ReportEntry | null; stale: boolean }>(`/analysis/report?${q(projectPath)}`)
export const deleteReport = (projectPath: string) => api.delete<{ ok: true }>(`/analysis/report?${q(projectPath)}`)
export const pickFolder = () => api.post<{ path: string | null }>('/analysis/pick-folder')
export const saveToProject = (projectPath: string) => api.post<{ relativePath: string }>('/analysis/save-to-project', { projectPath })
export const graphUrl = (projectPath: string) => `/api/analysis/graph?${q(projectPath)}`
