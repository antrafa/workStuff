// Logs de vários pods ao mesmo tempo, por seletor de label (estilo stern): kubectl logs -l ... --prefix.
// Autoteste: node server/lib/k8s/multilogs.ts --selfcheck

import assert from 'node:assert/strict'

// Teto do kubectl para conexões simultâneas: acima disso ele recusa. 30 pods cobrem um deployment grande.
export const MAX_PODS = 30

// Seletor de label: chaves, valores, =, ==, !=, vírgula e "in (...)". Nada que vire opção do kubectl.
const SELECTOR = /^[A-Za-z0-9][A-Za-z0-9._/=!, ()-]{0,199}$/

export function validSelector(s: string) {
  return SELECTOR.test(s) && !/\s-/.test(s)
}

export type MultiLogOptions = { namespace: string; selector: string; container: string | null; tail: number; sinceSeconds: number | null }

export function multiLogArgs(o: MultiLogOptions): string[] {
  return [
    'logs', '-n', o.namespace, '-l', o.selector, '--prefix', '-f', `--max-log-requests=${MAX_PODS}`,
    `--tail=${o.tail}`,
    ...(o.sinceSeconds ? [`--since=${o.sinceSeconds}s`] : []),
    ...(o.container ? ['-c', o.container] : []),
    '--ignore-errors',
  ]
}

// O --prefix escreve "[pod/<nome>/<container>] linha".
export function parsePrefixed(line: string): { pod: string; container: string; text: string } | null {
  const m = line.match(/^\[pod\/([^/\]]+)\/([^\]]+)\] ?(.*)$/)
  return m ? { pod: m[1], container: m[2], text: m[3] } : null
}

const APP_LABELS = ['app.kubernetes.io/name', 'app', 'k8s-app']

// Um seletor por aplicação: a primeira label de app conhecida de cada pod, contada.
export function selectorSuggestions(podLabels: Record<string, string>[]): { selector: string; pods: number }[] {
  const counts = new Map<string, number>()
  for (const labels of podLabels) {
    const key = APP_LABELS.find(k => labels[k])
    if (key) counts.set(`${key}=${labels[key]}`, (counts.get(`${key}=${labels[key]}`) ?? 0) + 1)
  }
  return [...counts].map(([selector, pods]) => ({ selector, pods })).sort((a, b) => a.selector.localeCompare(b.selector))
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.deepEqual(selectorSuggestions([{ app: 'api' }, { app: 'api', 'pod-template-hash': 'x' }, { 'app.kubernetes.io/name': 'web', app: 'outro' }, {}]),
    [{ selector: 'app.kubernetes.io/name=web', pods: 1 }, { selector: 'app=api', pods: 2 }])
  for (const ok of ['app=api', 'app.kubernetes.io/name=api,tier!=db', 'env in (hml, pro)', 'app']) assert.ok(validSelector(ok), ok)
  for (const bad of ['--all-namespaces', '-A', 'app=api --kubeconfig=/x', 'app=$(id)', 'a;b', '']) assert.ok(!validSelector(bad), bad)

  const args = multiLogArgs({ namespace: 'loja', selector: 'app=api', container: null, tail: 100, sinceSeconds: 600 })
  assert.deepEqual(args.slice(0, 5), ['logs', '-n', 'loja', '-l', 'app=api'])
  assert.ok(args.includes('--prefix') && args.includes('-f') && args.includes('--since=600s') && !args.includes('-c'))
  assert.ok(multiLogArgs({ namespace: 'x', selector: 'a=b', container: 'app', tail: 10, sinceSeconds: null }).join(' ').endsWith('-c app --ignore-errors'))

  assert.deepEqual(parsePrefixed('[pod/api-7d9f-abc12/app] GET /health 200'), { pod: 'api-7d9f-abc12', container: 'app', text: 'GET /health 200' })
  assert.deepEqual(parsePrefixed('[pod/api-1/istio-proxy] '), { pod: 'api-1', container: 'istio-proxy', text: '' })
  assert.equal(parsePrefixed('linha sem prefixo'), null)
  console.log('multilogs selfcheck: ok')
}
