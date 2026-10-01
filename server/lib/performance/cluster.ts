// Leituras de cluster da Performance, todas somente leitura via kubectl: pods/métricas/eventos, o
// Prometheus do Rancher Monitoring (proxy de service do apiserver) e o Envoy do istio-ingressgateway.
import { createInterface } from 'node:readline'
import { KubeError, kubectlJson, kubectlRaw, kubectlStream, type Target } from '../k8s/kubectl.ts'
import { cpuMillis, memBytes } from '../k8s/units.ts'
import { LIMIT_SERIES, SERIES, accumulateLine, historyToSamples, podSelector, type MeshSnapshot, type PodSample, type Sample, type Target as ObsTarget } from './metrics.ts'

type List<T> = { items: T[] }
type PodJson = {
  metadata: { name: string; labels?: Record<string, string> }
  spec: { containers: { name: string; resources?: { limits?: Record<string, string> } }[] }
  status: { containerStatuses?: { name: string; restartCount?: number; lastState?: { terminated?: { reason?: string } } }[] }
}

export async function listPods(t: Target, namespace: string) {
  const pods = await kubectlJson<List<PodJson>>(t, ['get', 'pods', '-n', namespace])
  return pods.items.map(p => ({ name: p.metadata.name, containers: p.spec.containers.map(c => c.name) })).sort((a, b) => a.name.localeCompare(b.name))
}

export async function listNamespaces(t: Target) {
  const ns = await kubectlJson<List<{ metadata: { name: string } }>>(t, ['get', 'namespaces'])
  return ns.items.map(n => n.metadata.name).sort()
}

type EventJson = { metadata: { uid: string }; involvedObject?: { name?: string }; reason?: string; message?: string; lastTimestamp?: string; eventTime?: string }

// Uma coleta: pods, uso (metrics-server) e eventos do namespace, filtrados pelos alvos.
export async function sampleNamespace(t: Target, namespace: string, targets: ObsTarget[], seenEvents: Set<string>) {
  const wanted = new Set(targets.map(x => x.pod))
  const [pods, metrics, events] = await Promise.all([
    kubectlJson<List<PodJson>>(t, ['get', 'pods', '-n', namespace]),
    kubectlRaw<List<{ metadata: { name: string }; containers: { name: string; usage: { cpu: string; memory: string } }[] }>>(t, `/apis/metrics.k8s.io/v1beta1/namespaces/${encodeURIComponent(namespace)}/pods`).catch(() => null),
    kubectlJson<List<EventJson>>(t, ['get', 'events', '-n', namespace]).catch(() => null),
  ])
  const byName = new Map(pods.items.filter(p => wanted.has(p.metadata.name)).map(p => [p.metadata.name, p]))
  const usage = new Map((metrics?.items ?? []).map(m => [m.metadata.name, m]))
  const now = new Date().toISOString()

  const samples: PodSample[] = []
  for (const target of targets) {
    const pod = byName.get(target.pod)
    if (!pod) continue
    const containers = target.containers.length ? target.containers : pod.spec.containers.map(c => c.name)
    for (const name of containers) {
      const spec = pod.spec.containers.find(c => c.name === name)
      const status = pod.status.containerStatuses?.find(c => c.name === name)
      const u = usage.get(target.pod)?.containers.find(c => c.name === name)
      samples.push({
        pod: target.pod,
        container: name,
        cpuMilli: u ? cpuMillis(u.usage.cpu) : null,
        cpuLimitMilli: cpuMillis(spec?.resources?.limits?.cpu) || null,
        memBytes: u ? memBytes(u.usage.memory) : null,
        memLimitBytes: memBytes(spec?.resources?.limits?.memory) || null,
        restartCount: status?.restartCount ?? 0,
        lastTerminatedReason: status?.lastState?.terminated?.reason ?? null,
        throttlePct: null,
      })
    }
  }

  const newEvents: Sample['events'] = []
  for (const ev of events?.items ?? []) {
    const podName = ev.involvedObject?.name
    if (!podName || !wanted.has(podName) || seenEvents.has(ev.metadata.uid)) continue
    seenEvents.add(ev.metadata.uid)
    newEvents.push({ pod: podName, reason: ev.reason ?? '', message: ev.message ?? '', t: ev.lastTimestamp ?? ev.eventTime ?? now })
  }

  // O Istio agrega por canonical service, não por pod.
  const services = new Set<string>()
  for (const p of byName.values()) {
    const name = p.metadata.labels?.['service.istio.io/canonical-name'] ?? p.metadata.labels?.app
    if (name) services.add(name)
  }
  return { t: now, pods: samples, events: newEvents, services }
}

// ── Prometheus ────────────────────────────────────────────────────────────────

