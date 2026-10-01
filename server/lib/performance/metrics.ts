// Lógica pura da Performance: PromQL, parsing das métricas do Envoy (Istio), agregação das amostras
// e prompt do relatório.
// Autoteste: node server/lib/performance/metrics.ts --selfcheck

import assert from 'node:assert/strict'

export type Target = { pod: string; containers: string[] }

export type PodSample = {
  pod: string
  container: string
  cpuMilli: number | null
  cpuLimitMilli: number | null
  memBytes: number | null
  memLimitBytes: number | null
  restartCount: number
  lastTerminatedReason: string | null
  throttlePct: number | null
}

export type MeshWindow = {
  workload: string
  requests: number
  errors: number
  rps: number | null
  avgMs: number | null
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
}

export type Sample = { t: string; pods: PodSample[]; events: { pod: string; reason: string; message: string; t: string }[]; mesh: MeshWindow[] | null; backfilled?: boolean }

// O kubectl às vezes antecede o erro real com linhas de log interno (klog: "E0930 12:00:00 ... memcache.go").
export function cleanKubeMessage(msg: string, max = 300) {
  return (msg.split('\n').filter(l => l.trim() && !/^[EWI]\d{4} /.test(l)).join(' ') || msg).slice(0, max)
}

// ── Prometheus ────────────────────────────────────────────────────────────────

// Nome do pod -> prefixo do workload: o histórico precisa pegar as encarnações anteriores do mesmo
// serviço (OOM, redeploy), não só o pod de agora.
export function workloadPrefix(podName: string) {
  const rs = podName.match(/^(.+)-[a-z0-9]{7,10}-[a-z0-9]{5}$/)
  if (rs) return rs[1]
  const sts = podName.match(/^(.+)-\d+$/)
  return sts ? sts[1] : podName
}

const escapeRegex = (s: string) => s.replace(/[.\\+*?()|[\]{}^$]/g, '\\$&')
// Valor de label em PromQL vai entre aspas: aspas e barras do valor precisam de escape.
const escapeLabel = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

export function podSelector(namespace: string, pods: string[]) {
  const alternation = [...new Set(pods.map(workloadPrefix))].map(escapeRegex).join('|')
  return `namespace="${escapeLabel(namespace)}",pod=~"(${alternation})-.*",container!="",container!="POD",container!="istio-proxy"`
}

export const SERIES = {
  cpuMilli: (sel: string, w: string) => `rate(container_cpu_usage_seconds_total{${sel}}[${w}]) * 1000`,
  memBytes: (sel: string) => `container_memory_working_set_bytes{${sel}}`,
  restartCount: (sel: string) => `kube_pod_container_status_restarts_total{${sel}}`,
  // % dos períodos do CFS em que o kernel segurou o container: o que a média de uso esconde.
  throttlePct: (sel: string, w: string) => `100 * rate(container_cpu_cfs_throttled_periods_total{${sel}}[${w}]) / clamp_min(rate(container_cpu_cfs_periods_total{${sel}}[${w}]), 0.001)`,
}

// Limites do kube-state-metrics: no histórico o pod daquele momento pode nem existir mais. Esse
// exportador não separa POD/istio-proxy como o cAdvisor, então vai sem esses filtros.
export const LIMIT_SERIES = {
  cpuLimitMilli: (sel: string) => `kube_pod_container_resource_limits{${sel.replace(',container!="POD",container!="istio-proxy"', '')},resource="cpu"} * 1000`,
  memLimitBytes: (sel: string) => `kube_pod_container_resource_limits{${sel.replace(',container!="POD",container!="istio-proxy"', '')},resource="memory"}`,
}

type PromSeries = { metric: Record<string, string>; values?: [number, string][]; value?: [number, string] }

