// Uso ao vivo dos pods de uma stack, comparado com o que o manifest declara.
// Autoteste: node server/lib/resources/live.ts --selfcheck

import assert from 'node:assert/strict'
import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { podsIn, type Pod } from '../k8s/cluster.ts'
import { ClusterError } from '../k8s/errors.ts'
import { getKubeconfig } from '../k8s/kubeconfigs.ts'
import { say } from '../i18n.ts'

export type NamespaceLink = { kubeconfigId: string; context: string | null; namespace: string }
const FILE = dataFile('resources-namespace-links.json')

const readLinks = () => readJson<Record<string, NamespaceLink>>(FILE, {})

export const getLink = (projectId: number) => readLinks()[projectId] ?? null

export function setLink(projectId: number, link: NamespaceLink | null) {
  const links = readLinks()
  if (link) links[projectId] = link
  else delete links[projectId]
  writeJson(FILE, links)
}

export type Recommendation = { level: 'critical' | 'warn' | 'info' | 'ok'; badge: string; text: string }

// A heuristic over a snapshot, not a trend: the text says "right now" and never says to apply it.
export function recommend(memReqMi: number | null, memLimMi: number | null, usageMi: number | null): Recommendation | null {
  if (!memReqMi || !memLimMi) {
    return {
      level: 'warn',
      badge: say({ en: 'set', pt: 'definir' }),
      text: say({ en: 'Mem Req/Lim not declared in the manifest: set both before judging the sizing.', pt: 'Mem Req/Lim não declarados no manifest: defina os dois antes de avaliar o ajuste.' }),
    }
  }
  if (usageMi === null) return null
  const limPct = Math.round((usageMi / memLimMi) * 100)
  if (limPct > 85) {
    return {
      level: 'critical',
      badge: say({ en: '↑ limit', pt: '↑ limite' }),
      text: say({ en: `Usage right now at ${limPct}% of Mem Lim: consider raising the limit before it blows up (OOMKilled).`, pt: `Uso neste momento em ${limPct}% do Mem Lim: considere subir o limite antes que estoure (OOMKilled).` }),
    }
  }
  const reqPct = Math.round((usageMi / memReqMi) * 100)
  if (reqPct < 40) {
    return {
      level: 'info',
      badge: '↓ request',
      text: say({ en: `Usage right now is only ${reqPct}% of Mem Req: the request may be reserving more of the node than the service uses.`, pt: `Uso neste momento é só ${reqPct}% do Mem Req: o request pode estar reservando mais do nó do que o serviço usa.` }),
    }
  }
  return { level: 'ok', badge: 'ok', text: say({ en: 'Usage right now sits in a comfortable range between the declared Mem Req and Mem Lim.', pt: 'Uso neste momento está numa faixa confortável entre o Mem Req e o Mem Lim declarados.' }) }
}

// Nome do workload sem os sufixos de hash de ReplicaSet/Pod. Plano B quando o pod não tem workload resolvido.
export function podBaseName(name: string) {
  const parts = name.split('-')
  const hash = (s: string) => /^[a-z0-9]{4,10}$/.test(s) && /\d/.test(s) && /[a-z]/.test(s)
  if (parts.length <= 1 || /^\d+$/.test(parts.at(-1)!)) return name
  let end = parts.length
  if (hash(parts[end - 1])) end--
  if (end > 1 && hash(parts[end - 1])) end--
  return parts.slice(0, end).join('-') || name
}

export type LiveUsage = { usageMi: number | null; replicas: number; pods: string[] }

// Maior uso entre as réplicas: é a que chega primeiro ao limite.
export function groupByWorkload(pods: Pick<Pod, 'name' | 'memUsageMi' | 'workload'>[]): Record<string, LiveUsage> {
  const out: Record<string, LiveUsage> = {}
  for (const p of pods) {
    const key = p.workload?.name ?? podBaseName(p.name)
    const entry = (out[key] ??= { usageMi: null, replicas: 0, pods: [] })
    entry.replicas++
    entry.pods.push(p.name)
    if (p.memUsageMi !== null) entry.usageMi = Math.max(entry.usageMi ?? 0, p.memUsageMi)
  }
  return out
}

export async function liveUsage(projectId: number) {
  const link = getLink(projectId)
  if (!link) throw new ClusterError(say({ en: 'stack with no linked namespace', pt: 'stack sem namespace vinculado' }), 404)
  const kubeconfig = await getKubeconfig(link.kubeconfigId)
  if (!kubeconfig) throw new ClusterError(say({ en: `the kubeconfig ${link.kubeconfigId} no longer exists in ~/.kube; link again`, pt: `o kubeconfig ${link.kubeconfigId} não existe mais em ~/.kube; refaça o vínculo` }), 404)
  const context = link.context && kubeconfig.contexts.includes(link.context) ? link.context : kubeconfig.currentContext
  const result = await podsIn({ file: kubeconfig.file, context }, link.namespace)
  return { link, environment: kubeconfig.environment, metricsUnavailable: result.metricsUnavailable, byWorkload: groupByWorkload(result.pods), readAt: new Date().toISOString() }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  // By level: the badge text follows the language set in Configurações
  assert.equal(recommend(null, 1024, 500)?.level, 'warn')
  assert.equal(recommend(512, 1024, null), null)
  assert.equal(recommend(512, 1024, 900)?.level, 'critical')
  assert.equal(recommend(1024, 2048, 300)?.level, 'info')
  assert.equal(recommend(512, 1024, 600)?.level, 'ok')
  assert.equal(podBaseName('pedidos-service-bc9554bff-ws8k9'), 'pedidos-service')
  assert.equal(podBaseName('meu-statefulset-2'), 'meu-statefulset-2')
  assert.equal(podBaseName('portal'), 'portal')
  const g = groupByWorkload([
    { name: 'api-7d9f8b6c4-x2klm', memUsageMi: 700, workload: { kind: 'Deployment', name: 'api' } },
    { name: 'api-7d9f8b6c4-abcd1', memUsageMi: 900, workload: { kind: 'Deployment', name: 'api' } },
    { name: 'job-28715440-z9y8x', memUsageMi: null, workload: null },
  ])
  assert.deepEqual(g.api, { usageMi: 900, replicas: 2, pods: ['api-7d9f8b6c4-x2klm', 'api-7d9f8b6c4-abcd1'] })
  assert.equal(g['job-28715440']?.usageMi, null, 'sem workload: agrupa pelo nome sem o hash do pod')
  console.log('resources live selfcheck: ok')
}
