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

export type App = { id: string; name: string; cwd: string; cmd: string; args: string[]; env: Record<string, string>; port: number | null; url: string | null }
export type AppInput = Omit<App, 'id'>
// pid: the process the panel started, if alive; portPid: who listens on the app's port now.
export type AppStatus = App & { pid: number | null; portOpen: boolean; portPid: number | null }

export const fetchApps = () => api.get<AppStatus[]>('/local/apps')
export const saveApp = (input: AppInput, id?: string) => (id ? api.put<App>(`/local/apps/${encodeURIComponent(id)}`, input) : api.post<App>('/local/apps', input))
export const deleteApp = (id: string) => api.delete(`/local/apps/${encodeURIComponent(id)}`)
export const appAction = (id: string, action: Action, force = false) => api.post<{ stillAlive?: boolean }>(`/local/apps/${encodeURIComponent(id)}/${action}`, { force })
export const appLogsUrl = (id: string) => `/api/local/apps/${encodeURIComponent(id)}/logs`

// Shown in the card and in the confirmation: arguments with spaces go between quotes.
export const commandLine = (a: Pick<App, 'cmd' | 'args'>) => [a.cmd, ...a.args].map(s => (/\s/.test(s) ? `"${s}"` : s)).join(' ')

export type TunnelTargetKind = 'svc' | 'pod' | 'deploy'
export type TunnelEnvironment = 'DES' | 'ITG' | 'HML' | 'PRO' | null

export type Tunnel = {
  id: string
  name: string
  profile: string | null
  kubeconfigId: string
  context: string
  namespace: string
  targetKind: TunnelTargetKind
  targetName: string
  localPort: number
  remotePort: number
}

export type TunnelInput = Omit<Tunnel, 'id'>

export type TunnelStatus = Tunnel & {
  pid: number | null
  portOpen: boolean
  portPid: number | null
  environment: TunnelEnvironment
  sensitive: boolean
  lastError: string | null
  kubeconfigFile: string
}

export const fetchTunnels = () => api.get<TunnelStatus[]>('/local/tunnels')
export const saveTunnel = (input: TunnelInput, id?: string) =>
  id ? api.put<Tunnel>(`/local/tunnels/${encodeURIComponent(id)}`, input) : api.post<Tunnel>('/local/tunnels', input)
export const deleteTunnel = (id: string) => api.delete(`/local/tunnels/${encodeURIComponent(id)}`)
export const tunnelAction = (id: string, action: Action, opts?: { force?: boolean; confirmSensitive?: boolean }) =>
  api.post<{ stillAlive?: boolean }>(`/local/tunnels/${encodeURIComponent(id)}/${action}`, opts ?? {})
export const tunnelProfileAction = (profile: string, action: 'start' | 'stop', confirmSensitive = false) =>
  api.post<{ started: string[]; stopped: string[]; errors: string[] }>(`/local/tunnels/profile/${action}`, { profile, confirmSensitive })
export const tunnelLogsUrl = (id: string) => `/api/local/tunnels/${encodeURIComponent(id)}/logs`

export const tunnelCommandLine = (t: Pick<TunnelStatus, 'kubeconfigFile' | 'context' | 'namespace' | 'targetKind' | 'targetName' | 'localPort' | 'remotePort'>) =>
  `kubectl --kubeconfig ${t.kubeconfigFile}${t.context ? ` --context ${t.context}` : ''} -n ${t.namespace} port-forward ${t.targetKind}/${t.targetName} ${t.localPort}:${t.remotePort}`

