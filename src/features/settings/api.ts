import { api } from '@/lib/api'

export type ProviderId = 'claude' | 'agy' | 'codex'

export type Model = {
  id: string
  label: string
  description?: string
  alias?: boolean
  recommended?: boolean
  efforts?: string[]
  defaultEffort?: string
}

// De onde a lista de modelos veio. Nunca é fixa no código: o servidor lê do próprio CLI.
export type ModelSource = { kind: 'alias' | 'cli'; command: string; fetchedAt: string | null; error: string | null }

export type Provider = {
  id: ProviderId
  name: string
  bin: string
  installed: boolean
  path: string | null
  nativeGuard: boolean
  models: Model[]
  source: ModelSource
}

export type Settings = { provider: ProviderId; model: string; effort: string }

export const fetchSettings = () => api.get<{ settings: Settings; providers: Provider[] }>('/settings')
export const saveSettings = (settings: Settings) => api.put<{ settings: Settings }>('/settings', settings)
export const refreshModels = (provider: Provider) => api.post<Provider>(`/ai/providers/${provider.id}/models/refresh`)
