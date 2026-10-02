// Comparação de workloads entre dois ambientes (ex.: HML e PRO): imagem, réplicas, recursos, variáveis
// e probes de cada Deployment, StatefulSet e CronJob. Só leitura.
// Autoteste: node server/lib/compare/workloads.ts --selfcheck

import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { kubectlJson, type Target } from '../k8s/kubectl.ts'

type EnvVar = { name: string; value?: string; valueFrom?: { secretKeyRef?: { name: string; key: string }; configMapKeyRef?: { name: string; key: string }; fieldRef?: { fieldPath: string } } }
type Probe = { httpGet?: { path?: string; port?: number | string }; tcpSocket?: { port?: number | string }; exec?: unknown; initialDelaySeconds?: number; periodSeconds?: number; timeoutSeconds?: number; failureThreshold?: number }
type ContainerJson = {
  name: string
  image: string
  env?: EnvVar[]
  envFrom?: { secretRef?: { name: string }; configMapRef?: { name: string } }[]
  resources?: { requests?: Record<string, string>; limits?: Record<string, string> }
  readinessProbe?: Probe
  livenessProbe?: Probe
}
type PodSpec = { containers: ContainerJson[] }
type WorkloadJson = {
  kind: string
  metadata: { name: string }
  spec: { replicas?: number; schedule?: string; template?: { spec: PodSpec }; jobTemplate?: { spec: { template: { spec: PodSpec } } } }
}

// Forma plana: cada campo comparável vira "caminho → valor". Diferença é só comparar dois mapas.
export type Flat = Record<string, string>
export type Workload = { kind: string; name: string; fields: Flat }

// Senha em texto puro no manifest acontece (visto em cluster real): o valor nunca vai para a tela.
// A impressão digital usa uma chave aleatória por processo, então só serve para comparar os dois lados
// desta resposta, e não para descobrir a senha por tentativa.
const SENSITIVE = /pass|senha|secret|token|key|credential|pwd|auth/i
const FINGERPRINT_KEY = randomBytes(32)
const fingerprint = (v: string) => `•••• oculto (${createHmac('sha256', FINGERPRINT_KEY).update(v).digest('hex').slice(0, 8)})`

// Secret nunca é lido: a variável aparece como a referência (nome do secret e chave), não o valor.
function envValue(e: EnvVar): string {
  const f = e.valueFrom
  if (f?.secretKeyRef) return `secret ${f.secretKeyRef.name}/${f.secretKeyRef.key}`
  if (f?.configMapKeyRef) return `configmap ${f.configMapKeyRef.name}/${f.configMapKeyRef.key}`
  if (f?.fieldRef) return `campo ${f.fieldRef.fieldPath}`
  const value = e.value ?? ''
  return value && SENSITIVE.test(e.name) ? fingerprint(value) : value
}

function probe(p: Probe | undefined): string {
  if (!p) return 'nenhuma'
  const how = p.httpGet ? `http ${p.httpGet.path ?? '/'}:${p.httpGet.port}` : p.tcpSocket ? `tcp ${p.tcpSocket.port}` : p.exec ? 'exec' : '?'
  return `${how} atraso=${p.initialDelaySeconds ?? 0}s período=${p.periodSeconds ?? 10}s timeout=${p.timeoutSeconds ?? 1}s falhas=${p.failureThreshold ?? 3}`
}

export function flatten(w: WorkloadJson): Workload {
  const pod = w.spec.template?.spec ?? w.spec.jobTemplate?.spec.template.spec
  const fields: Flat = {}
  if (w.spec.replicas !== undefined) fields['réplicas'] = String(w.spec.replicas)
  if (w.spec.schedule) fields['agenda'] = w.spec.schedule
  for (const c of pod?.containers ?? []) {
    const p = `${c.name}.`
    // Imagem separada em repositório e tag: a diferença que mais importa é a de versão.
    const at = c.image.lastIndexOf(':')
    const hasTag = at > c.image.lastIndexOf('/')
    fields[`${p}imagem`] = hasTag ? c.image.slice(0, at) : c.image
    fields[`${p}tag`] = hasTag ? c.image.slice(at + 1) : 'latest'
    for (const [k, v] of Object.entries(c.resources?.requests ?? {})) fields[`${p}requests.${k}`] = v
    for (const [k, v] of Object.entries(c.resources?.limits ?? {})) fields[`${p}limits.${k}`] = v
    for (const e of c.env ?? []) fields[`${p}env.${e.name}`] = envValue(e)
    for (const ref of c.envFrom ?? []) {
      if (ref.secretRef) fields[`${p}envFrom.secret.${ref.secretRef.name}`] = 'sim'
      if (ref.configMapRef) fields[`${p}envFrom.configmap.${ref.configMapRef.name}`] = 'sim'
    }
    fields[`${p}readiness`] = probe(c.readinessProbe)
    fields[`${p}liveness`] = probe(c.livenessProbe)
  }
  return { kind: w.kind, name: w.metadata.name, fields }
}

