// Interface languages. Plain values only: the web app imports this file too.
// Each text lives where it is used as a pair, so a reader sees both and the typecheck
// refuses a text without its translation.

export type Lang = 'en' | 'pt'
export const LANGS: Lang[] = ['en', 'pt']
// English is the main interface; Portuguese is the option
export const DEFAULT_LANG: Lang = 'en'
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'pt'

export type Pair<T = string> = { en: T; pt: T }
