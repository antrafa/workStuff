import { api } from '@/lib/api'

export type Removal = { apiVersion: string; kind: string; removedIn: string; replacement: string | null }
export type ObjectHit = { kind: string; namespace: string | null; name: string; appliedWith: string; removal: Removal }
export type DeprecatedCall = { group: string; version: string; resource: string; removedRelease: string }

export type ClusterReport = {
  context: string
  serverVersion: string | null
  target: string
  objects: ObjectHit[]
  deprecatedCalls: DeprecatedCall[] | null
  forbidden: string[]
  scanned: number
}

export type ManifestHit = { file: string; line: number; apiVersion: string; kind: string; name: string | null; removal: Removal }
export type ManifestReport = { path: string; target: string; files: number; hits: ManifestHit[] }

export type CertState = 'ok' | 'vence-logo' | 'vencido' | 'inacessível' | 'sem-certificado'
export type CertInfo = { validTo: string | null; daysLeft: number | null; state: CertState; detail: string; trusted?: boolean | null }
export type IngressCert = { host: string; ingresses: string[]; info: CertInfo }
export type KubeconfigCerts = { id: string; environment: string | null; users: { user: string; info: CertInfo }[]; error: string | null }

const query = (params: Record<string, string>) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
  return q ? `?${q}` : ''
}

export const fetchClusterReport = (target: string, namespace: string) => api.get<ClusterReport>(`/upgrade/cluster${query({ target, namespace })}`)
export const fetchIngressCerts = (namespace: string) => api.get<{ context: string; forbidden: string[]; certificates: IngressCert[] }>(`/upgrade/certificates${query({ namespace })}`)
export const fetchKubeconfigCerts = () => api.get<KubeconfigCerts[]>('/upgrade/kubeconfigs')
export const scanManifests = (path: string, target: string) => api.post<ManifestReport>('/upgrade/manifests', { path, target })
export const pickFolder = () => api.post<{ path: string | null }>('/upgrade/pick-folder')

export const CERT_BADGE: Record<CertState, { badge: string; label: string }> = {
  ok: { badge: 'badge-ok', label: 'ok' },
  'vence-logo': { badge: 'badge-warn', label: 'vence logo' },
  vencido: { badge: 'badge-crit', label: 'vencido' },
  inacessível: { badge: '', label: 'inacessível' },
  'sem-certificado': { badge: '', label: 'sem data' },
}

export function expiry(info: CertInfo) {
  if (info.daysLeft === null || !info.validTo) return '—'
  const date = new Date(info.validTo).toLocaleDateString('pt-BR')
  return info.daysLeft < 0 ? `${date} (há ${-info.daysLeft} d)` : `${date} (${info.daysLeft} d)`
}
