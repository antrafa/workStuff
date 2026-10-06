import { Router, type Response } from 'express'
import { runAi } from '../lib/ai/runner.ts'
import { openInEditor, pickFolder } from '../lib/desktop.ts'
import { openSse } from '../lib/sse.ts'
import { readConfig } from '../lib/catalog/store.ts'
import { AGENTS_SKILLS_DIR, install, installArgs, search, validateInstall } from '../lib/catalog/skillsSh.ts'
import { tildify } from '../lib/paths.ts'
import {
  CatalogError, createItem, itemPath, listCatalog, readContent, reviewRequest, setAgent, setRoots, updateMeta,
} from '../lib/catalog/catalog.ts'
import { say } from '../lib/i18n.ts'

export const catalogRouter = Router()

// Erro de regra (pasta inexistente, link de outra ferramenta…) vira resposta com a mensagem; o resto sobe.
function handle(res: Response, fn: () => unknown) {
  try {
    res.json(fn() ?? { ok: true })
  } catch (e) {
    if (!(e instanceof CatalogError)) throw e
    res.status(e.status).json({ error: e.message })
  }
}

catalogRouter.get('/', (_req, res) => handle(res, listCatalog))

catalogRouter.put('/roots', (req, res) => handle(res, () => setRoots(req.body?.roots)))

catalogRouter.post('/pick-folder', async (_req, res) => {
  res.json({ path: await pickFolder(say({ en: 'AI catalog folder', pt: 'Pasta do catálogo de IA' })) })
})

catalogRouter.post('/items', (req, res) =>
  handle(res, () => {
    const file = createItem(req.body ?? {})
    openInEditor(file)
    return { ok: true }
  }),
)

catalogRouter.get('/items/:id/content', (req, res) => handle(res, () => readContent(req.params.id)))

catalogRouter.put('/items/:id/meta', (req, res) => handle(res, () => updateMeta(req.params.id, req.body ?? {})))

catalogRouter.post('/items/:id/open', (req, res) => handle(res, () => openInEditor(itemPath(req.params.id))))

catalogRouter.put('/items/:id/agents/:agent', (req, res) => handle(res, () => setAgent(req.params.id, req.params.agent, true)))

catalogRouter.delete('/items/:id/agents/:agent', (req, res) => handle(res, () => setAgent(req.params.id, req.params.agent, false)))

// Revisão com IA em modo leitura. A resposta chega por SSE; fechar a conexão encerra o CLI.
catalogRouter.post('/items/:id/review', async (req, res) => {
  let request
  try {
    request = reviewRequest(req.params.id)
  } catch (e) {
    if (!(e instanceof CatalogError)) throw e
    res.status(e.status).json({ error: e.message })
    return
  }
  const sse = openSse(res)
  try {
    const result = await runAi({ ...request, signal: sse.signal, onEvent: sse.send })
    sse.send({ type: 'done', provider: result.provider, model: result.model, durationMs: result.durationMs, stopped: result.stopped })
  } catch (e) {
    sse.send({ type: 'error', message: (e as Error).message })
  } finally {
    sse.end()
  }
})

// skills.sh: busca no catálogo público e instalação pelo CLI deles (só leitura até o usuário confirmar).
catalogRouter.get('/skills-sh/search', async (req, res) => {
  try {
    const skills = await search(String(req.query.q ?? ''))
    res.json({ skills, agentsDir: tildify(AGENTS_SKILLS_DIR), agentsDirPath: AGENTS_SKILLS_DIR, inRoots: readConfig().roots.includes(AGENTS_SKILLS_DIR) })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

catalogRouter.post('/skills-sh/install', async (req, res) => {
  let v
  try {
    v = validateInstall(req.body ?? {})
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
    return
  }
  const sse = openSse(res)
  sse.send({ type: 'line', text: `$ npx ${installArgs(v).join(' ')}` })
  try {
    const code = await install(v, text => sse.send({ type: 'line', text }), sse.signal)
    console.log(`[catalog] skills.sh add ${v.source} -s ${v.skillId} → código ${code}`)
    sse.send({ type: 'done', ok: code === 0, code })
  } catch (e) {
    sse.send({ type: 'done', ok: false, code: -1, error: (e as Error).message })
  } finally {
    sse.end()
  }
})
