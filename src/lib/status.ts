import { api } from './api'

export type MachineStatus = { tools: { name: string; version: string | null }[]; agents: { name: string; installed: boolean }[]; port: number }

export const fetchStatus = () => api.get<MachineStatus>('/status')
