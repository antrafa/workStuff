import { dataFile } from './paths.ts'
import { readJson, writeJson } from './jsonFile.ts'
import { isProviderId, type ProviderId } from './aiProviders.ts'

export type Settings = { provider: ProviderId; model: string; effort: string }

const FILE = dataFile('settings.json')

// Claude primeiro: é o único provedor em que as guardas de comando existem de fato.
const DEFAULTS: Settings = { provider: 'claude', model: 'opus', effort: 'medium' }

export const readSettings = (): Settings => ({ ...DEFAULTS, ...readJson<Partial<Settings>>(FILE, {}) })

const MODEL_ID = /^[\w.:/-]{1,200}$/
const EFFORT = /^[a-z]{1,20}$/

// Valida na fronteira: o modelo e o esforço viram argumento de linha de comando dos CLIs depois.
export function parseSettings(body: unknown): Settings {
  const b = (body ?? {}) as Record<string, unknown>
  if (!isProviderId(b.provider)) throw new Error('provedor inválido: use claude, agy ou codex')
  if (typeof b.model !== 'string' || !MODEL_ID.test(b.model)) throw new Error('id de modelo inválido: use letras, números e . _ : / -')
  if (typeof b.effort !== 'string' || !EFFORT.test(b.effort)) throw new Error('nível de esforço inválido')
  return { provider: b.provider, model: b.model, effort: b.effort }
}

export function saveSettings(settings: Settings) {
  writeJson(FILE, settings)
  return settings
}
