import { Router, type Request, type Response } from 'express'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAi } from '../lib/ai/runner.ts'
import { openSse } from '../lib/sse.ts'
import {
  ClusterError, activeSession, checkName, connect, disconnect, listNamespaces, listNodes, listPods, podDetail, podEvents,
  recentLogs, restartWorkload,
} from '../lib/k8s/cluster.ts'
import { deleteKubeconfig, listKubeconfigs, saveKubeconfig, setEnvironment } from '../lib/k8s/kubeconfigs.ts'
import { kubectlStream } from '../lib/k8s/kubectl.ts'
import type { Environment } from '../lib/k8s/policy.ts'

export const k8sRouter = Router()

// Erro de regra ou do cluster vira resposta com a mensagem; o resto sobe para o handler geral.
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
  if (typeof filename !== 'string' || typeof content !== 'string') throw new ClusterError('envie o nome e o conteúdo do arquivo')
  return { id: await saveKubeconfig(filename, content) }
}))

k8sRouter.delete('/kubeconfigs/:id', handle(req => deleteKubeconfig(req.params.id as string)))

k8sRouter.put('/kubeconfigs/:id/environment', handle(req => {
  const env = req.body?.environment ?? null
  if (env !== null && !ENVS.includes(env)) throw new ClusterError('ambiente inválido: use DES, ITG, HML ou PRO')
  setEnvironment(req.params.id as string, env)
}))

k8sRouter.get('/session', handle(async () => {
  const s = await activeSession()
  return s ? { kubeconfig: s.kubeconfig, context: s.context } : null
}))

k8sRouter.put('/session', handle(async req => {
  const { kubeconfigId, context } = req.body ?? {}
  if (typeof kubeconfigId !== 'string') throw new ClusterError('informe o kubeconfig')
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

// Logs por SSE (GET, então serve EventSource). Fechar a conexão encerra o kubectl.
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
    res.status(409).json({ error: 'nenhum cluster conectado' })
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
    if (code !== 0 && !sse.signal.aborted) sse.send({ type: 'error', message: error || `kubectl logs saiu com código ${code}` })
    sse.send({ type: 'done' })
    sse.end()
  })
})

// Diagnóstico com IA: logs recentes + eventos + motivos vão no prompt; o agente roda em modo leitura.
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
  // Pasta vazia de trabalho: o agente não precisa ler nada da máquina, tudo vai no prompt.
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
