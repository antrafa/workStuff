// Server-side text in the language chosen in Configurações (error messages the screens show).
import type { Pair } from './lang.ts'
import { readSettings } from './settingsStore.ts'

export const say = <T>(pair: Pair<T>): T => pair[readSettings().language]