export type PromRef = { namespace: string; service: string; port: number }
// Onde o Rancher Monitoring instala o Prometheus. O headless (operated) não passa pelo proxy de service.
const PROMETHEUS_NAMESPACES = ['cattle-monitoring-system', 'monitoring', 'prometheus']

export async function findPrometheus(t: Target): Promise<PromRef | null> {
  for (const namespace of PROMETHEUS_NAMESPACES) {
    const svcs = await kubectlJson<List<{ metadata: { name: string }; spec: { clusterIP?: string; ports?: { port: number }[] } }>>(t, ['get', 'services', '-n', namespace]).catch(() => null)
    for (const s of svcs?.items ?? []) {
      const name = s.metadata.name
      if (!name.includes('prometheus') || /adapter|operator|node-exporter|operated/.test(name)) continue
      if (!s.spec.clusterIP || s.spec.clusterIP === 'None') continue
      if (s.spec.ports?.some(p => p.port === 9090)) return { namespace, service: name, port: 9090 }
    }
  }
  return null
}

type PromResult = { status: string; error?: string; data: { result: { metric: Record<string, string>; values?: [number, string][]; value?: [number, string] }[] } }

async function promQuery(t: Target, ref: PromRef, endpoint: 'query' | 'query_range', params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  const body = await kubectlRaw<PromResult>(t, `/api/v1/namespaces/${ref.namespace}/services/${ref.service}:${ref.port}/proxy/api/v1/${endpoint}?${qs}`)
  if (body.status !== 'success') throw new Error(body.error ?? 'o Prometheus recusou a consulta')
  return body.data.result
}

export async function fetchHistory(t: Target, namespace: string, pods: string[], fromMs: number, toMs: number, stepSec: number): Promise<Sample[] | null> {
  const ref = await findPrometheus(t)
  if (!ref) return null
  const sel = podSelector(namespace, pods)
  // A janela do rate precisa cobrir ao menos dois scrapes, senão sai vazia em step curto.
  const w = `${Math.max(60, stepSec * 2)}s`
  const range = { start: String(Math.floor(fromMs / 1000)), end: String(Math.floor(toMs / 1000)), step: String(stepSec) }
  const queries: Record<string, string> = {
    cpuMilli: SERIES.cpuMilli(sel, w),
    memBytes: SERIES.memBytes(sel),
    restartCount: SERIES.restartCount(sel),
    throttlePct: SERIES.throttlePct(sel, w),
    cpuLimitMilli: LIMIT_SERIES.cpuLimitMilli(sel),
    memLimitBytes: LIMIT_SERIES.memLimitBytes(sel),
  }
  const entries = await Promise.all(Object.entries(queries).map(async ([k, q]) => [k, await promQuery(t, ref, 'query_range', { query: q, ...range })] as const))
  return historyToSamples(Object.fromEntries(entries))
}

export async function fetchThrottling(t: Target, ref: PromRef, namespace: string, pods: string[], windowSec: number) {
  const result = await promQuery(t, ref, 'query', { query: SERIES.throttlePct(podSelector(namespace, pods), `${Math.max(60, windowSec)}s`) })
  const map = new Map<string, number>()
  for (const s of result) {
    const v = Number(s.value?.[1])
    if (Number.isFinite(v)) map.set(`${s.metric.pod}/${s.metric.container}`, v)
  }
  return map
}

// ── Istio ─────────────────────────────────────────────────────────────────────

export async function findGatewayPod(t: Target) {
  const pods = await kubectlJson<List<{ metadata: { name: string }; status: { phase?: string } }>>(t, ['get', 'pods', '-n', 'istio-system', '-l', 'app=istio-ingressgateway'])
  return pods.items.find(p => p.status.phase === 'Running')?.metadata.name ?? null
}

// Lê o /stats/prometheus do Envoy linha a linha (~30 MB descompactado): nunca vira uma string só.
export async function readMeshSnapshot(t: Target, gatewayPod: string, namespace: string, wanted: Set<string>): Promise<MeshSnapshot> {
  const child = kubectlStream(t, ['get', '--raw', `/api/v1/namespaces/istio-system/pods/${gatewayPod}:15090/proxy/stats/prometheus?usedonly&filter=istio_request_duration`])
  const killer = setTimeout(() => child.kill('SIGKILL'), 30_000)
  const acc: MeshSnapshot = new Map()
  let stderr = ''
  child.stderr.on('data', c => (stderr += c.toString()))
  const exited = new Promise<number>(resolve => child.on('close', code => resolve(code ?? -1)))
  for await (const line of createInterface({ input: child.stdout })) accumulateLine(acc, line, namespace, wanted)
  const code = await exited
  clearTimeout(killer)
  if (code !== 0) throw new KubeError(stderr.split('\n').filter(l => l && !l.startsWith('Warning:')).join(' ') || `kubectl saiu com ${code}`, /forbidden/i.test(stderr) ? 'forbidden' : 'other')
  return acc
}
