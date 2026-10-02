import { Router } from 'express'
import { ClusterError, checkName, explain } from '../lib/k8s/cluster.ts'
import { getKubeconfig } from '../lib/k8s/kubeconfigs.ts'
import { compare, readWorkloads } from '../lib/compare/workloads.ts'

export const compareRouter = Router()

type Side = { kubeconfigId: string; context: string; namespace: string }

// Cada lado é um kubeconfig + contexto + namespace próprios: não depende da sessão da tela Cluster.
async function resolveSide(raw: unknown, label: string) {
  const s = (raw ?? {}) as Partial<Side>
  const kubeconfig = typeof s.kubeconfigId === 'string' ? await getKubeconfig(s.kubeconfigId) : null
  if (!kubeconfig) throw new ClusterError(`lado ${label}: kubeconfig não encontrado`, 404)
  const context = typeof s.context === 'string' && s.context ? s.context : kubeconfig.currentContext
  if (!kubeconfig.contexts.includes(context)) throw new ClusterError(`lado ${label}: contexto ${context} não existe neste kubeconfig`)
  const namespace = checkName(`lado ${label}: namespace`, s.namespace)
  return { target: { file: kubeconfig.file, context }, namespace, label: `${kubeconfig.id} · ${context} · ${namespace}`, environment: kubeconfig.environment }
}

async function workloadsOf(side: Awaited<ReturnType<typeof resolveSide>>, label: string) {
  try {
    return await readWorkloads(side.target, side.namespace)
  } catch (e) {
    try {
      explain(e)
    } catch (err) {
      throw new ClusterError(`lado ${label}: ${(err as Error).message}`, err instanceof ClusterError ? err.status : 502)
    }
  }
}

compareRouter.post('/', async (req, res) => {
  try {
    const [a, b] = await Promise.all([resolveSide(req.body?.a, 'A'), resolveSide(req.body?.b, 'B')])
    const [wa, wb] = await Promise.all([workloadsOf(a, 'A'), workloadsOf(b, 'B')])
    res.json({
      a: { label: a.label, environment: a.environment, count: wa.length },
      b: { label: b.label, environment: b.environment, count: wb.length },
      workloads: compare(wa, wb),
    })
  } catch (e) {
    if (!(e instanceof ClusterError)) throw e
    res.status(e.status).json({ error: e.message })
  }
})
