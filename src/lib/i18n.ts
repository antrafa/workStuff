// The interface language, read once before any module with interface text is imported (main.tsx).
// Changing it in Configurações reloads the page, so no component has to re-render on its own.
import { DEFAULT_LANG, isLang, type Lang, type Pair } from '../../server/lib/lang.ts'

const CACHE_KEY = 'workstuff-language'
let current: Lang = DEFAULT_LANG

export const language = () => current
export const tx = <T>(pair: Pair<T>): T => pair[current]
// For dates and numbers formatted by the browser
export const locale = () => (current === 'pt' ? 'pt-BR' : 'en-US')

function apply(lang: Lang) {
  current = lang
  document.documentElement.lang = locale()
  try {
    localStorage.setItem(CACHE_KEY, lang)
  } catch {
    // private window: the server setting still applies on the next load
  }
}

// The server setting wins; the cached value covers a server that is not up yet.
export async function loadLanguage(): Promise<void> {
  let cached: string | null = null
  try {
    cached = localStorage.getItem(CACHE_KEY)
  } catch {
    // no storage
  }
  const fromServer = await fetch('/api/settings').then(r => r.json()).then(d => d?.settings?.language, () => undefined)
  apply(isLang(fromServer) ? fromServer : isLang(cached) ? cached : DEFAULT_LANG)
}

export function switchLanguage(lang: Lang) {
  apply(lang)
  location.reload()
}
