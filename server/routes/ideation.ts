// Ideation routes, under /api/factory/projects/:projectId/ideas. The logic lives in lib/ideation.

import { Router, type Request, type Response } from 'express'
import { openSse } from '../lib/sse.ts'
import { defaultProjectStore, ProjectError } from '../lib/factory/projects.ts'
import type { FactoryProjectView } from '../lib/factory/types.ts'
import { defaultIdeaStore } from '../lib/ideation/store.ts'
import { normalizeMasters, normalizeTasks } from '../lib/ideation/envelopes.ts'
import {
  advance,
  back,
  beginRun,
  challenge,
  converse,
  decide,
  dispatch,
  endRun,
  plan,
  setMasters,
  setTasks,
  split,
  stopRun,
  viewOf,
  type DecisionInput,
  type FlowContext,
} from '../lib/ideation/flow.ts'
import type { AttackDecision, Idea } from '../lib/ideation/types.ts'

export const ideationRouter = Router({ mergeParams: true })

type Params = { projectId: string; id?: string }

function fail(res: Response, e: unknown) {
  const status = e instanceof ProjectError ? e.status : 500
  res.status(status).json({ error: (e as Error).message })
}

function load(req: Request<Params>): { project: FactoryProjectView; idea: Idea } {
  const project = defaultProjectStore.get(req.params.projectId)
  return { project, idea: defaultIdeaStore.get(project.id, String(req.params.id)) }
}

// One agent operation as SSE: the agent's events while it runs, then the idea as saved. Closing the
// tab only stops watching; /stop is what ends the run.
async function stream(req: Request<Params>, res: Response, work: (ctx: FlowContext, project: FactoryProjectView, idea: Idea) => Promise<{ idea: Idea; errors?: string[] }>) {
  let loaded
  let signal: AbortSignal
  try {
    loaded = load(req)
    signal = beginRun(loaded.idea.id)
  } catch (e) {
    fail(res, e)
    return
  }
  const sse = openSse(res)
  try {
    const out = await work({ signal, send: sse.send }, loaded.project, loaded.idea)
    sse.send({ type: 'done', idea: viewOf(out.idea, loaded.project), errors: out.errors ?? [] })
  } catch (e) {
    sse.send({ type: 'error', message: (e as Error).message })
  } finally {
    endRun(loaded.idea.id)
    sse.end()
  }
}

function json(work: (req: Request<Params>) => unknown | Promise<unknown>) {
  return async (req: Request<Params>, res: Response) => {
    try {
      res.json(await work(req))
    } catch (e) {
      fail(res, e)
    }
  }
}

ideationRouter.get('/', json(req => {
  const project = defaultProjectStore.get(req.params.projectId)
  return defaultIdeaStore.list(project.id).map(i => viewOf(i, project))
}))

ideationRouter.post('/', async (req: Request<Params>, res) => {
  try {
    const project = defaultProjectStore.get(req.params.projectId)
    const idea = defaultIdeaStore.create(project.id, String(req.body?.title ?? ''), String(req.body?.text ?? ''))
    res.status(201).json(viewOf(idea, project))
  } catch (e) {
    fail(res, e)
  }
})

ideationRouter.get('/:id', json(req => {
  const { project, idea } = load(req)
  return viewOf(idea, project)
}))

ideationRouter.delete('/:id', json(req => {
  const { project, idea } = load(req)
  stopRun(idea.id)
  defaultIdeaStore.remove(project.id, idea.id)
  return { ok: true }
}))

ideationRouter.get('/:id/markdown', (req: Request<Params>, res) => {
  try {
    const { project, idea } = load(req)
    const slug = idea.title.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'ideia'
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.md"`)
    res.send(defaultIdeaStore.markdown(project.id, idea.id))
  } catch (e) {
    fail(res, e)
  }
})

ideationRouter.post('/:id/stop', json(req => ({ stopped: stopRun(load(req).idea.id) })))

ideationRouter.post('/:id/message', (req: Request<Params>, res) =>
  stream(req, res, async (ctx, project, idea) => ({ idea: await converse(ctx, project, idea, String(req.body?.message ?? '').trim()) })))

ideationRouter.post('/:id/challenge', (req: Request<Params>, res) =>
  stream(req, res, async (ctx, project, idea) => ({ idea: await challenge(ctx, project, idea) })))

const DECISIONS: AttackDecision[] = ['accept', 'mitigate', 'discard', 'kill']

ideationRouter.post('/:id/decisions', json(req => {
  const { project, idea } = load(req)
  const raw: unknown[] = Array.isArray(req.body?.decisions) ? req.body.decisions : []
  const decisions: DecisionInput[] = raw
    .map((d: any) => ({ round: Number(d?.round), id: String(d?.id ?? ''), decision: d?.decision, note: typeof d?.note === 'string' ? d.note : undefined }))
    .filter(d => Number.isInteger(d.round) && d.id && DECISIONS.includes(d.decision))
  return viewOf(decide(idea, decisions), project)
}))

ideationRouter.post('/:id/advance', json(req => {
  const { project, idea } = load(req)
  return viewOf(advance(idea, project), project)
}))

ideationRouter.post('/:id/back', json(req => {
  const { project, idea } = load(req)
  return viewOf(back(idea), project)
}))

ideationRouter.post('/:id/plan', (req: Request<Params>, res) =>
  stream(req, res, (ctx, project, idea) => plan(ctx, project, idea, String(req.body?.instructions ?? '').trim())))

ideationRouter.put('/:id/masters', json(req => {
  const { project, idea } = load(req)
  return viewOf(setMasters(idea, normalizeMasters(req.body?.masters)), project)
}))

ideationRouter.post('/:id/split', (req: Request<Params>, res) =>
  stream(req, res, (ctx, project, idea) => split(ctx, project, idea, String(req.body?.instructions ?? '').trim(), req.body?.master ? String(req.body.master) : undefined)))

ideationRouter.put('/:id/tasks', json(req => {
  const { project, idea } = load(req)
  return viewOf(setTasks(idea, normalizeTasks(req.body?.tasks)), project)
}))

ideationRouter.post('/:id/dispatch', json(async req => {
  const { project, idea } = load(req)
  const out = await dispatch(project, idea)
  return { ...out, idea: viewOf(out.idea, project) }
}))
