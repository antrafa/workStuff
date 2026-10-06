import { Router, type Request, type Response } from 'express'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pickFolder } from '../lib/desktop.ts'
import { expandHome, tildify } from '../lib/paths.ts'
import { ClusterError, activeSession } from '../lib/k8s/cluster.ts'
import { kubectl } from '../lib/k8s/kubectl.ts'
import { DEFAULT_ROOT, audit, classify, listRunbooks, parseRunbook, readRoot, runbookPath, saveRoot } from '../lib/runbooks/runbooks.ts'
import { say } from '../lib/i18n.ts'

export const runbooksRouter = Router()

const handle = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json((await fn(req)) ?? { ok: true })
  } catch (e) {
    res.status(e instanceof ClusterError ? e.status : 400).json({ error: (e as Error).message })
  }
}

function requireRoot() {
  const root = readRoot()
  if (!root) throw new Error(say({ en: 'choose the runbooks folder', pt: 'escolha a pasta dos runbooks' }))
  return root
}

runbooksRouter.get('/', handle(() => {
  const root = readRoot()
  const isDefault = resolve(root) === resolve(DEFAULT_ROOT)
  return {
    root: root ? tildify(root) : null,
    isDefault,
    defaultRoot: tildify(DEFAULT_ROOT),
    runbooks: root ? listRunbooks(root) : [],
  }
}))

runbooksRouter.put('/root', handle(req => {
  const raw = String(req.body?.root ?? '').trim()
  if (!raw || raw === 'default') {
    saveRoot('default')
    return { ok: true, root: tildify(DEFAULT_ROOT), isDefault: true }
  }
  const root = expandHome(raw)
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) throw new Error(say({ en: `folder not found: ${root}`, pt: `pasta não encontrada: ${root}` }))
  saveRoot(root)
  return { ok: true, root: tildify(root), isDefault: resolve(root) === resolve(DEFAULT_ROOT) }
}))

runbooksRouter.post('/pick-folder', handle(async () => ({ path: await pickFolder(say({ en: 'Runbooks folder', pt: 'Pasta dos runbooks' })) })))

// Documento em segmentos, com cada passo já classificado para o cluster da sessão e os valores digitados.
runbooksRouter.post('/doc', handle(async req => {
  const root = requireRoot()
  const segments = parseRunbook(readFileSync(runbookPath(root, String(req.body?.file ?? '')), 'utf-8'))
  const session = await activeSession()
  const values = (req.body?.values ?? {}) as Record<string, string>
  const env = session?.kubeconfig.environment ?? null
  return {
    session: session ? { context: session.context, environment: env } : null,
    segments: segments.map(s => (s.type === 'step' ? { ...s, check: classify(s.line, values, env) } : s)),
  }
}))

// Roda um passo. O comando sai do arquivo (relido agora), não do pedido; escrita exige confirmed=true e
// passa de novo pela política do ambiente da sessão.
runbooksRouter.post('/run', handle(async req => {
  const root = requireRoot()
  const file = String(req.body?.file ?? '')
  const step = Number(req.body?.step)
  const seg = parseRunbook(readFileSync(runbookPath(root, file), 'utf-8')).find(s => s.type === 'step' && s.id === step)
  if (!seg || seg.type !== 'step') throw new Error(say({ en: 'step not found; the file may have changed, reload', pt: 'passo não encontrado; o arquivo pode ter mudado, recarregue' }))
  const session = await activeSession()
  if (!session) throw new ClusterError(say({ en: 'no cluster connected: choose a kubeconfig on the Cluster screen', pt: 'nenhum cluster conectado: escolha um kubeconfig na tela Cluster' }), 409)
  const env = session.kubeconfig.environment
  const c = classify(seg.line, (req.body?.values ?? {}) as Record<string, string>, env)
  if (c.kind === 'blocked') throw new Error(c.reason)
  if (c.kind === 'write' && req.body?.confirmed !== true) throw new Error(say({ en: 'write step: confirm on screen before running', pt: 'passo de escrita: confirme na tela antes de executar' }))
  const command = `kubectl ${c.args.join(' ')}`
  try {
    const out = await kubectl(session.target, c.args, 60_000)
    audit({ file, step, command, context: session.context, environment: env, kind: c.kind, ok: true })
    return { ok: true, command, output: out.slice(0, 20_000) }
  } catch (e) {
    audit({ file, step, command, context: session.context, environment: env, kind: c.kind, ok: false })
    return { ok: false, command, output: (e as Error).message.slice(0, 4000) }
  }
}))
