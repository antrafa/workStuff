import { Router, type Request, type Response } from 'express'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pickFolder } from '../lib/desktop.ts'
import { expandHome, tildify } from '../lib/paths.ts'
import {
  DEFAULT_ROOT,
  audit,
  classify,
  devRunbookPath,
  execDevCommand,
  listDevRunbooks,
  parseDevRunbook,
  readRoot,
  saveRoot,
} from '../lib/devRunbooks/devRunbooks.ts'

export const devRunbooksRouter = Router()

const handle = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json((await fn(req)) ?? { ok: true })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
}

function requireRoot() {
  const root = readRoot()
  if (!root) throw new Error('escolha a pasta dos runbooks de dev')
  return root
}

devRunbooksRouter.get('/', handle(() => {
  const root = readRoot()
  const isDefault = resolve(root) === resolve(DEFAULT_ROOT)
  return {
    root: root ? tildify(root) : null,
    isDefault,
    defaultRoot: tildify(DEFAULT_ROOT),
    runbooks: root ? listDevRunbooks(root) : [],
  }
}))

devRunbooksRouter.put('/root', handle(req => {
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

devRunbooksRouter.post('/pick-folder', handle(async () => ({ path: await pickFolder('Pasta dos runbooks de dev') })))
devRunbooksRouter.post('/pick-project', handle(async () => ({ path: await pickFolder('Pasta do projeto/repositório') })))

devRunbooksRouter.post('/doc', handle(req => {
  const root = requireRoot()
  const file = String(req.body?.file ?? '')
  const rawMd = readFileSync(devRunbookPath(root, file), 'utf-8')
  const segments = parseDevRunbook(rawMd)
  const values = (req.body?.values ?? {}) as Record<string, string>
  return {
    file,
    segments: segments.map(s => (s.type === 'step' ? { ...s, check: classify(s.line, values) } : s)),
  }
}))

devRunbooksRouter.post('/run', handle(async req => {
  const root = requireRoot()
  const file = String(req.body?.file ?? '')
  const stepId = Number(req.body?.step)
  const values = (req.body?.values ?? {}) as Record<string, string>
  const confirmed = req.body?.confirmed === true

  const rawMd = readFileSync(devRunbookPath(root, file), 'utf-8')
  const seg = parseDevRunbook(rawMd).find(s => s.type === 'step' && s.id === stepId)
  if (!seg || seg.type !== 'step') throw new Error('passo não encontrado; o arquivo pode ter mudado, recarregue')

  const c = classify(seg.line, values)
  if (c.kind === 'blocked') throw new Error(c.reason)
  if (c.kind === 'write' && !confirmed) {
    throw new Error('passo com modificação no ambiente: confirme na tela antes de executar')
  }

  // Descobre cwd a partir de valores como projeto, pasta, repo ou diretorio
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

  const command = `${c.bin} ${c.args.join(' ')}`
  try {
    const out = await execDevCommand(c.bin, c.args, cwd, 60_000)
    audit({ file, step: stepId, command, cwd, kind: c.kind, ok: true })
    return { ok: true, command, cwd: cwd ? tildify(cwd) : undefined, output: out.slice(0, 20_000) }
  } catch (e) {
    audit({ file, step: stepId, command, cwd, kind: c.kind, ok: false })
    return { ok: false, command, cwd: cwd ? tildify(cwd) : undefined, output: (e as Error).message.slice(0, 4000) }
  }
}))
