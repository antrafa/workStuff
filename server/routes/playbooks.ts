import { Router, type Request, type Response } from 'express'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pickFolder } from '../lib/desktop.ts'
import { expandHome, tildify } from '../lib/paths.ts'
import { openSse } from '../lib/sse.ts'
import { readSettings } from '../lib/settingsStore.ts'
import { runAi } from '../lib/ai/runner.ts'
import { DEFAULT_ROOT, fill, listPlaybooks, parsePlaybook, playbookPath, readRoot, saveRoot } from '../lib/playbooks/playbooks.ts'

export const playbooksRouter = Router()

const handle = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json((await fn(req)) ?? { ok: true })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
}

function requireRoot() {
  const root = readRoot()
  if (!root) throw new Error('escolha a pasta dos playbooks')
  return root
}

playbooksRouter.get('/', handle(() => {
  const root = readRoot()
  const isDefault = resolve(root) === resolve(DEFAULT_ROOT)
  return {
    root: root ? tildify(root) : null,
    isDefault,
    defaultRoot: tildify(DEFAULT_ROOT),
    playbooks: root ? listPlaybooks(root) : [],
  }
}))

playbooksRouter.put('/root', handle(req => {
  const raw = String(req.body?.root ?? '').trim()
  if (!raw || raw === 'default') {
    saveRoot('default')
    return { ok: true, root: tildify(DEFAULT_ROOT), isDefault: true }
  }
  const root = expandHome(raw)
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`pasta não encontrada: ${root}`)
  saveRoot(root)
  return { ok: true, root: tildify(root), isDefault: resolve(root) === resolve(DEFAULT_ROOT) }
}))

playbooksRouter.post('/pick-folder', handle(async () => ({ path: await pickFolder('Pasta dos playbooks de IA') })))
playbooksRouter.post('/pick-project', handle(async () => ({ path: await pickFolder('Pasta do projeto para o playbook') })))

playbooksRouter.post('/doc', handle(req => {
  const root = requireRoot()
  const file = String(req.body?.file ?? '')
  const rawMd = readFileSync(playbookPath(root, file), 'utf-8')
  const segments = parsePlaybook(rawMd)
  const settings = readSettings()
  const vars = [...new Set(segments.flatMap(s => (s.type === 'step' ? s.vars : [])))].filter(
    v => v !== 'passo_anterior' && v !== 'resultado',
  )
  return {
    file,
    provider: settings.provider,
    model: settings.model,
    vars,
    segments,
  }
}))

playbooksRouter.post('/run', async (req, res) => {
  let root: string
  try {
    root = requireRoot()
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
    return
  }

  const file = String(req.body?.file ?? '')
  const stepId = Number(req.body?.step)
  const values = (req.body?.values ?? {}) as Record<string, string>
  const previousOutput = req.body?.previousOutput ? String(req.body.previousOutput) : undefined

  let seg
  try {
    const rawMd = readFileSync(playbookPath(root, file), 'utf-8')
    seg = parsePlaybook(rawMd).find(s => s.type === 'step' && s.id === stepId)
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
    return
  }

  if (!seg || seg.type !== 'step') {
    res.status(400).json({ error: 'passo não encontrado; o arquivo pode ter mudado' })
    return
  }

  let prompt: string
  try {
    prompt = fill(seg.prompt, values, previousOutput)
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
    return
  }

  let cwd: string | undefined
  for (const key of ['projeto', 'pasta', 'diretorio', 'repo', 'repositorio']) {
    const candidate = values[key]
    if (candidate) {
      const expanded = expandHome(candidate)
      if (statSync(expanded, { throwIfNoEntry: false })?.isDirectory()) {
        cwd = expanded
        break
      }
    }
  }

  const { provider, model } = readSettings()
  const sse = openSse(res)
  sse.send({ type: 'meta', provider, model, stepId, title: seg.title })

  try {
    const t0 = Date.now()
    const result = await runAi({
      cwd,
      prompt,
      signal: sse.signal,
      timeoutMs: 15 * 60_000,
      stallMs: 3 * 60_000,
      onEvent: e => {
        if (e.type === 'text') sse.send(e)
        if (e.type === 'tool') sse.send({ type: 'tool', tool: e.tool, detail: String((e.input as Record<string, unknown>)?.path ?? '') })
        if (e.type === 'status') sse.send(e)
      },
    })

    if (result.stopped) {
      sse.send({ type: 'error', message: 'execução cancelada' })
    } else {
      sse.send({ type: 'done', ok: true, durationMs: Date.now() - t0, text: result.text })
    }
  } catch (e) {
    sse.send({ type: 'error', message: (e as Error).message })
  } finally {
    sse.end()
  }
})
