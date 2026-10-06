import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import type { AiEvent } from '../ai/events.ts'
import { getKubeconfig } from '../k8s/kubeconfigs.ts'
import { authorizeMutation, type Environment } from '../k8s/policy.ts'
import { findProposal } from './command.ts'
import { executeApproved, runDoctor, type Scope } from './run.ts'
import { say } from '../i18n.ts'

export type DoctorEvent =
  | AiEvent
  | { type: 'user'; text: string }
  | { type: 'mutation'; line: string; action: string; allowed: boolean; reason: string | null }
  | { type: 'executed'; line: string; ok: boolean; output: string }
  | { type: 'error'; message: string }

type Pending = { line: string; action: 'restart' | 'edit' | 'delete' | 'node' }

export type Conversation = {
  id: string
  title: string
  kubeconfigId: string
  context: string
  environment: Environment | null
  namespace?: string
  createdAt: string
  updatedAt: string
  claudeSessionId: string | null
  pending: Pending | null
  events: DoctorEvent[]
}

export class DoctorError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const DIR = dataFile('doctor')
mkdirSync(DIR, { recursive: true })
const ID = /^[0-9a-f-]{36}$/
const MAX_EVENTS = 3000
const running = new Map<string, AbortController>()

const fileOf = (id: string) => {
  if (!ID.test(id)) throw new DoctorError(say({ en: 'invalid conversation', pt: 'conversa inválida' }))
  return join(DIR, `${id}.json`)
}

export function load(id: string): Conversation {
  const file = fileOf(id)
  if (!existsSync(file)) throw new DoctorError(say({ en: 'conversation not found', pt: 'conversa não encontrada' }), 404)
  return readJson<Conversation>(file, null as never)
}

const save = (c: Conversation) => writeJson(fileOf(c.id), { ...c, events: c.events.slice(-MAX_EVENTS), updatedAt: new Date().toISOString() })

