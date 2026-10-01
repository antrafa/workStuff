// Lê requests/limits, CPU e flags da JVM de um manifest de ambiente.
// Autoteste: node server/lib/resources/manifest.ts --selfcheck

import assert from 'node:assert/strict'

export type Resources = {
  memReq: string | null
  memLim: string | null
  cpuReq: string | null
  cpuLim: string | null
  xms: string | null
  xmx: string | null
  metaspace: string | null
  maxMetaspace: string | null
}

// Variáveis dos .env do repositório de ambiente, usadas nos manifests como ${NOME}.
export function parseEnvVars(content: string): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) vars[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2')
  }
  return vars
}

// "${X}" sozinho vira o valor ou null (variável ausente); texto misto substitui o que achar.
export function resolveVar(value: string, vars: Record<string, string>): string | null {
  const pure = value.match(/^\$\{([^}]+)\}$/)
  if (pure) return vars[pure[1]] ?? null
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => vars[name] ?? '') || null
}

const block = (text: string, key: string) => text.match(new RegExp(`\\b${key}:\\s*\\n((?:[ \\t]+[^\\n]*\\n?)+)`))?.[1] ?? null
const field = (text: string | null, key: string) => text?.match(new RegExp(`\\b${key}:\\s*"?([^\\s"'\\n,]+)"?`))?.[1] ?? null

export function parseResources(content: string): Resources {
  const res = block(content, 'resources')
  const requests = res && block(res, 'requests')
  const limits = res && block(res, 'limits')
  const r: Resources = {
    memReq: field(requests, 'memory'),
    memLim: field(limits, 'memory'),
    cpuReq: field(requests, 'cpu'),
    cpuLim: field(limits, 'cpu'),
    xms: null, xmx: null, metaspace: null, maxMetaspace: null,
  }

  // JAVA_OPTS na lista env do k8s (name/value) ou atribuído direto (JAVA_OPTS: "...").
  const javaOpts = content.match(/name:\s*JAVA_OPTS\s*\n\s*value:\s*"?([^\n"]+)"?/)?.[1]
    ?? content.match(/\bJAVA_OPTS\b[^:\n]*:\s*"?([^\n"]+)"?/)?.[1]
  if (javaOpts) {
    r.xms = javaOpts.match(/-Xms(\S+)/)?.[1] ?? null
    r.xmx = javaOpts.match(/-Xmx(\S+)/)?.[1] ?? null
    r.metaspace = javaOpts.match(/-XX:MetaspaceSize=(\S+)/)?.[1] ?? null
    r.maxMetaspace = javaOpts.match(/-XX:MaxMetaspaceSize=(\S+)/)?.[1] ?? null
  }
  // Alguns manifests declaram a JVM em variáveis próprias; elas prevalecem sobre JAVA_OPTS.
  const own = (key: string) => content.match(new RegExp(`\\b${key}:\\s*"?(\\S+?)"?\\s*$`, 'm'))?.[1]
  r.xms = own('XMS') ?? r.xms
  r.xmx = own('XMX') ?? r.xmx
  r.metaspace = own('METASPACE') ?? r.metaspace
  r.maxMetaspace = own('METASPACEMAX') ?? r.maxMetaspace
  return r
}

export function resolveResources(r: Resources, vars: Record<string, string>): Resources {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ? resolveVar(v, vars) : null])) as Resources
}

const MEM_UNIT: Record<string, number> = { '': 1, b: 1, k: 1024, ki: 1024, m: 1024 ** 2, mi: 1024 ** 2, g: 1024 ** 3, gi: 1024 ** 3 }

// Memória em MiB, aceitando o formato do k8s (512Mi, 1Gi) e o da JVM (768m, 2g). null se ausente ou ilegível.
export function memMi(value: string | null): number | null {
  const m = value?.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/)
  if (!m) return null
  const unit = MEM_UNIT[m[2].toLowerCase()]
  return unit === undefined ? null : Math.round((parseFloat(m[1]) * unit) / 1024 ** 2)
}

// CPU em milicores (250m, 1, 0.5).
export function cpuMillis(value: string | null): number | null {
  if (!value) return null
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return null
  return value.endsWith('m') ? n : n * 1000
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const k8s = `
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: pedidos-api
          env:
            - name: JAVA_OPTS
              value: "-Xms256m -Xmx768m -XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=256m"
          resources:
            requests:
              memory: "512Mi"
              cpu: 250m
            limits:
              memory: \${SGP_API_MEM_LIMIT}
              cpu: "1"
`
  const r = parseResources(k8s)
  assert.deepEqual(r, { memReq: '512Mi', memLim: '${SGP_API_MEM_LIMIT}', cpuReq: '250m', cpuLim: '1', xms: '256m', xmx: '768m', metaspace: '128m', maxMetaspace: '256m' })
  const vars = parseEnvVars('SGP_API_MEM_LIMIT="1Gi"\n# comentário\nOUTRA=x\n')
  assert.equal(resolveResources(r, vars).memLim, '1Gi')
  assert.equal(resolveVar('${NAO_EXISTE}', vars), null)
  assert.equal(resolveVar('prefixo-${OUTRA}', vars), 'prefixo-x')

  const own = parseResources('JAVA_OPTS: "-Xmx1g"\nXMX: 2g\nMETASPACEMAX: "512m"\n')
  assert.equal(own.xmx, '2g', 'XMX próprio prevalece sobre JAVA_OPTS')
  assert.equal(own.maxMetaspace, '512m')
  assert.deepEqual(Object.values(parseResources('kind: ConfigMap\ndata:\n  a: b\n')).filter(Boolean), [])

  assert.equal(memMi('512Mi'), 512)
  assert.equal(memMi('1Gi'), 1024)
  assert.equal(memMi('768m'), 768)
  assert.equal(memMi('2g'), 2048)
  assert.equal(memMi(null), null)
  assert.equal(memMi('abc'), null)
  assert.equal(cpuMillis('250m'), 250)
  assert.equal(cpuMillis('1'), 1000)
  assert.equal(cpuMillis('0.5'), 500)
  console.log('resources manifest selfcheck: ok')
}