// Junta as séries de range query no mesmo formato das amostras ao vivo (o gráfico não distingue).
export function historyToSamples(results: Record<string, PromSeries[]>): Sample[] {
  const byTime = new Map<number, Map<string, PodSample>>()
  for (const [field, list] of Object.entries(results)) {
    for (const serie of list) {
      const key = `${serie.metric.pod}/${serie.metric.container}`
      for (const [ts, raw] of serie.values ?? []) {
        const value = Number(raw)
        if (!Number.isFinite(value)) continue
        const at = ts * 1000
        if (!byTime.has(at)) byTime.set(at, new Map())
        const slot = byTime.get(at)!
        if (!slot.has(key)) {
          slot.set(key, { pod: serie.metric.pod, container: serie.metric.container, cpuMilli: null, cpuLimitMilli: null, memBytes: null, memLimitBytes: null, restartCount: 0, lastTerminatedReason: null, throttlePct: null })
        }
        ;(slot.get(key) as Record<string, unknown>)[field] = value
      }
    }
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([at, slot]) => ({ t: new Date(at).toISOString(), pods: [...slot.values()], events: [], mesh: null, backfilled: true }))
}

// ── Istio (Envoy do ingressgateway) ───────────────────────────────────────────

type MeshAcc = { buckets: Map<number, number>; count: number; sum: number; errors: number }
export type MeshSnapshot = Map<string, MeshAcc>

function labelValue(line: string, name: string) {
  const key = `${name}="`
  const at = line.indexOf(key)
  if (at === -1) return null
  const from = at + key.length
  const to = line.indexOf('"', from)
  return to === -1 ? null : line.slice(from, to)
}

// Percentil sobre histograma cumulativo, com a interpolação linear do histogram_quantile.
export function percentile(buckets: [number, number][], count: number, q: number): number | null {
  if (!count) return null
  const target = q * count
  let prevLe = 0
  let prevCount = 0
  for (const [le, cumulative] of buckets) {
    if (cumulative >= target) {
      if (!Number.isFinite(le)) return prevLe || null
      const span = cumulative - prevCount
      return span <= 0 ? le : prevLe + (le - prevLe) * ((target - prevCount) / span)
    }
    prevLe = le
    prevCount = cumulative
  }
  return null
}

// Agrega UMA linha do /stats/prometheus: a resposta tem ~30 MB e nunca vira uma string só.
export function accumulateLine(acc: MeshSnapshot, line: string, namespace: string, wanted: Set<string> | null = null) {
  if (!line.startsWith('istio_request_duration_milliseconds')) return
  if (labelValue(line, 'destination_workload_namespace') !== namespace) return
  if (labelValue(line, 'reporter') !== 'source') return
  const workload = labelValue(line, 'destination_canonical_service')
  if (!workload || (wanted && !wanted.has(workload))) return
  const value = Number(line.slice(line.lastIndexOf(' ') + 1))
  if (!Number.isFinite(value)) return

  let a = acc.get(workload)
  if (!a) acc.set(workload, (a = { buckets: new Map(), count: 0, sum: 0, errors: 0 }))
  if (line.startsWith('istio_request_duration_milliseconds_bucket')) {
    const le = labelValue(line, 'le')
    if (le == null) return
    const bound = le === '+Inf' ? Infinity : Number(le)
    a.buckets.set(bound, (a.buckets.get(bound) ?? 0) + value)
  } else if (line.startsWith('istio_request_duration_milliseconds_count')) {
    a.count += value
    // response_code 0 é conexão que morreu sem resposta: falha, junto com 5xx.
    const code = Number(labelValue(line, 'response_code'))
    if (code === 0 || code >= 500) a.errors += value
  } else if (line.startsWith('istio_request_duration_milliseconds_sum')) {
    a.sum += value
  }
}

// Os contadores do Envoy são cumulativos desde que o gateway subiu: a janela é a diferença.
export function meshDiff(current: MeshSnapshot, previous: MeshSnapshot, windowMs: number): MeshWindow[] {
  const out: MeshWindow[] = []
  for (const [workload, now] of current) {
    const before = previous.get(workload)
    if (!before) continue
    const requests = now.count - before.count
    if (requests < 0) continue // gateway reiniciou e zerou: descarta a janela
    const buckets = [...now.buckets.keys()].sort((a, b) => a - b).map(le => [le, (now.buckets.get(le) ?? 0) - (before.buckets.get(le) ?? 0)] as [number, number])
    out.push({
      workload,
      requests,
      errors: Math.max(0, now.errors - before.errors),
      rps: windowMs > 0 ? requests / (windowMs / 1000) : null,
      avgMs: requests > 0 ? (now.sum - before.sum) / requests : null,
      p50Ms: percentile(buckets, requests, 0.5),
      p95Ms: percentile(buckets, requests, 0.95),
      p99Ms: percentile(buckets, requests, 0.99),
    })
  }
  return out.sort((a, b) => b.requests - a.requests)
}

