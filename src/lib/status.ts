import { api } from './api'

export type MachineStatus = {
  tools: { name: string; version: string | null }[]
  agents: { name: string; installed: boolean }[]
  port: number
  tunnels?: { count: number; sensitiveCount: number; environments: string[] }
}

export const fetchStatus = () => api.get<MachineStatus>('/status')

export const requestShutdown = () => api.post<{ ok: boolean; message: string }>('/status/shutdown')
