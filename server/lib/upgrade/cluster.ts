// O que o cluster conectado tem que quebra numa versão de destino, e o vencimento do TLS dos ingresses.
// Só leitura (get, version, get --raw /metrics), na sessão escolhida na tela Cluster.
// Autoteste: node server/lib/upgrade/cluster.ts --selfcheck

import assert from 'node:assert/strict'
import { mapLimit } from '../concurrency.ts'
import { explain, requireSession } from '../k8s/cluster.ts'
import { KubeError, kubectl, kubectlJson, type Target } from '../k8s/kubectl.ts'
import { CLUSTER_RESOURCES, appliedApiVersion, parseDeprecatedMetrics, parseVersion, removalFor, type DeprecatedCall, type Removal } from './deprecations.ts'
import { tlsCertificate, type CertInfo } from './certs.ts'
import { say } from '../i18n.ts'

type Obj = { kind: string; metadata: { name: string; namespace?: string; annotations?: Record<string, string> }; spec?: { tls?: { hosts?: string[] }[]; hosts?: string[] } }

export type ObjectHit = { kind: string; namespace: string | null; name: string; appliedWith: string; removal: Removal }

export type ClusterReport = {
  context: string
  serverVersion: string | null
  target: string
  objects: ObjectHit[]
  // null = o RBAC não deixou ler as métricas do apiserver.
  deprecatedCalls: DeprecatedCall[] | null
  forbidden: string[]
  scanned: number
}

// Próxima versão minor: o destino mais comum de um upgrade, e o padrão da tela.
export function nextMinor(server: string | null) {
  const v = parseVersion(server ?? '')
  return Number.isNaN(v) ? '1.31' : `${Math.floor(v / 1000)}.${(v % 1000) + 1}`
}

async function serverVersion(t: Target) {
  try {
    const out = JSON.parse(await kubectl(t, ['version', '-o', 'json'])) as { serverVersion?: { gitVersion?: string } }
    return out.serverVersion?.gitVersion ?? null
  } catch (e) {
    if (e instanceof KubeError && e.kind === 'unreachable') explain(e)
    return null // version com RBAC mínimo ainda funciona; sem ele, a tela pede o destino à mão
  }
}

const scope = (namespace: string | null) => (namespace ? ['-n', namespace] : ['-A'])

