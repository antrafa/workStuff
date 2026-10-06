import { Router, type Request, type Response } from 'express'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAi } from '../lib/ai/runner.ts'
import { openSse } from '../lib/sse.ts'
import {
  ClusterError, activeSession, checkName, connect, explain, disconnect, listNamespaces, listNodes, listPods, podDetail, podEvents,
  recentLogs, restartWorkload,
} from '../lib/k8s/cluster.ts'
import { deleteKubeconfig, listKubeconfigs, saveKubeconfig, setEnvironment } from '../lib/k8s/kubeconfigs.ts'
import { kubectlJson, kubectlStream } from '../lib/k8s/kubectl.ts'
import { multiLogArgs, parsePrefixed, selectorSuggestions, validSelector } from '../lib/k8s/multilogs.ts'
import type { Environment } from '../lib/k8s/policy.ts'
import { say } from '../lib/i18n.ts'

export const k8sRouter = Router()

// A rule or cluster error becomes a response with its message; anything else goes to the general handler.
const handle = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json((await fn(req)) ?? { ok: true })
  } catch (e) {
    if (!(e instanceof ClusterError)) throw e
    res.status(e.status).json({ error: e.message })
  }
}

const ENVS: Environment[] = ['DES', 'ITG', 'HML', 'PRO']

k8sRouter.get('/kubeconfigs', handle(async () => {
  const [{ items, invalid }, session] = await Promise.all([listKubeconfigs(), activeSession()])
  return { items, invalid, session: session && { kubeconfigId: session.kubeconfig.id, context: session.context } }
}))

k8sRouter.post('/kubeconfigs', handle(async req => {
  const { filename, content } = req.body ?? {}
  if (typeof filename !== 'string' || typeof content !== 'string') throw new ClusterError(say({ en: 'send the file name and content', pt: 'envie o nome e o conteúdo do arquivo' }))
  return { id: await saveKubeconfig(filename, content) }
}))

k8sRouter.delete('/kubeconfigs/:id', handle(req => deleteKubeconfig(req.params.id as string)))

k8sRouter.put('/kubeconfigs/:id/environment', handle(req => {
  const env = req.body?.environment ?? null
  if (env !== null && !ENVS.includes(env)) throw new ClusterError(say({ en: 'invalid environment: use DES, ITG, HML or PRO', pt: 'ambiente inválido: use DES, ITG, HML ou PRO' }))
  setEnvironment(req.params.id as string, env)
}))

k8sRouter.get('/session', handle(async () => {
  const s = await activeSession()
  return s ? { kubeconfig: s.kubeconfig, context: s.context } : null
}))

k8sRouter.put('/session', handle(async req => {
  const { kubeconfigId, context } = req.body ?? {}
  if (typeof kubeconfigId !== 'string') throw new ClusterError(say({ en: 'choose the kubeconfig', pt: 'informe o kubeconfig' }))
  const s = await connect(kubeconfigId, typeof context === 'string' ? context : undefined)
  return s && { kubeconfig: s.kubeconfig, context: s.context }
}))

k8sRouter.delete('/session', handle(() => disconnect()))

k8sRouter.get('/namespaces', handle(() => listNamespaces()))

k8sRouter.get('/pods', handle(req => {
  const ns = req.query.namespace
  return listPods(typeof ns === 'string' && ns ? checkName('namespace', ns) : undefined)
}))

k8sRouter.get('/nodes', handle(() => listNodes()))

const podParams = (req: Request) => ({ ns: checkName('namespace', req.params.ns), pod: checkName('pod', req.params.pod) })

k8sRouter.get('/pods/:ns/:pod/events', handle(req => {
  const { ns, pod } = podParams(req)
  return podEvents(ns, pod)
}))

k8sRouter.get('/pods/:ns/:pod/detail', handle(req => {
  const { ns, pod } = podParams(req)
  return podDetail(ns, pod)
}))

k8sRouter.post('/pods/:ns/:pod/restart', handle(req => {
  const { ns, pod } = podParams(req)
  return restartWorkload(ns, pod)
}))

// Logs over SSE (GET, so EventSource works). Closing the connection stops kubectl.
k8sRouter.get('/pods/:ns/:pod/logs', async (req, res) => {
  let params
  try {
    params = podParams(req)
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
    return
  }
  const session = await activeSession()
  if (!session) {
    res.status(409).json({ error: say({ en: 'no cluster connected', pt: 'nenhum cluster conectado' }) })
    return
  }
  const container = typeof req.query.container === 'string' && req.query.container ? checkName('container', req.query.container) : null
  const tail = req.query.tail === 'all' ? null : Math.min(Math.max(Number(req.query.tail) || 500, 1), 50_000)
  const previous = req.query.previous === 'true'
  const follow = !previous && req.query.follow !== 'false'

  const args = ['logs', params.pod, '-n', params.ns, ...(container ? ['-c', container] : []), ...(tail ? [`--tail=${tail}`] : []), ...(previous ? ['--previous'] : []), ...(follow ? ['-f'] : [])]
  const sse = openSse(res)
  const child = kubectlStream(session.target, args)
  let buffer = ''
  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf-8')
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const text of lines) if (text) sse.send({ type: 'line', text })
  })
  let stderr = ''
  child.stderr.on('data', chunk => (stderr += chunk.toString('utf-8')))
  sse.signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true })
  child.on('close', code => {
    if (buffer) sse.send({ type: 'line', text: buffer })
    const error = stderr.split('\n').filter(l => l.trim() && !l.startsWith('Warning:')).join(' ')
    if (code !== 0 && !sse.signal.aborted) sse.send({ type: 'error', message: error || say({ en: `kubectl logs exited with code ${code}`, pt: `kubectl logs saiu com código ${code}` }) })
    sse.send({ type: 'done' })
    sse.end()
  })
})