// ── Relatório ─────────────────────────────────────────────────────────────────

const BUCKET_MINUTES = 5
type Stat = { min: number; avg: number; max: number } | null
const stat = (xs: number[]): Stat => (xs.length ? { min: Math.min(...xs), avg: xs.reduce((a, b) => a + b, 0) / xs.length, max: Math.max(...xs) } : null)

function bucketKey(iso: string) {
  const d = new Date(iso)
  d.setSeconds(0, 0)
  d.setMinutes(Math.floor(d.getMinutes() / BUCKET_MINUTES) * BUCKET_MINUTES)
  return d.toISOString()
}

// Reduz as amostras a blocos de 5 min (min/média/máx por pod+container): sem isso o prompt cresce
// linear com a duração da observação.
export function aggregateSamples(samples: Sample[]) {
  type Series = { cpuPct: number[]; memPct: number[]; memMiB: number[]; throttlePct: number[]; restartDelta: number; lastTerminatedReason: string | null }
  const buckets = new Map<string, { t: string; series: Map<string, Series>; mesh: Map<string, { requests: number; errors: number; p95: number[] }>; events: Sample['events'] }>()
  const lastRestart = new Map<string, number>()
  for (const s of samples) {
    const key = bucketKey(s.t)
    if (!buckets.has(key)) buckets.set(key, { t: key, series: new Map(), mesh: new Map(), events: [] })
    const b = buckets.get(key)!
    for (const m of s.mesh ?? []) {
      if (!b.mesh.has(m.workload)) b.mesh.set(m.workload, { requests: 0, errors: 0, p95: [] })
      const w = b.mesh.get(m.workload)!
      w.requests += m.requests
      w.errors += m.errors
      if (m.p95Ms != null) w.p95.push(m.p95Ms)
    }
    for (const p of s.pods) {
      const k = `${p.pod}/${p.container}`
      if (!b.series.has(k)) b.series.set(k, { cpuPct: [], memPct: [], memMiB: [], throttlePct: [], restartDelta: 0, lastTerminatedReason: null })
      const x = b.series.get(k)!
      if (p.cpuMilli != null && p.cpuLimitMilli) x.cpuPct.push((p.cpuMilli / p.cpuLimitMilli) * 100)
      if (p.memBytes != null && p.memLimitBytes) x.memPct.push((p.memBytes / p.memLimitBytes) * 100)
      if (p.memBytes != null) x.memMiB.push(p.memBytes / 1048576)
      if (p.throttlePct != null) x.throttlePct.push(p.throttlePct)
      x.restartDelta += Math.max(0, p.restartCount - (lastRestart.get(k) ?? p.restartCount))
      lastRestart.set(k, p.restartCount)
      if (p.lastTerminatedReason) x.lastTerminatedReason = p.lastTerminatedReason
    }
    b.events.push(...s.events)
  }
  return [...buckets.values()].map(b => ({
    t: b.t,
    series: [...b.series.entries()].map(([key, s]) => ({ key, cpuPct: stat(s.cpuPct), memPct: stat(s.memPct), memMiB: stat(s.memMiB), throttlePct: stat(s.throttlePct), restartDelta: s.restartDelta, lastTerminatedReason: s.lastTerminatedReason })),
    mesh: [...b.mesh.entries()].map(([workload, w]) => ({ workload, requests: w.requests, errors: w.errors, p95Ms: stat(w.p95) })),
    events: b.events,
  }))
}

