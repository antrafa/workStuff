import { api } from '@/lib/api'

export type Os = 'linux' | 'darwin' | 'win32'
export type Port = { address: string; port: number; pid: number | null; process: string | null; panel: boolean }
export type ContainerRow = { id: string; name: string; image: string; state: string; status: string; ports: string; project: string | null }
export type Compose = { name: string; status: string; configFiles: string }
export type Image = { id: string; repository: string; tag: string; size: string; created: string; inUse: boolean }
export type Volume = { name: string; driver: string; inUse: boolean }
export type Services = {
  platform: string
  os: Os
  ports: Port[]
  docker: boolean
  containers: ContainerRow[]
  compose: Compose[]
  images: Image[]
  volumes: Volume[]
}
export type Action = 'start' | 'stop' | 'restart'

export const fetchServices = () => api.get<Services>('/local/services')
export const killPort = (pid: number, force: boolean) => api.post<{ ok: true; stillAlive: boolean }>(`/local/ports/${pid}/kill`, { force })
export const runAction = (kind: 'containers' | 'compose', target: string, action: Action) => api.post(`/local/${kind}/${encodeURIComponent(target)}/${action}`)
export const remove = (kind: 'containers' | 'images' | 'volumes', target: string) => api.delete(`/local/${kind}/${encodeURIComponent(target)}`)

// The same command the server runs, so the confirmation shows exactly what happens.
export const killCommand = (os: Os, pid: number, force: boolean) =>
  os === 'win32' ? `taskkill /PID ${pid}${force ? ' /F' : ''}` : `kill ${force ? '-KILL' : '-TERM'} ${pid}`

export const imageRef = (i: Image) => (i.tag && i.tag !== '<none>' ? `${i.repository}:${i.tag}` : i.id)
