import { api } from '@/lib/api'

export type Severity = 'crítica' | 'alta' | 'média' | 'baixa' | 'desconhecida'

export type Advisory = { id: string; aliases: string[]; summary: string; severity: Severity; fixedIn: string[]; url: string }

export type Dependency = {
  ecosystem: 'npm' | 'Maven'
  name: string
  declared: string
  version: string | null
  dev: boolean
  file: string
  advisories: Advisory[]
  latest: string | null
  majorsBehind: number | null
}

export type ScanResult = {
  path: string
  scannedAt: string
  files: string[]
  errors: string[]
  dependencies: Dependency[]
  bySeverity: Record<Severity, number>
}

export type HistoryEntry = { path: string; label: string; scannedAt: string; bySeverity: Record<Severity, number>; dependencies: number }

export type TrivyFinding = { target: string; pkg: string; installed: string; fixed: string | null; id: string; severity: Severity; title: string; url: string | null }

export const fetchStatus = () => api.get<{ trivy: boolean }>('/vulns/status')
export const fetchHistory = () => api.get<HistoryEntry[]>('/vulns/history')
export const fetchSaved = (path: string) => api.get<ScanResult>(`/vulns/history/scan?path=${encodeURIComponent(path)}`)
export const pickFolder = () => api.post<{ path: string | null }>('/vulns/pick-folder')
export const scan = (path: string) => api.post<ScanResult>('/vulns/scan', { path })
export const trivyFolder = (path: string) => api.post<{ target: string; findings: TrivyFinding[] }>('/vulns/trivy', { path })
export const trivyImage = (image: string) => api.post<{ target: string; findings: TrivyFinding[] }>('/vulns/trivy', { image })

export const SEVERITIES: Severity[] = ['crítica', 'alta', 'média', 'baixa', 'desconhecida']

export const SEVERITY_BADGE: Record<Severity, string> = {
  crítica: 'badge-crit', alta: 'badge-crit', média: 'badge-warn', baixa: 'badge-info', desconhecida: '',
}

const RANK: Record<Severity, number> = { crítica: 0, alta: 1, média: 2, baixa: 3, desconhecida: 4 }
export const bySeverity = (a: { severity: Severity }, b: { severity: Severity }) => RANK[a.severity] - RANK[b.severity]

// Pior severidade da dependência: ordena a tabela pelo que precisa de atenção primeiro.
export const worst = (d: Dependency) => d.advisories.reduce((min, a) => Math.min(min, RANK[a.severity]), 9)
