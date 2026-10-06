import { dataFile } from './paths.ts'
import { readJson, writeJson } from './jsonFile.ts'
import { isProviderId, type ProviderId } from './aiProviders.ts'
import { DEFAULT_LANG, isLang, type Lang } from './lang.ts'

export type Settings = { provider: ProviderId; model: string; effort: string; language: Lang }

const FILE = dataFile('settings.json')

// Claude primeiro: é o único provedor em que as guardas de comando existem de fato.
const DEFAULTS: Settings = { provider: 'claude', model: 'opus', effort: 'medium', language: DEFAULT_LANG }

export const readSettings = (): Settings => ({ ...DEFAULTS, ...readJson<Partial<Settings>>(FILE, {}) })

const MODEL_ID = /^[\w.:/-]{1,200}$/
const EFFORT = /^[a-z]{1,20}$/

// Valida na fronteira: o modelo e o esforço viram argumento de linha de comando dos CLIs depois.
export function parseSettings(body: unknown): Settings {
  const b = (body ?? {}) as Record<string, unknown>
  // The chosen language wins over the current one: the request is changing it
  const lang = isLang(b.language) ? b.language : readSettings().language
  const say = (en: string, pt: string) => (lang === 'pt' ? pt : en)
  if (!isProviderId(b.provider)) throw new Error(say('invalid provider: use claude, agy or codex', 'provedor inválido: use claude, agy ou codex'))
  if (typeof b.model !== 'string' || !MODEL_ID.test(b.model)) throw new Error(say('invalid model id: use letters, numbers and . _ : / -', 'id de modelo inválido: use letras, números e . _ : / -'))
  if (typeof b.effort !== 'string' || !EFFORT.test(b.effort)) throw new Error(say('invalid effort level', 'nível de esforço inválido'))
  // Optional: a client that does not send it keeps the current language
  const language = b.language === undefined ? readSettings().language : b.language
  if (!isLang(language)) throw new Error(say('invalid language: use en or pt', 'idioma inválido: use en ou pt'))
  return { provider: b.provider, model: b.model, effort: b.effort, language }
}

export function saveSettings(settings: Settings) {
  writeJson(FILE, settings)
  return settings
}