export function buildReportPrompt(o: { namespace: string; targets: Target[]; from: string; to: string; buckets: ReturnType<typeof aggregateSamples> }) {
  const targetList = o.targets.map(t => `${t.pod} (${t.containers.join(', ') || 'todos containers'})`).join('; ')
  return [
    'Você é um SRE analisando o uso de recursos de pods Kubernetes ao longo do tempo.',
    `Namespace: ${o.namespace}. Pods observados: ${targetList}.`,
    `Período: ${o.from} até ${o.to}.`,
    'Os dados abaixo são agregados em blocos de 5 minutos: cpuPct/memPct são % do limite do container (min/avg/max), memMiB é a memória absoluta, restartDelta é quantos restarts aconteceram no bloco, e events lista eventos do Kubernetes no bloco.',
    'throttlePct é a fração dos períodos do CFS em que o kernel segurou o container por bater na quota de CPU. É independente do uso médio: um container pode marcar 2% de CPU e ainda assim ser estrangulado em 60% dos períodos, porque a quota é por janela de 100ms e trabalho em rajada (GC, por exemplo) bate no teto sem levantar a média. Acima de ~5% já se sente; se aparecer junto com memPct alta, a leitura provável é heap cheio forçando GC constante e o GC ficando sem CPU pra rodar.',
    'Compare memMiB entre blocos: subida monotônica ao longo de horas, com carga estável, é vazamento; subida acompanhando o volume de requisições é carga. Se a série cobrir várias encarnações do mesmo pod (nomes diferentes), cada reinício zerando a memória e voltando a subir é o padrão serrote de vazamento.',
    'O bloco `mesh` traz, por serviço, o que o istio-ingressgateway mediu: requests, errors (5xx e conexão cortada) e p95Ms. Pode vir vazio (cluster sem Istio, ou serviço só chamado internamente). Latência alta com CPU e memória folgados aponta para dependência externa (banco, integração) ou lock na aplicação, não para falta de recurso.',
    'Gere um relatório em markdown, em português, começando com o heading "# Relatório de performance". Estruture em:',
    '1. Resumo executivo: o serviço aguenta o volume esperado, e por quê.',
    '2. Horários com sinal de degradação e a causa mais provável (CPU perto de 100% do limite = throttling; memPct perto de 100% = risco de OOM; restartDelta > 0 = crash loop; evento OOMKilled = confirma OOM; p95Ms subindo ou errors > 0 = degradação sentida por quem chama).',
    '3. Horários sem anomalia: se houve lentidão num horário em que recurso e p95 estavam normais, diga explicitamente que a causa está mais fundo (chamada entre serviços, banco, integração) e precisaria de instrumentação ou trace distribuído.',
    '4. Recomendação objetiva de request/limit para qualquer container que passou perto do limite com frequência.',
    'Não execute comandos nem leia arquivos: tudo o que você precisa está nos dados abaixo.',
    'Dados agregados (JSON):',
    '```json',
    JSON.stringify(o.buckets),
    '```',
  ].join('\n')
}

