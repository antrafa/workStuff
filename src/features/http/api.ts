import { api } from '@/lib/api'
import type { HeaderPair } from './requestText'

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export type SavedRequest = { id: string; name: string; group: string; method: string; url: string; headers: string; body: string }
export type HttpEnvironment = { id: string; name: string; vars: string }
export type HttpStore = { requests: SavedRequest[]; environments: HttpEnvironment[] }
export type HttpAnswer = {
  status: number
  statusText: string
  url: string
  headers: HeaderPair[]
  body: string
  binary: boolean
  bytes: number
  truncated: boolean
  ms: number
}

export const fetchStore = () => api.get<HttpStore>('/http/store')
export const saveStore = (store: HttpStore) => api.put<HttpStore>('/http/store', store)
export const sendRequest = (req: { method: string; url: string; headers: HeaderPair[]; body: string }) => api.post<HttpAnswer>('/http/send', req)
