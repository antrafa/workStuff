import { readFileSync, renameSync, writeFileSync } from 'node:fs'

export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw new Error(`arquivo ${path} ilegível: ${(e as Error).message}`)
  }
}

// Grava num temporário e renomeia: um crash no meio não deixa o JSON pela metade.
export function writeJson(path: string, data: unknown) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  renameSync(tmp, path)
}
