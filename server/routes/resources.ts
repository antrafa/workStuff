import { Router } from 'express'
import { GitlabError } from '../lib/gitlab/client.ts'
import { getClients, getManifest, getStack } from '../lib/resources/stacks.ts'
import { readConfig, saveConfig, testConfig } from '../lib/resources/config.ts'
import { getSource } from '../lib/repos/sources.ts'
import { getLink, liveUsage, recommend, setLink } from '../lib/resources/live.ts'
import { ClusterError } from '../lib/k8s/errors.ts'
import { checkName } from '../lib/k8s/cluster.ts'
import { getKubeconfig } from '../lib/k8s/kubeconfigs.ts'
import { kubectlJson } from '../lib/k8s/kubectl.ts'
import type { Request, Response } from 'express'

export const resourcesRouter = Router()

async function handleGitlab(res: Response, fn: () => unknown) {
  try {
    res.json((await fn()) ?? { ok: true })
  } catch (e) {
    if (!(e instanceof GitlabError)) throw e
    res.status(e.status).json({ error: e.message, ...e.body })
  }
}

const projectIdOf = (raw: string) => {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new GitlabError('id de projeto inválido', 400)
  return id
}

// Origem dos manifests: conexão GitLab da tela Repositórios + grupo.
resourcesRouter.get('/config', (_req, res) => handleGitlab(res, () => {
  const cfg = readConfig()
  if (!cfg) return { config: null }
  let label: string | null = null
  try {
    label = getSource(cfg.sourceId).label
  } catch {
    label = null // conexão removida: a tela pede para escolher de novo
  }
  return { config: { ...cfg, label } }
}))
resourcesRouter.post('/config/test', (req, res) => handleGitlab(res, () => testConfig(req.body ?? {})))
resourcesRouter.put('/config', (req, res) => handleGitlab(res, () => saveConfig(req.body ?? {})))

resourcesRouter.get('/clients', (_req, res) => handleGitlab(res, () => getClients()))
resourcesRouter.post('/clients/refresh', (_req, res) => handleGitlab(res, () => getClients(true)))
resourcesRouter.get('/stacks/:projectId', (req, res) => handleGitlab(res, () => getStack(projectIdOf(req.params.projectId))))
resourcesRouter.post('/stacks/:projectId/refresh', (req, res) => handleGitlab(res, () => getStack(projectIdOf(req.params.projectId), true)))
resourcesRouter.get('/stacks/:projectId/manifest', (req, res) =>
  handleGitlab(res, async () => ({ content: await getManifest(projectIdOf(req.params.projectId), String(req.query.path ?? '')) })),
)

// Vínculo stack → namespace do cluster, e o uso ao vivo dos pods desse namespace.
const handleCluster = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json((await fn(req)) ?? { ok: true })
  } catch (e) {
    if (e instanceof ClusterError) res.status(e.status).json({ error: e.message })
    else if (e instanceof GitlabError) res.status(e.status).json({ error: e.message })
    else throw e
  }
}

resourcesRouter.get('/stacks/:projectId/namespace-link', handleCluster(req => ({ link: getLink(projectIdOf(req.params.projectId as string)) })))

resourcesRouter.put('/stacks/:projectId/namespace-link', handleCluster(async req => {
  const { kubeconfigId, context, namespace } = req.body ?? {}
  const kubeconfig = typeof kubeconfigId === 'string' ? await getKubeconfig(kubeconfigId) : null
  if (!kubeconfig) throw new ClusterError('kubeconfig não encontrado', 404)
  setLink(projectIdOf(req.params.projectId as string), {
    kubeconfigId: kubeconfig.id,
    context: typeof context === 'string' && kubeconfig.contexts.includes(context) ? context : null,
    namespace: checkName('namespace', namespace),
  })
}))

resourcesRouter.delete('/stacks/:projectId/namespace-link', handleCluster(req => setLink(projectIdOf(req.params.projectId as string), null)))

resourcesRouter.get('/stacks/:projectId/live', handleCluster(async req => {
  const projectId = projectIdOf(req.params.projectId as string)
  const [live, stack] = await Promise.all([liveUsage(projectId), getStack(projectId)])
  const services = Object.fromEntries(stack.services.map(s => {
    const usage = live.byWorkload[s.service] ?? { usageMi: null, replicas: 0, pods: [] }
    return [s.service, { ...usage, pct: usage.usageMi && s.memLimMi ? Math.round((usage.usageMi / s.memLimMi) * 100) : null, recommendation: recommend(s.memReqMi, s.memLimMi, usage.usageMi) }]
  }))
  return { ...live, byWorkload: undefined, services }
}))

// Namespaces de um kubeconfig qualquer, para escolher o vínculo sem mudar a sessão ativa do Cluster.
resourcesRouter.get('/namespaces', handleCluster(async req => {
  const kubeconfig = typeof req.query.kubeconfigId === 'string' ? await getKubeconfig(req.query.kubeconfigId) : null
  if (!kubeconfig) throw new ClusterError('kubeconfig não encontrado', 404)
  try {
    const list = await kubectlJson<{ items: { metadata: { name: string } }[] }>({ file: kubeconfig.file, context: kubeconfig.currentContext }, ['get', 'namespaces'])
    return { namespaces: list.items.map(n => n.metadata.name).sort(), limitedRbac: false }
  } catch {
    return { namespaces: [], limitedRbac: true }
  }
}))