// Selectors suggested to the logs screen: the app labels of the namespace's pods, with how many pods each.
k8sRouter.get('/logs/selectors', handle(async req => {
  const namespace = checkName('namespace', req.query.namespace)
  const session = await activeSession()
  if (!session) throw new ClusterError(say({ en: 'no cluster connected', pt: 'nenhum cluster conectado' }), 409)
  const pods = await kubectlJson<{ items: { metadata: { labels?: Record<string, string> } }[] }>(session.target, ['get', 'pods', '-n', namespace]).catch(e => explain(e))
  return selectorSuggestions(pods.items.map(p => p.metadata.labels ?? {}))
}))

// Logs of several pods by label selector, over SSE. Each line carries its pod and container.
k8sRouter.get('/logs', async (req, res) => {
  let namespace: string, selector: string, container: string | null
  try {
    namespace = checkName('namespace', req.query.namespace)
    selector = String(req.query.selector ?? '').trim()
    if (!validSelector(selector)) throw new ClusterError(say({ en: 'invalid label selector (e.g. app=api or app.kubernetes.io/name=api)', pt: 'seletor de label inválido (ex.: app=api ou app.kubernetes.io/name=api)' }))
    container = typeof req.query.container === 'string' && req.query.container ? checkName('container', req.query.container) : null
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
    return
  }
  const session = await activeSession()
  if (!session) {
    res.status(409).json({ error: say({ en: 'no cluster connected', pt: 'nenhum cluster conectado' }) })
    return
  }
  const tail = Math.min(Math.max(Number(req.query.tail) || 100, 1), 5000)
  const since = Number(req.query.since) > 0 ? Math.min(Number(req.query.since), 7 * 86400) : null
  const sse = openSse(res)
  const child = kubectlStream(session.target, multiLogArgs({ namespace, selector, container, tail, sinceSeconds: since }))
  let buffer = ''
  const sendLine = (line: string) => {
    const parsed = parsePrefixed(line)
    if (parsed) sse.send({ type: 'line', ...parsed })
    else if (line) sse.send({ type: 'line', pod: '?', container: '?', text: line })
  }
  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf-8')
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(sendLine)
  })
  let stderr = ''
  child.stderr.on('data', chunk => (stderr += chunk.toString('utf-8')))
  sse.signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true })
  child.on('close', code => {
    if (buffer) sendLine(buffer)
    const error = stderr.split('\n').filter(l => l.trim() && !l.startsWith('Warning:')).join(' ')
    if (code !== 0 && !sse.signal.aborted) sse.send({ type: 'error', message: error || say({ en: `kubectl logs exited with code ${code}`, pt: `kubectl logs saiu com código ${code}` }) })
    sse.send({ type: 'done' })
    sse.end()
  })
})

// AI diagnosis: recent logs + events + reasons go in the prompt; the agent runs read-only.
k8sRouter.post('/pods/:ns/:pod/diagnose', async (req, res) => {
  let params
  try {
    params = podParams(req)
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
    return
  }
  const container = typeof req.body?.container === 'string' && req.body.container ? req.body.container : undefined
  const reasons: string[] = Array.isArray(req.body?.reasons) ? req.body.reasons.map(String).slice(0, 20) : []
  const sse = openSse(res)
  // Empty work folder: the agent needs nothing from the machine, everything is in the prompt.
  const cwd = mkdtempSync(join(tmpdir(), 'pod-diagnose-'))
  try {
    const [logs, events] = await Promise.all([recentLogs(params.ns, params.pod, container), podEvents(params.ns, params.pod).catch(() => [])])
    sse.send({ type: 'logs', lines: logs.split('\n').length })
    const prompt = [
      `Diagnostique o pod ${params.pod} do namespace ${params.ns} no Kubernetes.`,
      reasons.length ? `Sinais de problema detectados: ${reasons.join('; ')}.` : '',
      events?.length ? `Eventos recentes:\n${events.slice(0, 20).map(e => `[${e.type}] ${e.reason}: ${e.message} (×${e.count})`).join('\n')}` : 'Sem eventos recentes.',
      `Últimas linhas de log:\n\`\`\`\n${logs.slice(-40_000)}\n\`\`\``,
      'Responda em português, direto: **Causa provável** (com a evidência do log ou evento que sustenta), **O que verificar** (passos concretos) e **Correção sugerida**. Se a evidência não bastar, diga o que falta. Não execute comandos.',
    ].filter(Boolean).join('\n\n')
    const result = await runAi({ prompt, cwd, signal: sse.signal, onEvent: sse.send })
    sse.send({ type: 'done', provider: result.provider, model: result.model, durationMs: result.durationMs, stopped: result.stopped })
  } catch (e) {
    sse.send({ type: 'error', message: (e as Error).message })
  } finally {
    rmSync(cwd, { recursive: true, force: true })
    sse.end()
  }
})
