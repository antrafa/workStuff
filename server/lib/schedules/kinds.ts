// Tipos de verificação agendada. Cada um valida os próprios parâmetros e devolve ok/problema com um
// resumo curto. Tudo é leitura: reaproveita Pipelines, TLS do Upgrade, saúde de pod e Vulnerabilidades.

import { resolveProject } from '../analysis/store.ts'
import { checkName } from '../k8s/cluster.ts'
import { podHealth, type PodStatus } from '../k8s/health.ts'
import { getKubeconfig } from '../k8s/kubeconfigs.ts'
import { kubectlJson } from '../k8s/kubectl.ts'
import { recentPipelines } from '../pipelines/ci.ts'
import { connFor, getWatch } from '../pipelines/watch.ts'
import { getSource } from '../repos/sources.ts'
import { tlsCertificate } from '../upgrade/certs.ts'
import { scanProject } from '../vulns/scan.ts'

export type Kind = 'pipeline' | 'certificado' | 'pods' | 'vulnerabilidades'
export const KINDS: Kind[] = ['pipeline', 'certificado', 'pods', 'vulnerabilidades']

export type Outcome = { status: 'ok' | 'problema'; summary: string }

const HOST = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i

// Parâmetros vindos da tela, normalizados. O que é guardado é só o que cada tipo usa.
export async function validateParams(kind: Kind, raw: Record<string, unknown>): Promise<{ params: Record<string, string>; label: string }> {
  if (kind === 'pipeline') {
    const w = getWatch(String(raw.watchId ?? ''))
    return { params: { watchId: w.id }, label: `pipeline de ${w.fullPath}` }
  }
  if (kind === 'certificado') {
    const host = String(raw.host ?? '').trim().toLowerCase()
    if (!HOST.test(host)) throw new Error('host inválido (ex.: app.exemplo.com)')
    return { params: { host }, label: `certificado de ${host}` }
  }
  if (kind === 'pods') {
    const k = await getKubeconfig(String(raw.kubeconfigId ?? ''))
    if (!k) throw new Error('kubeconfig não encontrado')
    const context = typeof raw.context === 'string' && raw.context ? raw.context : k.currentContext
    if (!k.contexts.includes(context)) throw new Error(`contexto ${context} não existe neste kubeconfig`)
    const namespace = checkName('namespace', raw.namespace)
    return { params: { kubeconfigId: k.id, context, namespace }, label: `pods de ${namespace} (${context})` }
  }
  const path = resolveProject(raw.path)
  return { params: { path }, label: `vulnerabilidades de ${path.split(/[\\/]/).pop()}` }
}

export async function runKind(kind: Kind, p: Record<string, string>): Promise<Outcome> {
  if (kind === 'pipeline') {
    const w = getWatch(p.watchId)
    const [latest] = await recentPipelines(await connFor(getSource(w.sourceId)), w.fullPath, 1)
    if (!latest) return { status: 'ok', summary: 'nenhuma pipeline ainda' }
    return latest.status === 'failed'
      ? { status: 'problema', summary: `pipeline ${latest.ref} falhou` }
      : { status: 'ok', summary: `última pipeline (${latest.ref}): ${latest.status}` }
  }
  if (kind === 'certificado') {
    const c = await tlsCertificate(p.host)
    if (c.state === 'inacessível' || c.state === 'sem-certificado') throw new Error(c.detail)
    return c.state === 'ok'
      ? { status: 'ok', summary: `vence em ${c.daysLeft} dias` }
      : { status: 'problema', summary: c.state === 'vencido' ? `venceu há ${-(c.daysLeft ?? 0)} dias` : `vence em ${c.daysLeft} dias` }
  }
  if (kind === 'pods') {
    const k = await getKubeconfig(p.kubeconfigId)
    if (!k) throw new Error('kubeconfig removido')
    const pods = await kubectlJson<{ items: { metadata: { name: string }; status: PodStatus }[] }>({ file: k.file, context: p.context }, ['get', 'pods', '-n', p.namespace], 60_000)
    const bad = pods.items.filter(x => podHealth(x.status).level === 'critical').map(x => x.metadata.name)
    return bad.length
      ? { status: 'problema', summary: `${bad.length} pod(s) com problema: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}` }
      : { status: 'ok', summary: `${pods.items.length} pods sem problema crítico` }
  }
  const r = await scanProject(p.path)
  const serious = r.bySeverity.crítica + r.bySeverity.alta
  return serious
    ? { status: 'problema', summary: `${r.bySeverity.crítica} crítica(s) e ${r.bySeverity.alta} alta(s) nas dependências` }
    : { status: 'ok', summary: `${r.dependencies.length} dependências sem falha crítica ou alta` }
}
