// Factory projects: list, create (from an existing folder or a new one), edit, remove and adopt tasks.

import { Router, type Response } from 'express'
import { isProviderId } from '../lib/aiProviders.ts'
import { adoptableTasks, createProjectFolder, defaultProjectStore, ProjectError } from '../lib/factory/projects.ts'
import { defaultFactoryStore } from '../lib/factory/store.ts'
import type { FactoryProject } from '../lib/factory/types.ts'
import { say } from '../lib/i18n.ts'

export const factoryProjectsRouter = Router()

// Same rule as the task model: it reaches the CLI as a bare argument
const MODEL_ID = /^[\w.:/-]{1,200}$/

function fail(res: Response, e: unknown) {
  const status = e instanceof ProjectError ? e.status : 500
  res.status(status).json({ error: (e as Error).message })
}

function settingsOf(b: Record<string, unknown>): Partial<Pick<FactoryProject, 'provider' | 'model' | 'verifyCommand'>> {
  const out: Partial<Pick<FactoryProject, 'provider' | 'model' | 'verifyCommand'>> = {}
  if (typeof b.provider === 'string' && isProviderId(b.provider)) out.provider = b.provider
  if (typeof b.model === 'string') {
    const model = b.model.trim()
    if (model && !MODEL_ID.test(model)) throw new ProjectError(say({ en: 'invalid model id', pt: 'id de modelo inválido' }))
    out.model = model || undefined
  }
  if (typeof b.verifyCommand === 'string') out.verifyCommand = b.verifyCommand.trim() || undefined
  return out
}

factoryProjectsRouter.get('/', (_req, res) => {
  try {
    res.json(defaultProjectStore.list())
  } catch (e) {
    fail(res, e)
  }
})

// Body: { name, rootPath } for an existing folder, or { name, create: { parent, folder, gitInit } }.
factoryProjectsRouter.post('/', async (req, res) => {
  try {
    const b = req.body ?? {}
    const create = b.create as { parent?: string; folder?: string; gitInit?: boolean } | undefined
    const rootPath = create
      ? await createProjectFolder(String(create.parent ?? ''), String(create.folder ?? ''), Boolean(create.gitInit))
      : String(b.rootPath ?? '')
    res.status(201).json(defaultProjectStore.create({ name: String(b.name ?? ''), rootPath, ...settingsOf(b) }))
  } catch (e) {
    fail(res, e)
  }
})

factoryProjectsRouter.get('/:id', (req, res) => {
  try {
    res.json(defaultProjectStore.get(req.params.id))
  } catch (e) {
    fail(res, e)
  }
})

factoryProjectsRouter.patch('/:id', (req, res) => {
  try {
    const b = req.body ?? {}
    res.json(defaultProjectStore.update(req.params.id, { ...settingsOf(b), name: typeof b.name === 'string' ? b.name : undefined }))
  } catch (e) {
    fail(res, e)
  }
})

// The project's tasks become loose again; their worktrees and branches are left alone.
factoryProjectsRouter.delete('/:id', async (req, res) => {
  try {
    defaultProjectStore.remove(req.params.id)
    for (const task of await defaultFactoryStore.getTasks()) {
      if (task.projectId === req.params.id) await defaultFactoryStore.saveTask({ ...task, projectId: undefined })
    }
    res.json({ ok: true })
  } catch (e) {
    fail(res, e)
  }
})

factoryProjectsRouter.post('/:id/adopt-tasks', async (req, res) => {
  try {
    const project = defaultProjectStore.get(req.params.id)
    const adopted = adoptableTasks(project, await defaultFactoryStore.getTasks())
    for (const task of adopted) await defaultFactoryStore.saveTask({ ...task, projectId: project.id })
    res.json({ adopted: adopted.length })
  } catch (e) {
    fail(res, e)
  }
})
