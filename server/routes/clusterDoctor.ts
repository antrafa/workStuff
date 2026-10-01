import { Router, type Request, type Response } from 'express'
import { openSse } from '../lib/sse.ts'
import { readSettings } from '../lib/settingsStore.ts'
import { activeSession } from '../lib/k8s/cluster.ts'
import { DoctorError, approve, ask, create, list, load, reject, remove, stop, type Conversation, type DoctorEvent } from '../lib/doctorAi/conversations.ts'

export const clusterDoctorRouter = Router()

const handle = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json((await fn(req)) ?? { ok: true })
  } catch (e) {
    if (!(e instanceof DoctorError)) throw e
    res.status(e.status).json({ error: e.message })
  }
}

// Validação antes de abrir o SSE: erro de regra volta como JSON com status, não como evento.
const stream = (prepare: (req: Request) => Promise<{ c: Conversation; run: (send: (e: DoctorEvent) => void) => Promise<void> }>) => async (req: Request, res: Response) => {
  let prepared
  try {
    prepared = await prepare(req)
  } catch (e) {
    if (!(e instanceof DoctorError)) throw e
    res.status(e.status).json({ error: e.message })
    return
  }
  const sse = openSse(res)
  sse.send({ type: 'conversation', id: prepared.c.id })
  // Fechar a aba não interrompe a resposta: a rodada termina e fica no histórico. Parar é explícito.
  try {
    await prepared.run(sse.send)
  } catch (e) {
    sse.send({ type: 'error', message: (e as Error).message })
  }
  sse.send({ type: 'done', pending: load(prepared.c.id).pending })
  sse.end()
}

clusterDoctorRouter.get('/status', (_req, res) => {
  const { provider } = readSettings()
  res.json(provider === 'claude'
    ? { ok: true, provider }
    : { ok: false, provider, reason: 'O Cluster Doctor só roda com Claude Code, o único CLI com trava de comando nativa. Troque o provedor em Configurações → Provedor de IA.' })
})

clusterDoctorRouter.get('/conversations', handle(() => list()))
clusterDoctorRouter.get('/conversations/:id', handle(req => load(req.params.id as string)))
clusterDoctorRouter.delete('/conversations/:id', handle(req => remove(req.params.id as string)))
clusterDoctorRouter.post('/conversations/:id/stop', handle(req => stop(req.params.id as string)))

clusterDoctorRouter.post('/ask', stream(async req => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 8000) : ''
  if (!message) throw new DoctorError('escreva a pergunta')
  if (readSettings().provider !== 'claude') throw new DoctorError('o Cluster Doctor só roda com Claude Code; troque o provedor em Configurações', 409)
  let c: Conversation
  if (typeof req.body?.conversationId === 'string' && req.body.conversationId) {
    c = load(req.body.conversationId)
  } else {
    const session = await activeSession()
    if (!session) throw new DoctorError('conecte um cluster antes de perguntar', 409)
    const namespace = typeof req.body?.namespace === 'string' && req.body.namespace ? req.body.namespace : undefined
    c = create(session.kubeconfig.id, session.context, session.kubeconfig.environment, namespace, message)
  }
  return { c, run: send => ask(c, message, send) }
}))

clusterDoctorRouter.post('/conversations/:id/approve', stream(async req => {
  const c = load(req.params.id as string)
  if (!c.pending) throw new DoctorError('nada pendente de confirmação nesta conversa', 409)
  return { c, run: send => approve(c, send) }
}))

clusterDoctorRouter.post('/conversations/:id/reject', stream(async req => {
  const c = load(req.params.id as string)
  if (!c.pending) throw new DoctorError('nada pendente de confirmação nesta conversa', 409)
  return { c, run: send => reject(c, send) }
}))