export function list() {
  return readdirSync(DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => readJson<Conversation>(join(DIR, f), null as never))
    .filter(Boolean)
    .map(({ events, ...c }) => ({ ...c, messages: events.filter(e => e.type === 'user').length, running: running.has(c.id) }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 50)
}

export function remove(id: string) {
  running.get(id)?.abort()
  unlinkSync(fileOf(id))
}

export const stop = (id: string) => running.get(id)?.abort()

export function create(kubeconfigId: string, context: string, environment: Environment | null, namespace: string | undefined, firstMessage: string): Conversation {
  const now = new Date().toISOString()
  const c: Conversation = { id: randomUUID(), title: firstMessage.slice(0, 80), kubeconfigId, context, environment, namespace, createdAt: now, updatedAt: now, claudeSessionId: null, pending: null, events: [] }
  save(c)
  return c
}

// Environment re-read from the kubeconfig every turn: reclassifying to PRO applies at once, even mid-conversation.
async function scopeOf(c: Conversation): Promise<Scope> {
  const k = await getKubeconfig(c.kubeconfigId)
  if (!k) throw new DoctorError(say({ en: `kubeconfig ${c.kubeconfigId} no longer exists in ~/.kube`, pt: `o kubeconfig ${c.kubeconfigId} não existe mais em ~/.kube` }), 409)
  c.environment = k.environment
  return { file: k.file, context: c.context, environment: k.environment, kubeconfigId: k.id, namespace: c.namespace }
}

// Text chunks become one event in the history: the file stays small and a re-read matches the screen.
function record(c: Conversation, e: DoctorEvent) {
  const last = c.events.at(-1)
  if ((e.type === 'text' || e.type === 'thinking') && last?.type === e.type) last.text += e.text
  else c.events.push(structuredClone(e))
}

const recap = (c: Conversation) =>
  c.events.filter(e => e.type === 'user' || e.type === 'text').map(e => `${e.type === 'user' ? 'Usuário' : 'Você'}: ${(e as { text: string }).text}`).join('\n\n').slice(-6000)

async function turn(c: Conversation, prompt: string, send: (e: DoctorEvent) => void) {
  if (running.has(c.id)) throw new DoctorError(say({ en: 'an answer is already running in this conversation', pt: 'já há uma resposta em andamento nesta conversa' }), 409)
  const abort = new AbortController()
  running.set(c.id, abort)
  const emit = (e: DoctorEvent) => (record(c, e), send(e))
  try {
    const scope = await scopeOf(c)
    let result
    try {
      result = await runDoctor(scope, prompt, c.claudeSessionId, emit, abort.signal)
    } catch (e) {
      // Claude session lost (another machine, CLI cleanup): starts over with a summary of what was said.
      if (!c.claudeSessionId || !/session|conversation/i.test((e as Error).message)) throw e
      emit({ type: 'status', message: say({ en: 'the previous Claude session no longer exists; continuing with a summary of the conversation', pt: 'a sessão anterior do Claude não existe mais; continuando com um resumo da conversa' }) })
      result = await runDoctor(scope, `Resumo da conversa até aqui:\n${recap(c)}\n\n${prompt}`, null, emit, abort.signal)
    }
    c.claudeSessionId = result.sessionId ?? c.claudeSessionId

    const proposal = findProposal(result.text)
    if (proposal) {
      const action = proposal.decision.action as Pending['action']
      const auth = authorizeMutation(scope.environment, action)
      c.pending = auth.allowed ? { line: proposal.line, action } : null
      emit({ type: 'mutation', line: proposal.line, action, allowed: auth.allowed, reason: auth.allowed ? null : auth.reason })
    }
  } catch (e) {
    emit({ type: 'error', message: (e as Error).message })
  } finally {
    running.delete(c.id)
    save(c)
  }
}

export async function ask(c: Conversation, message: string, send: (e: DoctorEvent) => void) {
  // A new question drops the pending proposal: the conversation moved on, the write may no longer make sense.
  c.pending = null
  const e: DoctorEvent = { type: 'user', text: message }
  record(c, e)
  send(e)
  await turn(c, message, send)
}

export async function approve(c: Conversation, send: (e: DoctorEvent) => void) {
  const pending = c.pending
  if (!pending) throw new DoctorError(say({ en: 'nothing pending confirmation in this conversation', pt: 'nada pendente de confirmação nesta conversa' }), 409)
  if (running.has(c.id)) throw new DoctorError(say({ en: 'an answer is already running in this conversation', pt: 'já há uma resposta em andamento nesta conversa' }), 409)
  const scope = await scopeOf(c)
  const auth = authorizeMutation(scope.environment, pending.action)
  c.pending = null
  if (!auth.allowed) {
    save(c)
    throw new DoctorError(auth.reason, 403)
  }
  const result = await executeApproved(scope, pending.line)
  console.log(`[doctor] executado com confirmação: ${pending.line} em ${scope.kubeconfigId}/${scope.context} (${scope.environment}) → ${result.ok ? 'ok' : 'falhou'}`)
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  const executed: DoctorEvent = { type: 'executed', line: pending.line, ok: result.ok, output }
  record(c, executed)
  send(executed)
  await turn(c, `O usuário CONFIRMOU e o painel já executou (não reexecute): ${pending.line}\nResultado: ${result.ok ? 'sucesso' : 'falhou'}\n${output.slice(0, 3000)}\n\nVerifique o efeito com leituras e diga se o problema foi resolvido.`, send)
}

export async function reject(c: Conversation, send: (e: DoctorEvent) => void) {
  const pending = c.pending
  if (!pending) throw new DoctorError(say({ en: 'nothing pending confirmation in this conversation', pt: 'nada pendente de confirmação nesta conversa' }), 409)
  c.pending = null
  await turn(c, `O usuário RECUSOU o comando ${pending.line}. Não o proponha de novo; siga investigando ou sugira alternativas.`, send)
}
