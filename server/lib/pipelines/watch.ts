// Projetos acompanhados na tela Pipelines: uma conexão do Repositórios + o caminho do projeto nela.

import { randomUUID } from 'node:crypto'
import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { localState } from '../repos/clone.ts'
import { localPathFor, normalizePath } from '../repos/layout.ts'
import { RepoError, getSource, resolveToken, type Source } from '../repos/sources.ts'
import type { Conn } from '../repos/providers.ts'

export type Watch = { id: string; sourceId: string; fullPath: string }

const FILE = dataFile('pipelines-watch.json')
const MAX = 50

export const listWatches = () => readJson<Watch[]>(FILE, [])

export function getWatch(id: string) {
  const w = listWatches().find(x => x.id === id)
  if (!w) throw new RepoError('projeto não acompanhado', 404)
  return w
}

export function addWatch(sourceId: string, rawPath: string): Watch {
  getSource(sourceId)
  const fullPath = normalizePath(rawPath)
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/.test(fullPath)) throw new RepoError('informe o caminho completo do projeto (ex.: grupo/projeto)')
  const all = listWatches()
  const existing = all.find(w => w.sourceId === sourceId && w.fullPath === fullPath)
  if (existing) return existing
  if (all.length >= MAX) throw new RepoError(`no máximo ${MAX} projetos acompanhados`)
  const watch = { id: randomUUID(), sourceId, fullPath }
  writeJson(FILE, [...all, watch])
  return watch
}

export function removeWatch(id: string) {
  getWatch(id)
  writeJson(FILE, listWatches().filter(w => w.id !== id))
}

// Conexão que deveria ter token e não tem vira erro: seguir anônimo funciona em projeto público e
// quebra em 403 no log do job, longe da causa.
export async function connFor(s: Source): Promise<Conn> {
  const token = await resolveToken(s.provider, s.tokenSource, s.id)
  if (!token && s.tokenSource !== 'none') {
    const why = s.tokenSource === 'gh'
      ? 'o gh não entregou o token (o comando "gh auth token" exige gh 2.17 ou mais novo, e o login precisa estar ativo)'
      : s.tokenSource === 'env' ? 'a variável de ambiente do token está vazia no servidor' : 'o token salvo não foi encontrado'
    throw new RepoError(`a conexão ${s.label} está sem token: ${why}. Ajuste na tela Repositórios.`, 401)
  }
  return { provider: s.provider, url: s.url, token }
}

// Pasta do clone no workspace, se existir: dá à IA o código para ler ao explicar a falha.
export function localClone(s: Source, fullPath: string): string | null {
  try {
    const dest = localPathFor(s.workspace, s.basePath, fullPath)
    return localState(dest) === 'cloned' ? dest : null
  } catch {
    return null // projeto fora do grupo base: não há destino previsível
  }
}
