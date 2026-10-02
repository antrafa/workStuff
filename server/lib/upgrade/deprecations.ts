// APIs do Kubernetes removidas em cada versão, segundo o guia oficial de migração
// (https://kubernetes.io/docs/reference/using-api/deprecation-guide/), e onde elas aparecem:
// objetos do cluster (pela anotação last-applied), métricas do apiserver e manifests de um repositório.
// Autoteste: node server/lib/upgrade/deprecations.ts --selfcheck

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

export type Removal = { apiVersion: string; kind: string; removedIn: string; replacement: string | null }

const r = (removedIn: string, apiVersion: string, kinds: string[], replacement: string | null): Removal[] =>
  kinds.map(kind => ({ apiVersion, kind, removedIn, replacement }))

export const REMOVALS: Removal[] = [
  ...r('1.16', 'extensions/v1beta1', ['Deployment', 'DaemonSet', 'ReplicaSet'], 'apps/v1'),
  ...r('1.16', 'apps/v1beta1', ['Deployment', 'StatefulSet', 'ReplicaSet'], 'apps/v1'),
  ...r('1.16', 'apps/v1beta2', ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'], 'apps/v1'),
  ...r('1.16', 'extensions/v1beta1', ['NetworkPolicy'], 'networking.k8s.io/v1'),
  ...r('1.16', 'extensions/v1beta1', ['PodSecurityPolicy'], 'policy/v1beta1'),
  ...r('1.22', 'admissionregistration.k8s.io/v1beta1', ['MutatingWebhookConfiguration', 'ValidatingWebhookConfiguration'], 'admissionregistration.k8s.io/v1'),
  ...r('1.22', 'apiextensions.k8s.io/v1beta1', ['CustomResourceDefinition'], 'apiextensions.k8s.io/v1'),
  ...r('1.22', 'apiregistration.k8s.io/v1beta1', ['APIService'], 'apiregistration.k8s.io/v1'),
  ...r('1.22', 'authentication.k8s.io/v1beta1', ['TokenReview'], 'authentication.k8s.io/v1'),
  ...r('1.22', 'authorization.k8s.io/v1beta1', ['SubjectAccessReview', 'LocalSubjectAccessReview', 'SelfSubjectAccessReview'], 'authorization.k8s.io/v1'),
  ...r('1.22', 'certificates.k8s.io/v1beta1', ['CertificateSigningRequest'], 'certificates.k8s.io/v1'),
  ...r('1.22', 'coordination.k8s.io/v1beta1', ['Lease'], 'coordination.k8s.io/v1'),
  ...r('1.22', 'extensions/v1beta1', ['Ingress'], 'networking.k8s.io/v1'),
  ...r('1.22', 'networking.k8s.io/v1beta1', ['Ingress', 'IngressClass'], 'networking.k8s.io/v1'),
  ...r('1.22', 'rbac.authorization.k8s.io/v1beta1', ['ClusterRole', 'ClusterRoleBinding', 'Role', 'RoleBinding'], 'rbac.authorization.k8s.io/v1'),
  ...r('1.22', 'scheduling.k8s.io/v1beta1', ['PriorityClass'], 'scheduling.k8s.io/v1'),
  ...r('1.22', 'storage.k8s.io/v1beta1', ['CSIDriver', 'CSINode', 'StorageClass', 'VolumeAttachment'], 'storage.k8s.io/v1'),
  ...r('1.25', 'batch/v1beta1', ['CronJob'], 'batch/v1'),
  ...r('1.25', 'discovery.k8s.io/v1beta1', ['EndpointSlice'], 'discovery.k8s.io/v1'),
  ...r('1.25', 'events.k8s.io/v1beta1', ['Event'], 'events.k8s.io/v1'),
  ...r('1.25', 'autoscaling/v2beta1', ['HorizontalPodAutoscaler'], 'autoscaling/v2'),
  ...r('1.25', 'policy/v1beta1', ['PodDisruptionBudget'], 'policy/v1'),
  ...r('1.25', 'policy/v1beta1', ['PodSecurityPolicy'], null),
  ...r('1.25', 'node.k8s.io/v1beta1', ['RuntimeClass'], 'node.k8s.io/v1'),
  ...r('1.26', 'flowcontrol.apiserver.k8s.io/v1beta1', ['FlowSchema', 'PriorityLevelConfiguration'], 'flowcontrol.apiserver.k8s.io/v1'),
  ...r('1.26', 'autoscaling/v2beta2', ['HorizontalPodAutoscaler'], 'autoscaling/v2'),
  ...r('1.27', 'storage.k8s.io/v1beta1', ['CSIStorageCapacity'], 'storage.k8s.io/v1'),
  ...r('1.29', 'flowcontrol.apiserver.k8s.io/v1beta2', ['FlowSchema', 'PriorityLevelConfiguration'], 'flowcontrol.apiserver.k8s.io/v1'),
  ...r('1.32', 'flowcontrol.apiserver.k8s.io/v1beta3', ['FlowSchema', 'PriorityLevelConfiguration'], 'flowcontrol.apiserver.k8s.io/v1'),
]

// Recursos que o cluster lista para procurar a versão com que cada objeto foi aplicado.
export const CLUSTER_RESOURCES = [
  'deployments', 'daemonsets', 'statefulsets', 'cronjobs', 'ingresses', 'networkpolicies', 'poddisruptionbudgets',
  'horizontalpodautoscalers', 'roles', 'rolebindings', 'clusterroles', 'clusterrolebindings', 'priorityclasses',
  'storageclasses', 'customresourcedefinitions', 'mutatingwebhookconfigurations', 'validatingwebhookconfigurations',
  'ingressclasses', 'runtimeclasses',
]

export const parseVersion = (v: string) => {
  const m = v.match(/(\d+)\.(\d+)/)
  return m ? Number(m[1]) * 1000 + Number(m[2]) : NaN
}

// Removida até a versão de destino (inclusive): o que quebra ao atualizar para ela.
export function removalFor(apiVersion: string, kind: string, target: string): Removal | null {
  const t = parseVersion(target)
  return REMOVALS.find(x => x.apiVersion === apiVersion && x.kind === kind && parseVersion(x.removedIn) <= t) ?? null
}

// O apiserver devolve o objeto na versão preferida, não na usada para criar. A anotação do
// kubectl apply guarda a original; sem ela (helm, operador) não dá para saber.
export function appliedApiVersion(annotations: Record<string, string> | undefined): string | null {
  const raw = annotations?.['kubectl.kubernetes.io/last-applied-configuration']
  if (!raw) return null
  try {
    return (JSON.parse(raw) as { apiVersion?: string }).apiVersion ?? null
  } catch {
    return null
  }
}

// Chamadas recentes a API obsoleta, desde o último restart do apiserver. Pega o que a anotação não pega
// (helm, operador, CI chamando a API direto).
export type DeprecatedCall = { group: string; version: string; resource: string; removedRelease: string }

export function parseDeprecatedMetrics(metrics: string): DeprecatedCall[] {
  const out = new Map<string, DeprecatedCall>()
  for (const line of metrics.split('\n')) {
    if (!line.startsWith('apiserver_requested_deprecated_apis{')) continue
    const labels = Object.fromEntries([...line.matchAll(/(\w+)="([^"]*)"/g)].map(m => [m[1], m[2]]))
    if (line.trim().endsWith(' 0')) continue
    const call = { group: labels.group ?? '', version: labels.version ?? '', resource: labels.resource ?? '', removedRelease: labels.removed_release ?? '' }
    out.set(`${call.group}/${call.version}/${call.resource}`, call)
  }
  return [...out.values()]
}

export type ManifestHit = { file: string; line: number; apiVersion: string; kind: string; name: string | null; removal: Removal }

const SKIP = new Set(['node_modules', '.git', 'target', 'dist', 'build', 'vendor', 'graphify-out'])
const MAX_FILES = 2000

// Manifests de um repositório clonado: YAML com apiVersion e kind no topo de cada documento.
// Template do Helm entra também, desde que a linha do apiVersion seja literal.
export function scanManifests(root: string, target: string): { files: number; hits: ManifestHit[] } {
  const files: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || files.length >= MAX_FILES) return
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name) || name.startsWith('.')) continue
      const full = join(dir, name)
      const st = statSync(full, { throwIfNoEntry: false })
      if (st?.isDirectory()) walk(full, depth + 1)
      else if (st?.isFile() && /\.ya?ml$/.test(name) && st.size < 2 * 1024 * 1024) files.push(full)
    }
  }
  walk(root, 0)

  const hits: ManifestHit[] = []
  for (const file of files) {
    const lines = readFileSync(file, 'utf-8').split('\n')
    let doc: { apiVersion?: string; kind?: string; name?: string; line: number } = { line: 1 }
    const flush = () => {
      const removal = doc.apiVersion && doc.kind ? removalFor(doc.apiVersion, doc.kind, target) : null
      if (removal) hits.push({ file: relative(root, file), line: doc.line, apiVersion: doc.apiVersion!, kind: doc.kind!, name: doc.name ?? null, removal })
    }
    lines.forEach((l, i) => {
      if (/^---/.test(l)) return (flush(), (doc = { line: i + 2 }))
      const api = l.match(/^apiVersion:\s*["']?([\w.-]+\/v[\w]+|v1)["']?\s*$/)
      if (api) (doc.apiVersion = api[1]), (doc.line = i + 1)
      const kind = l.match(/^kind:\s*["']?(\w+)["']?\s*$/)
      if (kind) doc.kind = kind[1]
      const name = l.match(/^\s{2}name:\s*["']?([^"'\s#]+)/)
      if (name && !doc.name) doc.name = name[1]
    })
    flush()
  }
  return { files: files.length, hits }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.equal(removalFor('extensions/v1beta1', 'Ingress', '1.22')?.replacement, 'networking.k8s.io/v1')
  assert.equal(removalFor('extensions/v1beta1', 'Ingress', '1.21'), null, 'ainda existe na 1.21')
  assert.equal(removalFor('batch/v1beta1', 'CronJob', '1.30')?.removedIn, '1.25')
  assert.equal(removalFor('policy/v1beta1', 'PodSecurityPolicy', '1.25')?.replacement, null, 'PSP sem substituto')
  assert.equal(removalFor('apps/v1', 'Deployment', '1.40'), null)
  assert.ok(parseVersion('v1.29.3+rke2r1') === parseVersion('1.29'))

  assert.equal(appliedApiVersion({ 'kubectl.kubernetes.io/last-applied-configuration': '{"apiVersion":"batch/v1beta1","kind":"CronJob"}' }), 'batch/v1beta1')
  assert.equal(appliedApiVersion({}), null)
  assert.equal(appliedApiVersion({ 'kubectl.kubernetes.io/last-applied-configuration': 'não é json' }), null)

  const metrics = [
    '# HELP apiserver_requested_deprecated_apis ...',
    'apiserver_requested_deprecated_apis{group="policy",removed_release="1.25",resource="podsecuritypolicies",subresource="",version="v1beta1"} 1',
    'apiserver_requested_deprecated_apis{group="policy",removed_release="1.25",resource="podsecuritypolicies",subresource="status",version="v1beta1"} 1',
    'apiserver_requested_deprecated_apis{group="flowcontrol.apiserver.k8s.io",removed_release="1.29",resource="flowschemas",subresource="",version="v1beta2"} 0',
    'apiserver_request_total{code="200"} 9',
  ].join('\n')
  assert.deepEqual(parseDeprecatedMetrics(metrics), [{ group: 'policy', version: 'v1beta1', resource: 'podsecuritypolicies', removedRelease: '1.25' }])

  const root = mkdtempSync(join(tmpdir(), 'upgrade-manifests-'))
  try {
    mkdirSync(join(root, 'k8s'))
    writeFileSync(join(root, 'k8s', 'app.yaml'), [
      'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: api', '---',
      'apiVersion: extensions/v1beta1', 'kind: Ingress', 'metadata:', '  name: api-ingress', '---',
      'apiVersion: "batch/v1beta1"', 'kind: CronJob', 'metadata:', '  name: limpeza',
    ].join('\n'))
    writeFileSync(join(root, 'k8s', 'helm.yaml'), 'apiVersion: {{ .Values.api }}\nkind: Ingress\n')
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'node_modules', 'x.yaml'), 'apiVersion: extensions/v1beta1\nkind: Ingress\n')
    const { files, hits } = scanManifests(root, '1.25')
    assert.equal(files, 2, 'node_modules fica de fora')
    assert.deepEqual(hits.map(h => [h.kind, h.name, h.line]), [['Ingress', 'api-ingress', 6], ['CronJob', 'limpeza', 11]])
    assert.equal(scanManifests(root, '1.21').hits.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  console.log(`upgrade deprecations selfcheck: ok (${REMOVALS.length} remoções na tabela)`)
}
