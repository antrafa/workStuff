// Projetos acompanhados na tela Pipelines: uma conexão do Repositórios + o caminho do projeto nela.

import { randomUUID } from 'node:crypto'
import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { localState } from '../repos/clone.ts'
import { localPathFor, normalizePath } from '../repos/layout.ts'
import { RepoError, getSource, resolveToken, type Source } from '../repos/sources.ts'
import type { Conn } from '../repos/providers.ts'
import { say } from '../i18n.ts'

export type Watch = { id: string; sourceId: string; fullPath: string }

const FILE = dataFile('pipelines-watch.json')
const MAX = 50

export const listWatches = () => readJson<Watch[]>(FILE, [])

export function getWatch(id: string) {
  const w = listWatches().find(x => x.id === id)
  if (!w) throw new RepoError(say({ en: 'project not followed', pt: 'projeto não acompanhado' }), 404)
  return w
}

export function addWatch(sourceId: string, rawPath: string): Watch {
  getSource(sourceId)
  const fullPath = normalizePath(rawPath)
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/.test(fullPath)) throw new RepoError(say({ en: "enter the project's full path (e.g. group/project)", pt: 'informe o caminho completo do projeto (ex.: grupo/projeto)' }))
  const all = listWatches()
  const existing = all.find(w => w.sourceId === sourceId && w.fullPath === fullPath)
  if (existing) return existing
  if (all.length >= MAX) throw new RepoError(say({ en: `at most ${MAX} followed projects`, pt: `no máximo ${MAX} projetos acompanhados` }))
  const watch = { id: randomUUID(), sourceId, fullPath }
  writeJson(FILE, [...all, watch])
  return watch
}

export function removeWatch(id: string) {
  getWatch(id)
  writeJson(FILE, listWatches().filter(w => w.id !== id))
}

// A connection that should have a token and has none is an error: going on anonymously works on a
// public project and breaks with a 403 in the job log, far from the cause.
export async function connFor(s: Source): Promise<Conn> {
  const token = await resolveToken(s.provider, s.tokenSource, s.id)
  if (!token && s.tokenSource !== 'none') {
    const why = s.tokenSource === 'gh'
      ? say({ en: 'gh did not hand over the token (the "gh auth token" command needs gh 2.17 or newer, and the login must be active)', pt: 'o gh não entregou o token (o comando "gh auth token" exige gh 2.17 ou mais novo, e o login precisa estar ativo)' })
      : s.tokenSource === 'env'
        ? say({ en: "the token's environment variable is empty on the server", pt: 'a variável de ambiente do token está vazia no servidor' })
        : say({ en: 'the saved token was not found', pt: 'o token salvo não foi encontrado' })
    throw new RepoError(say({ en: `the connection ${s.label} has no token: ${why}. Fix it in the Repositories screen.`, pt: `a conexão ${s.label} está sem token: ${why}. Ajuste na tela Repositórios.` }), 401)
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
