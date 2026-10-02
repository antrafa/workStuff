import { Router, type Request, type Response } from 'express'
import { pickFolder } from '../lib/desktop.ts'
import { tildify } from '../lib/paths.ts'
import { resolveProject } from '../lib/analysis/store.ts'
import { mapLimit } from '../lib/concurrency.ts'
import { ClusterError, checkName } from '../lib/k8s/cluster.ts'
import { listKubeconfigs } from '../lib/k8s/kubeconfigs.ts'
import { kubeconfigCertificates } from '../lib/upgrade/certs.ts'
import { clusterReport, ingressCertificates } from '../lib/upgrade/cluster.ts'
import { scanManifests } from '../lib/upgrade/deprecations.ts'

export const upgradeRouter = Router()

const handle = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json((await fn(req)) ?? { ok: true })
  } catch (e) {
    res.status(e instanceof ClusterError ? e.status : 400).json({ error: (e as Error).message })
  }
}

// Versão de destino vem da tela: só "1.NN".
function targetOf(v: unknown): string | null {
  if (v === undefined || v === '') return null
  if (typeof v !== 'string' || !/^1\.\d{1,2}$/.test(v)) throw new Error('versão de destino inválida: use o formato 1.30')
  return v
}

const namespaceOf = (v: unknown) => (typeof v === 'string' && v ? checkName('namespace', v) : null)

upgradeRouter.get('/cluster', handle(req => clusterReport(targetOf(req.query.target), namespaceOf(req.query.namespace))))
upgradeRouter.get('/certificates', handle(req => ingressCertificates(namespaceOf(req.query.namespace))))

upgradeRouter.post('/pick-folder', handle(async () => ({ path: await pickFolder('Repositório com os manifests') })))
upgradeRouter.post('/manifests', handle(req => {
  const path = resolveProject(req.body?.path)
  const target = targetOf(req.body?.target)
  if (!target) throw new Error('informe a versão de destino')
  return { path: tildify(path), target, ...scanManifests(path, target) }
}))

// Lê só o arquivo local: nenhum cluster é contatado. Kubeconfig ilegível vira linha de erro, não falha geral.
upgradeRouter.get('/kubeconfigs', handle(async () => {
  const { items } = await listKubeconfigs()
  return mapLimit(items, 4, async k => {
    try {
      return { id: k.id, environment: k.environment, users: await kubeconfigCertificates(k.file), error: null }
    } catch (e) {
      return { id: k.id, environment: k.environment, users: [], error: (e as Error).message.split('\n')[0].slice(0, 200) }
    }
  })
}))
