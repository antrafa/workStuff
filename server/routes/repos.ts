import { Router, type Request, type Response } from 'express'
import { pickFolder, openInEditor } from '../lib/desktop.ts'
import { openSse } from '../lib/sse.ts'
import { localPathFor, normalizePath, relativeToBase } from '../lib/repos/layout.ts'
import { children, project, projectsUnder, whoami, type Conn } from '../lib/repos/providers.ts'
import { cloneMany, localState, sshCheck, type CloneResult } from '../lib/repos/clone.ts'
import {
  RepoError, deleteSource, getSource, listSources, publicSource, resolveToken, saveSource, tokenHints, validateInput, type Source,
} from '../lib/repos/sources.ts'

export const reposRouter = Router()

const handle = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json((await fn(req)) ?? { ok: true })
  } catch (e) {
    if (!(e instanceof RepoError)) throw e
    res.status(e.status).json({ error: e.message })
  }
}

const connOf = async (s: Source): Promise<Conn> => ({ provider: s.provider, url: s.url, token: await resolveToken(s.provider, s.tokenSource, s.id) })

reposRouter.get('/hints', handle(() => tokenHints()))
reposRouter.post('/pick-folder', handle(async () => ({ path: await pickFolder('Pasta base do workspace') })))
reposRouter.get('/sources', handle(async () => Promise.all(listSources().map(publicSource))))

// Passo "testar" do assistente: confere URL e token antes de salvar, sem gravar nada.
reposRouter.post('/test', handle(async req => {
  const b = (req.body ?? {}) as Record<string, unknown>
  const input = validateInput({ ...b, workspace: b.workspace || '/tmp', protocol: b.protocol || 'https' })
  const token = await resolveToken(input.provider, input.tokenSource, typeof b.id === 'string' ? b.id : undefined, input.token)
  if (input.tokenSource !== 'none' && !token) throw new RepoError('nenhum token encontrado nessa origem')
  const conn: Conn = { provider: input.provider, url: input.url, token }
  const user = await whoami(conn)
  const root = await children(conn, input.basePath)
  return { user, groups: root.groups.length, projects: root.projects.length }
}))

reposRouter.post('/ssh-check', handle(async req => {
  const url = typeof req.body?.url === 'string' ? req.body.url : ''
  if (!/^https:\/\//.test(url)) throw new RepoError('URL inválida')
  return sshCheck(url)
}))

reposRouter.post('/sources', handle(async req => publicSource(saveSource(validateInput(req.body ?? {})))))
reposRouter.put('/sources/:id', handle(async req => {
  getSource(req.params.id as string)
  return publicSource(saveSource(validateInput({ ...req.body, id: req.params.id }), req.params.id as string))
}))
reposRouter.delete('/sources/:id', handle(req => deleteSource(req.params.id as string)))

// Navegação: filhos de um grupo, com o estado local de cada um (clonado, pasta ocupada, livre).
reposRouter.get('/sources/:id/browse', handle(async req => {
  const s = getSource(req.params.id as string)
  const path = normalizePath(typeof req.query.path === 'string' && req.query.path ? req.query.path : s.basePath)
  const list = await children(await connOf(s), path)
  const place = (fullPath: string) => {
    try {
      return localPathFor(s.workspace, s.basePath, fullPath)
    } catch {
      return null // fora da base (ex.: raiz do GitHub): não há destino previsível
    }
  }
  return {
    ...list,
    base: s.basePath,
    dest: place(path),
    groups: list.groups.map(g => ({ ...g, dest: place(g.fullPath) })),
    projects: list.projects.map(p => {
      const dest = place(p.fullPath)
      return { ...p, dest, local: dest ? localState(dest) : null }
    }),
  }
}))

reposRouter.post('/sources/:id/open', handle(async req => {
  const s = getSource(req.params.id as string)
  const dest = localPathFor(s.workspace, s.basePath, String(req.body?.fullPath ?? ''))
  if (localState(dest) !== 'cloned') throw new RepoError('o projeto não está clonado', 404)
  openInEditor(dest)
}))

// Clona um projeto ou um grupo inteiro (com subgrupos). Progresso por SSE; já clonado é pulado.
reposRouter.post('/sources/:id/clone', async (req, res) => {
  let s: Source, items: { project: Awaited<ReturnType<typeof project>>; dest: string }[], archivedSkipped = 0, conn: Conn
  try {
    s = getSource(req.params.id as string)
    conn = await connOf(s)
    const fullPath = normalizePath(String(req.body?.fullPath ?? ''))
    const kind = req.body?.kind === 'group' ? 'group' : 'project'
    const includeArchived = req.body?.includeArchived === true
    try {
      relativeToBase(fullPath, s.basePath)
    } catch (e) {
      throw new RepoError(`${(e as Error).message}: só dá para clonar o que está dentro da base, porque o destino no disco sai dela`)
    }
    const found = kind === 'project' ? [await project(conn, fullPath)] : await projectsUnder(conn, fullPath)
    const kept = found.filter(p => includeArchived || !p.archived || kind === 'project')
    archivedSkipped = found.length - kept.length
    items = kept.map(p => ({ project: p, dest: localPathFor(s.workspace, s.basePath, p.fullPath) }))
    if (!items.length) throw new RepoError(archivedSkipped ? `todos os ${archivedSkipped} projetos são arquivados; ligue "incluir arquivados"` : 'nenhum projeto para clonar aqui', 404)
  } catch (e) {
    const err = e instanceof RepoError ? e : new RepoError((e as Error).message)
    res.status(err.status).json({ error: err.message })
    return
  }

  const sse = openSse(res)
  sse.send({ type: 'start', total: items.length, archivedSkipped })
  const summary: Record<CloneResult['status'], number> = { cloned: 0, exists: 0, skipped: 0, failed: 0 }
  await cloneMany(items, {
    provider: s.provider, protocol: s.protocol, token: conn.token, signal: sse.signal,
    onResult: r => {
      summary[r.status]++
      sse.send({ type: 'result', ...r })
    },
  })
  console.log(`[repos] clone em ${s.label}: ${JSON.stringify(summary)}`)
  sse.send({ type: 'done', summary, stopped: sse.signal.aborted })
  sse.end()
})