// Desembrulha um code fence que engloba o relatório inteiro e corta preâmbulo antes do heading.
export function sanitizeReport(text: string) {
  const fenced = text.trim().match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/)
  const unwrapped = fenced ? fenced[1] : text
  const trimmed = unwrapped.trimStart()
  if (trimmed.startsWith('#')) return trimmed
  const heading = trimmed.match(/#{1,3}\s+\S/)
  if (!heading || heading.index === undefined || heading.index > 300) return unwrapped
  return trimmed.slice(heading.index)
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.equal(workloadPrefix('estoque-service-65948ff695-wk4tn'), 'estoque-service')
  assert.equal(workloadPrefix('postgres-superset-0'), 'postgres-superset', 'StatefulSet')
  assert.equal(workloadPrefix('app-server-legacy'), 'app-server-legacy', 'pod sem sufixo fica inteiro')
  const sel = podSelector('loja-prd', ['estoque-service-65948ff695-wk4tn', 'estoque-service-64b557784-tf44w', 'pedidos-service-6f8b5bcf4b-wv4md'])
  assert.match(sel, /pod=~"\(estoque-service\|pedidos-service\)-\.\*"/)
  assert.match(sel, /container!="istio-proxy"/)
  assert.ok(podSelector('ns', ['app.web-abc1234567-x1y2z']).includes('app\\.web'), 'ponto precisa de escape')
  assert.ok(podSelector('a"b', ['x-0']).startsWith('namespace="a\\"b"'), 'aspas no label escapadas')
  assert.ok(!LIMIT_SERIES.memLimitBytes(sel).includes('istio-proxy'), 'limite sem filtro de sidecar')

  const hist = historyToSamples({
    memBytes: [{ metric: { pod: 'p-0', container: 'c' }, values: [[100, '1048576'], [160, '2097152']] }],
    cpuMilli: [{ metric: { pod: 'p-0', container: 'c' }, values: [[100, '12.5'], [160, 'NaN']] }],
  })
  assert.equal(hist.length, 2)
  assert.deepEqual([hist[0].pods[0].memBytes, hist[0].pods[0].cpuMilli, hist[1].pods[0].cpuMilli], [1048576, 12.5, null])
  assert.equal(hist[0].backfilled, true)

  const line = (m: string, extra: string, v: number) =>
    `istio_request_duration_milliseconds_${m}{reporter="source",destination_canonical_service="api-backend",destination_workload_namespace="loja-hml",${extra}} ${v}`
  const acc: MeshSnapshot = new Map()
  for (const [le, n] of [['0.5', 0], ['5', 40], ['10', 80], ['25', 100], ['+Inf', 100]] as const) accumulateLine(acc, line('bucket', `response_code="200",le="${le}"`, n), 'loja-hml')
  accumulateLine(acc, line('count', 'response_code="200"', 90), 'loja-hml')
  accumulateLine(acc, line('count', 'response_code="503"', 8), 'loja-hml')
  accumulateLine(acc, line('count', 'response_code="0"', 2), 'loja-hml')
  accumulateLine(acc, line('sum', 'response_code="200"', 700), 'loja-hml')
  accumulateLine(acc, line('count', 'response_code="200"', 999).replace('loja-hml"', 'outro"'), 'loja-hml')
  accumulateLine(acc, line('count', 'response_code="200"', 999).replace('source', 'destination'), 'loja-hml')
  const got = acc.get('api-backend')!
  assert.equal(acc.size, 1)
  assert.deepEqual([got.count, got.errors, got.sum], [100, 10, 700])
  const buckets = [...got.buckets.entries()].sort((a, b) => a[0] - b[0])
  assert.equal(percentile(buckets, 100, 0.5), 6.25)
  assert.equal(percentile(buckets, 100, 0.99), 24.25)
  assert.equal(percentile(buckets, 0, 0.5), null)
  const empty = () => new Map<number, number>()
  assert.deepEqual(meshDiff(new Map([['w', { buckets: empty(), count: 10, sum: 100, errors: 0 }]]), new Map([['w', { buckets: empty(), count: 500, sum: 5000, errors: 0 }]]), 30000), [], 'reset do gateway')
  const [w] = meshDiff(new Map([['w', { buckets: empty(), count: 100, sum: 1000, errors: 3 }]]), new Map([['w', { buckets: empty(), count: 40, sum: 400, errors: 1 }]]), 30000)
  assert.deepEqual([w.requests, w.errors, w.rps, w.avgMs], [60, 2, 2, 10])

  const pod = (t: string, mem: number, restarts: number): Sample => ({ t, pods: [{ pod: 'p', container: 'c', cpuMilli: 50, cpuLimitMilli: 100, memBytes: mem, memLimitBytes: 4 * 1048576, restartCount: restarts, lastTerminatedReason: null, throttlePct: null }], events: [], mesh: null })
  const agg = aggregateSamples([pod('2026-09-30T10:01:00Z', 1048576, 2), pod('2026-09-30T10:03:00Z', 2 * 1048576, 3), pod('2026-09-30T10:06:00Z', 1048576, 3)])
  assert.equal(agg.length, 2, 'blocos de 5 min')
  assert.deepEqual(agg[0].series[0].memMiB, { min: 1, avg: 1.5, max: 2 })
  assert.deepEqual([agg[0].series[0].restartDelta, agg[1].series[0].restartDelta], [1, 0])
  assert.equal(agg[0].series[0].cpuPct?.avg, 50)

  assert.equal(sanitizeReport('```markdown\n# Relatório\nx\n```'), '# Relatório\nx')
  assert.equal(sanitizeReport('Claro, segue:\n\n# Relatório de performance\nx'), '# Relatório de performance\nx')
  assert.equal(cleanKubeMessage('E0930 17:39:28 memcache.go:265] ruído\nError from server (Forbidden): x'), 'Error from server (Forbidden): x')
  assert.equal(cleanKubeMessage('só texto'), 'só texto')
  console.log('performance metrics selfcheck: ok')
}
