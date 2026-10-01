import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'

export const STATUSES = ['ideia', 'em-andamento', 'finalizado', 'precisa-melhoria'] as const
export type Status = (typeof STATUSES)[number]
export type ItemMeta = { status?: Status; notes?: string }

type Config = { roots: string[] }

const CONFIG_FILE = dataFile('catalog.json')
const META_FILE = dataFile('catalog-meta.json')

export const readConfig = () => readJson<Config>(CONFIG_FILE, { roots: [] })
export const readMeta = () => readJson<Record<string, ItemMeta>>(META_FILE, {})

export function saveRoots(roots: string[]) {
  writeJson(CONFIG_FILE, { ...readConfig(), roots })
}

export function saveMeta(path: string, patch: ItemMeta) {
  const meta = readMeta()
  meta[path] = { ...meta[path], ...patch }
  writeJson(META_FILE, meta)
}