// Lista um tipo de recurso; tipo que o cluster não serve (ex.: ingressclasses num cluster antigo)
// some sem erro, e tipo que o RBAC bloqueia vira aviso.
async function listKind(t: Target, resource: string, namespace: string | null, forbidden: string[]): Promise<Obj[]> {
  try {
    return (await kubectlJson<{ items: Obj[] }>(t, ['get', resource, ...scope(namespace)], 60_000)).items
  } catch (e) {
    if (e instanceof KubeError && e.kind === 'forbidden') return (forbidden.push(resource), [])
    if (e instanceof KubeError && (e.kind === 'notfound' || /doesn't have a resource type/.test(e.message))) return []
    explain(e)
  }
}

export function objectHits(items: Obj[], target: string): ObjectHit[] {
  return items.flatMap(o => {
    const applied = appliedApiVersion(o.metadata.annotations)
    const removal = applied ? removalFor(applied, o.kind, target) : null
    return removal ? [{ kind: o.kind, namespace: o.metadata.namespace ?? null, name: o.metadata.name, appliedWith: applied!, removal }] : []
  })
}

export async function clusterReport(target: string | null, namespace: string | null): Promise<ClusterReport> {
  const { target: t, context } = await requireSession()
  const server = await serverVersion(t)
  const dest = target ?? nextMinor(server)
  const forbidden: string[] = []
  const lists = await mapLimit(CLUSTER_RESOURCES, 4, r => listKind(t, r, namespace, forbidden))

  let deprecatedCalls: DeprecatedCall[] | null = null
  try {
    deprecatedCalls = parseDeprecatedMetrics(await kubectl(t, ['get', '--raw', '/metrics'], 60_000))
      .filter(c => parseVersion(c.removedRelease) <= parseVersion(dest))
  } catch (e) {
    if (!(e instanceof KubeError) || e.kind !== 'forbidden') throw e
  }
  return { context, serverVersion: server, target: dest, objects: lists.flatMap(l => objectHits(l, dest)), deprecatedCalls, forbidden, scanned: lists.flat().length }
}

export type IngressCert = { host: string; ingresses: string[]; info: CertInfo }

// Hosts com TLS: spec.tls dos Ingresses e spec.hosts dos VirtualServices do Istio (o TLS termina no
// gateway, e o host é o que o cliente acessa). Nome curto de serviço interno não tem certificado público.
export function tlsHosts(objects: Obj[]): Map<string, string[]> {
  const hosts = new Map<string, string[]>()
  for (const o of objects) {
    const found = o.kind === 'VirtualService' ? (o.spec?.hosts ?? []).filter(h => h.includes('.') && !h.endsWith('.svc.cluster.local')) : (o.spec?.tls ?? []).flatMap(t => t.hosts ?? [])
    const label = `${o.kind === 'VirtualService' ? 'vs' : 'ing'}:${o.metadata.namespace}/${o.metadata.name}`
    for (const host of found) hosts.set(host, [...(hosts.get(host) ?? []), label])
  }
  return hosts
}

export async function ingressCertificates(namespace: string | null): Promise<{ context: string; forbidden: string[]; certificates: IngressCert[] }> {
  const { target: t, context } = await requireSession()
  const forbidden: string[] = []
  // VirtualService só existe com Istio: sem o CRD, listKind devolve vazio e fica só o Ingress.
  const [ingresses, virtualServices] = await Promise.all([
    listKind(t, 'ingresses', namespace, forbidden),
    listKind(t, 'virtualservices.networking.istio.io', namespace, forbidden),
  ])
  const hosts = [...tlsHosts([...ingresses, ...virtualServices])]
  const certificates = await mapLimit(hosts, 8, async ([host, names]): Promise<IngressCert> => ({
    host,
    ingresses: names,
    // Curinga não é um host conectável: o certificado dele aparece pelos hosts concretos.
    info: host.startsWith('*.')
      ? { validTo: null, daysLeft: null, state: 'sem-certificado', detail: say({ en: 'wildcard host: check through the concrete hosts', pt: 'host curinga: confira pelos hosts concretos' }) }
      : await tlsCertificate(host),
  }))
  return { context, forbidden, certificates: certificates.sort((a, b) => (a.info.daysLeft ?? 1e9) - (b.info.daysLeft ?? 1e9)) }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.equal(nextMinor('v1.29.3+rke2r1'), '1.30')
  assert.equal(nextMinor(null), '1.31')

  const last = (apiVersion: string, kind: string) => ({ 'kubectl.kubernetes.io/last-applied-configuration': JSON.stringify({ apiVersion, kind }) })
  const items: Obj[] = [
    { kind: 'CronJob', metadata: { name: 'limpeza', namespace: 'app', annotations: last('batch/v1beta1', 'CronJob') } },
    { kind: 'CronJob', metadata: { name: 'novo', namespace: 'app', annotations: last('batch/v1', 'CronJob') } },
    { kind: 'Ingress', metadata: { name: 'helm', namespace: 'app' } },
  ]
  const hits = objectHits(items, '1.25')
  assert.deepEqual(hits.map(h => [h.name, h.appliedWith, h.removal.replacement]), [['limpeza', 'batch/v1beta1', 'batch/v1']])
  assert.equal(objectHits(items, '1.24').length, 0)

  const hosts = tlsHosts([
    { kind: 'Ingress', metadata: { name: 'a', namespace: 'x' }, spec: { tls: [{ hosts: ['app.exemplo.com', '*.exemplo.com'] }] } },
    { kind: 'Ingress', metadata: { name: 'b', namespace: 'y' }, spec: { tls: [{ hosts: ['app.exemplo.com'] }] } },
    { kind: 'Ingress', metadata: { name: 'sem-tls', namespace: 'y' } },
    { kind: 'VirtualService', metadata: { name: 'vs', namespace: 'z' }, spec: { hosts: ['app.exemplo.com', 'api', 'api.z.svc.cluster.local'] } },
  ])
  assert.deepEqual([...hosts], [['app.exemplo.com', ['ing:x/a', 'ing:y/b', 'vs:z/vs']], ['*.exemplo.com', ['ing:x/a']]])
  console.log('upgrade cluster selfcheck: ok')
}
