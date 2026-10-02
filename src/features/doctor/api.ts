import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'

export type CheckStatus = 'ok' | 'falta' | 'aviso'
export type Execution = 'auto' | 'manual' | 'instrucao'
export type Check = { grupo: string; item: string; status: CheckStatus; detalhe: string; correcao: string; execucao: Execution }

export type FixEvent = { type: 'line'; text: string } | { type: 'done'; ok: boolean; code: number; error?: string }

export type Platform = { os: 'linux' | 'darwin' | 'win32'; family: string | null; label: string }
export const fetchChecks = () => api.get<{ items: Check[]; platform: Platform }>('/doctor')
export const runFix = (c: Check, onEvent: (e: FixEvent) => void, signal: AbortSignal) =>
  streamPost<FixEvent>('/doctor/fix', onEvent, signal, { grupo: c.grupo, item: c.item })

export type DoctorConfig = {
  mavenRegistries: { label: string; match: string }[]
  npmScopes: string[]
  urls: { label: string; url: string }[]
  javaVersions: string[]
  mavenVersions: string[]
  nodeVersions: string[]
}
export const fetchConfig = () => api.get<{ config: DoctorConfig; defaults: DoctorConfig }>('/doctor/config')
export const saveConfig = (c: DoctorConfig) => api.put<{ config: DoctorConfig }>('/doctor/config', c)