export type FieldDiff = { field: string; a: string | null; b: string | null }
export type WorkloadDiff = { kind: string; name: string; state: 'igual' | 'diferente' | 'só em A' | 'só em B'; diffs: FieldDiff[] }

export function compare(a: Workload[], b: Workload[]): WorkloadDiff[] {
  const key = (w: Workload) => `${w.kind}/${w.name}`
  const mapB = new Map(b.map(w => [key(w), w]))
  const out: WorkloadDiff[] = []
  for (const wa of a) {
    const wb = mapB.get(key(wa))
    mapB.delete(key(wa))
    if (!wb) {
      out.push({ kind: wa.kind, name: wa.name, state: 'só em A', diffs: [] })
      continue
    }
    const fields = [...new Set([...Object.keys(wa.fields), ...Object.keys(wb.fields)])].sort()
    const diffs = fields.filter(f => wa.fields[f] !== wb.fields[f]).map(f => ({ field: f, a: wa.fields[f] ?? null, b: wb.fields[f] ?? null }))
    out.push({ kind: wa.kind, name: wa.name, state: diffs.length ? 'diferente' : 'igual', diffs })
  }
  for (const wb of mapB.values()) out.push({ kind: wb.kind, name: wb.name, state: 'só em B', diffs: [] })
  const order = { diferente: 0, 'só em A': 1, 'só em B': 2, igual: 3 }
  return out.sort((x, y) => order[x.state] - order[y.state] || x.name.localeCompare(y.name))
}

export async function readWorkloads(t: Target, namespace: string): Promise<Workload[]> {
  const list = await kubectlJson<{ items: WorkloadJson[] }>(t, ['get', 'deployments,statefulsets,cronjobs', '-n', namespace], 60_000)
  return list.items.map(flatten)
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const dep = (image: string, replicas: number, env: EnvVar[], mem = '512Mi'): WorkloadJson => ({
    kind: 'Deployment', metadata: { name: 'api' },
    spec: { replicas, template: { spec: { containers: [{ name: 'app', image, env, resources: { limits: { memory: mem } }, readinessProbe: { httpGet: { path: '/health', port: 8080 } } }] } } },
  })
  const hml = flatten(dep('registry.exemplo.com:5000/time/api:2.3.0', 1, [{ name: 'LOG', value: 'debug' }, { name: 'DB_PASS', valueFrom: { secretKeyRef: { name: 'db', key: 'senha' } } }]))
  const pro = flatten(dep('registry.exemplo.com:5000/time/api:2.2.9', 3, [{ name: 'LOG', value: 'info' }, { name: 'DB_PASS', valueFrom: { secretKeyRef: { name: 'db', key: 'senha' } } }], '1Gi'))
  assert.equal(hml.fields['app.imagem'], 'registry.exemplo.com:5000/time/api', 'porta do registry não é tag')
  assert.equal(hml.fields['app.tag'], '2.3.0')
  assert.equal(hml.fields['app.env.DB_PASS'], 'secret db/senha', 'secret só como referência')
  assert.equal(flatten(dep('nginx', 1, [])).fields['app.tag'], 'latest')
  const plain = (v: string) => flatten(dep('x:1', 1, [{ name: 'spring.datasource.password', value: v }, { name: 'API_TOKEN', value: v }])).fields
  const p1 = plain('hunter2'), p2 = plain('hunter2'), p3 = plain('outra')
  assert.ok(!JSON.stringify(p1).includes('hunter2'), 'senha em texto puro nunca sai')
  assert.equal(p1['app.env.spring.datasource.password'], p2['app.env.spring.datasource.password'], 'mesma senha, mesma impressão')
  assert.notEqual(p1['app.env.spring.datasource.password'], p3['app.env.spring.datasource.password'], 'senha diferente aparece como diferença')
  assert.equal(flatten(dep('x:1', 1, [{ name: 'LOG_LEVEL', value: 'info' }])).fields['app.env.LOG_LEVEL'], 'info', 'variável comum continua visível')
  assert.match(hml.fields['app.readiness'], /^http \/health:8080/)

  const cron: WorkloadJson = { kind: 'CronJob', metadata: { name: 'limpeza' }, spec: { schedule: '0 3 * * *', jobTemplate: { spec: { template: { spec: { containers: [{ name: 'job', image: 'busybox:1.36' }] } } } } } }
  assert.equal(flatten(cron).fields['agenda'], '0 3 * * *')

  const result = compare([hml, flatten(cron)], [pro, { kind: 'Deployment', name: 'novo', fields: {} }])
  assert.deepEqual(result.map(r => [r.name, r.state]), [['api', 'diferente'], ['limpeza', 'só em A'], ['novo', 'só em B']])
  assert.deepEqual(result[0].diffs.map(d => d.field), ['app.env.LOG', 'app.limits.memory', 'app.tag', 'réplicas'])
  assert.equal(compare([hml], [hml])[0].state, 'igual')
  console.log('compare workloads selfcheck: ok')
}
