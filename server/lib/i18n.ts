// Server-side text in the language chosen in Configurações (error messages the screens show).
// Only the running server follows that setting (server/index.ts turns it on): selfchecks and
// scripts import these modules too, and they must neither read the user's settings nor change
// their answers with them, so they always get the default language.
import { DEFAULT_LANG, type Pair } from './lang.ts'
import { readSettings } from './settingsStore.ts'

let followsSettings = false
export const followSettingsLanguage = () => {
  followsSettings = true
}

export const say = <T>(pair: Pair<T>): T => pair[followsSettings ? readSettings().language : DEFAULT_LANG]
