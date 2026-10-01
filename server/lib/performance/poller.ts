// Coletor da Performance: amostra CPU/memória/restarts/throttling/eventos/malha dos pods escolhidos,
// em intervalo fixo, dentro do processo do servidor.
//
// Cada observação guarda o próprio alvo (kubeconfig + contexto), então não depende da sessão da tela
// Cluster. Ao subir o servidor, as que estavam "rodando" voltam a coletar sozinhas: o alvo está em
// disco e o que se pediu foi "observar até eu mandar parar". O intervalo sem servidor fica como buraco
// no gráfico.
//
// Metadados em observations.json (baixa frequência); amostras em samples/<id>.jsonl, uma linha por
// coleta (alta frequência: append, sem reler e regravar o arquivo).

import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { getKubeconfig } from '../k8s/kubeconfigs.ts'
import { KubeError, type Target } from '../k8s/kubectl.ts'
import { fetchThrottling, findGatewayPod, findPrometheus, readMeshSnapshot, sampleNamespace, type PromRef } from './cluster.ts'
import { cleanKubeMessage, meshDiff, type MeshSnapshot, type Sample, type Target as ObsTarget } from './metrics.ts'

export const PERF_DIR = dataFile('performance')
const SAMPLES_DIR = join(PERF_DIR, 'samples')
const OBS_FILE = join(PERF_DIR, 'observations.json')
mkdirSync(SAMPLES_DIR, { recursive: true })

export const MIN_INTERVAL = 15
const MAX_TARGETS = 20

export type Status = 'running' | 'stopped' | 'failed'
export type ObservationMeta = {
  id: string
  kubeconfigId: string
  context: string
  namespace: string
  targets: ObsTarget[]
  intervalSeconds: number
  status: Status
  startedAt: string
  stoppedAt: string | null
  failure: string | null
}

type Entry = {
  timer: NodeJS.Timeout
  target: Target
  subscribers: Set<(e: object) => void>
  seenEvents: Set<string>
  lastTickAt: string | null
  lastError: string | null
  // Malha e throttling são best-effort: a primeira falha desliga a coleta para esta observação.
  meshOff: string | null
  meshSnapshot: MeshSnapshot | null
  meshAt: number | null
  gatewayPod: string | null
  throttleOff: string | null
  prometheus: PromRef | null
}

const active = new Map<string, Entry>()

const readAll = () => readJson<Record<string, ObservationMeta>>(OBS_FILE, {})
const samplesPath = (id: string) => join(SAMPLES_DIR, `${id}.jsonl`)

function patch(id: string, p: Partial<ObservationMeta>) {
  const all = readAll()
  if (!all[id]) return
  all[id] = { ...all[id], ...p }
  writeJson(OBS_FILE, all)
}

function withLive(m: ObservationMeta) {
  const e = active.get(m.id)
  return { ...m, lastTickAt: e?.lastTickAt ?? null, lastError: e?.lastError ?? null, meshOff: e?.meshOff ?? null, throttleOff: e?.throttleOff ?? null, live: Boolean(e) }
}

export const listObservations = () => Object.values(readAll()).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(withLive)
export const getObservation = (id: string) => {
  const m = readAll()[id]
  return m ? withLive(m) : null
}

export async function resolveTarget(kubeconfigId: string, context: string): Promise<Target> {
  const k = await getKubeconfig(kubeconfigId)
  if (!k) throw new Error(`kubeconfig ${kubeconfigId} não existe mais em ~/.kube`)
  if (!k.contexts.includes(context)) throw new Error(`contexto ${context} não existe em ${kubeconfigId}`)
  return { file: k.file, context }
}

function broadcast(id: string, event: object) {
  for (const send of active.get(id)?.subscribers ?? []) send(event)
}

async function collectMesh(e: Entry, namespace: string, services: Set<string>) {
  if (e.meshOff || !services.size) return null
  e.gatewayPod ??= await findGatewayPod(e.target)
  if (!e.gatewayPod) {
    e.meshOff = 'sem istio-ingressgateway neste cluster'
    return null
  }
  const now = Date.now()
  const snapshot = await readMeshSnapshot(e.target, e.gatewayPod, namespace, services)
  const windows = e.meshSnapshot && e.meshAt ? meshDiff(snapshot, e.meshSnapshot, now - e.meshAt) : []
  e.meshSnapshot = snapshot
  e.meshAt = now
  return windows.length ? windows : null
}

async function collectThrottle(e: Entry, meta: ObservationMeta) {
  if (e.throttleOff) return null
  e.prometheus ??= await findPrometheus(e.target)
  if (!e.prometheus) {
    e.throttleOff = 'sem Prometheus neste cluster'
    return null
  }
  return fetchThrottling(e.target, e.prometheus, meta.namespace, meta.targets.map(t => t.pod), meta.intervalSeconds * 2)
}

// RBAC negando o proxy é o caso comum com usuário do Rancher: diz o que falta em vez do erro cru.
function offReason(err: unknown, what: string) {
  const msg = (err as Error).message
  if (/forbidden/i.test(msg)) return `o RBAC deste usuário não permite ler ${what}`
  return cleanKubeMessage(msg, 200)
}

async function tick(id: string) {
  const meta = readAll()[id]
  const e = active.get(id)
  if (!meta || !e) return
  let base
  try {
    base = await sampleNamespace(e.target, meta.namespace, meta.targets, e.seenEvents)
  } catch (err) {
    // Credencial recusada ou RBAC negando: repetir a cada tick não resolve, para e diz o motivo.
    if (err instanceof KubeError && (err.kind === 'unauthorized' || err.kind === 'forbidden')) {
      stopObservation(id, 'failed', `o cluster recusou a leitura: ${cleanKubeMessage(err.message, 200)}`)
      return
    }
    e.lastError = cleanKubeMessage((err as Error).message, 200)
    return
  }

  const [throttle, mesh] = await Promise.all([
    collectThrottle(e, meta).catch(err => ((e.throttleOff = offReason(err, 'o Prometheus do cluster (services/proxy)')), null)),
    collectMesh(e, meta.namespace, base.services).catch(err => ((e.meshOff = offReason(err, 'o Envoy do istio-ingressgateway (pods/proxy)')), null)),
  ])
  for (const p of base.pods) p.throttlePct = throttle?.get(`${p.pod}/${p.container}`) ?? null

  const sample: Sample = { t: base.t, pods: base.pods, events: base.events, mesh }
  appendFileSync(samplesPath(id), JSON.stringify(sample) + '\n')
  e.lastTickAt = base.t
  e.lastError = null
  broadcast(id, { type: 'sample', sample })
}

function schedule(meta: ObservationMeta, target: Target) {
  const e: Entry = {
    timer: setInterval(() => void tick(meta.id).catch(err => console.error(`[performance] tick ${meta.id}:`, err)), meta.intervalSeconds * 1000),
    target, subscribers: new Set(), seenEvents: new Set(), lastTickAt: null, lastError: null,
    meshOff: null, meshSnapshot: null, meshAt: null, gatewayPod: null, throttleOff: null, prometheus: null,
  }
  active.set(meta.id, e)
  void tick(meta.id).catch(err => console.error(`[performance] tick ${meta.id}:`, err))
}

export async function startObservation(input: { kubeconfigId: string; context: string; namespace: string; targets: ObsTarget[]; intervalSeconds: number }) {
  if (!input.targets.length) throw new Error('selecione ao menos um pod')
  if (input.targets.length > MAX_TARGETS) throw new Error(`no máximo ${MAX_TARGETS} pods por observação`)
  const target = await resolveTarget(input.kubeconfigId, input.context)
  const meta: ObservationMeta = {
    id: randomUUID(),
    kubeconfigId: input.kubeconfigId,
    context: input.context,
    namespace: input.namespace,
    targets: input.targets,
    intervalSeconds: Math.max(MIN_INTERVAL, Math.round(input.intervalSeconds) || 30),
    status: 'running',
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    failure: null,
  }
  writeJson(OBS_FILE, { ...readAll(), [meta.id]: meta })
  schedule(meta, target)
  console.log(`[performance] observação ${meta.id} iniciada: ${meta.kubeconfigId}/${meta.namespace}, ${meta.targets.length} pod(s) a cada ${meta.intervalSeconds}s`)
  return withLive(meta)
}

export async function resumeObservation(id: string) {
  const meta = readAll()[id]
  if (!meta) throw new Error('observação não encontrada')
  if (active.has(id)) return withLive(meta)
  const target = await resolveTarget(meta.kubeconfigId, meta.context)
  patch(id, { status: 'running', stoppedAt: null, failure: null })
  schedule({ ...meta, status: 'running' }, target)
  return getObservation(id)
}

export function stopObservation(id: string, status: Status = 'stopped', failure: string | null = null) {
  const e = active.get(id)
  if (e) {
    clearInterval(e.timer)
    broadcast(id, { type: 'stopped', status, failure })
    active.delete(id)
  }
  patch(id, { status, stoppedAt: new Date().toISOString(), failure })
}

export function deleteObservation(id: string) {
  stopObservation(id)
  const all = readAll()
  delete all[id]
  writeJson(OBS_FILE, all)
  if (existsSync(samplesPath(id))) unlinkSync(samplesPath(id))
}

export function subscribe(id: string, send: (e: object) => void) {
  const e = active.get(id)
  if (!e) return null
  e.subscribers.add(send)
  return () => void e.subscribers.delete(send)
}

export function readSamples(id: string, range: { from?: string; to?: string } = {}): Sample[] {
  if (!existsSync(samplesPath(id))) return []
  const samples = readFileSync(samplesPath(id), 'utf-8').split('\n').filter(Boolean).flatMap(l => {
    try {
      return [JSON.parse(l) as Sample]
    } catch {
      return [] // linha cortada por um crash no meio da escrita
    }
  })
  return samples.filter(s => (!range.from || s.t >= range.from) && (!range.to || s.t <= range.to))
}

// Retoma, ao subir o servidor, o que estava rodando. Falha ao resolver o alvo marca a observação.
export async function resumeRunning() {
  for (const meta of Object.values(readAll()).filter(m => m.status === 'running')) {
    try {
      schedule(meta, await resolveTarget(meta.kubeconfigId, meta.context))
      console.log(`[performance] observação ${meta.id} retomada após reinício do servidor`)
    } catch (err) {
      patch(meta.id, { status: 'failed', failure: (err as Error).message, stoppedAt: new Date().toISOString() })
    }
  }
}
