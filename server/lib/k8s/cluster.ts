import { dataFile } from '../paths.ts'
import { ClusterError } from './errors.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { podHealth, type Health, type PodStatus } from './health.ts'
import { getKubeconfig, type Kubeconfig } from './kubeconfigs.ts'
import { KubeError, configView, kubectl, kubectlJson, kubectlRaw, type Target } from './kubectl.ts'
import { authorizeMutation } from './policy.ts'
import { cpuMillis, memBytes, toGi, toMi } from './units.ts'

// Sessão = kubeconfig + contexto ativos. Um só por vez, persistido: reabrir o painel volta onde estava.
type Session = { kubeconfigId: string; context: string }
const SESSION_FILE = dataFile('cluster-session.json')

export { ClusterError }

export async function activeSession(): Promise<{ kubeconfig: Kubeconfig; context: string; target: Target } | null> {
  const s = readJson<Session | null>(SESSION_FILE, null)
  if (!s) return null
  const kubeconfig = await getKubeconfig(s.kubeconfigId)
  if (!kubeconfig) return null
  const context = kubeconfig.contexts.includes(s.context) ? s.context : kubeconfig.currentContext
  return { kubeconfig, context, target: { file: kubeconfig.file, context } }
}

export async function requireSession() {
  const s = await activeSession()
  if (!s) throw new ClusterError('nenhum cluster conectado: escolha um kubeconfig', 409)
  return s
}

export async function connect(kubeconfigId: string, context?: string) {
  const kubeconfig = await getKubeconfig(kubeconfigId)
  if (!kubeconfig) throw new ClusterError('kubeconfig não encontrado', 404)
  if (context && !kubeconfig.contexts.includes(context)) throw new ClusterError(`contexto ${context} não existe neste kubeconfig`)
  writeJson(SESSION_FILE, { kubeconfigId, context: context ?? kubeconfig.currentContext })
  return activeSession()
}

export const disconnect = () => writeJson(SESSION_FILE, null)

// Erro do kubectl vira mensagem para a tela; o tipo ajuda a tela a oferecer a saída certa.
export function explain(e: unknown): never {
  if (e instanceof KubeError) {
    const hint = {
      forbidden: 'o RBAC deste usuário não permite essa leitura',
      unauthorized: 'o token do kubeconfig foi recusado (expirado ou revogado)',
      unreachable: 'o cluster não respondeu; confira VPN e rede',
      notfound: 'recurso não encontrado',
      other: 'o kubectl falhou',
    }[e.kind]
    throw new ClusterError(`${hint}: ${e.message.split('\n')[0].slice(0, 300)}`, e.kind === 'notfound' ? 404 : 502)
  }
  throw e
}

type K8sList<T> = { items: T[] }
type Owner = { kind: string; name: string; controller?: boolean }
type Container = { name: string; image: string; resources?: { requests?: Record<string, string>; limits?: Record<string, string> } }
type PodJson = {
  metadata: { name: string; namespace: string; labels?: Record<string, string>; ownerReferences?: Owner[]; creationTimestamp: string }
  spec: { nodeName?: string; containers: Container[] }
  status: PodStatus & { podIP?: string; startTime?: string; containerStatuses?: (NonNullable<PodStatus['containerStatuses']>[number] & { imageID?: string })[] }
}
type ReplicaSetJson = { metadata: { name: string; namespace: string; ownerReferences?: Owner[] } }
type PodMetricsJson = { metadata: { name: string; namespace: string }; containers: { name: string; usage: { cpu: string; memory: string } }[] }

export type Pod = {
  name: string
  namespace: string
  status: string
  nodeName: string
  podIP: string
  containers: string[]
  imageTag: string | null
  memRequestMi: number
  memLimitMi: number
  memUsageMi: number | null
  cpuUsageM: number | null
  startTime: string
  restartCount: number
  readyContainers: string
  workload: { kind: string; name: string } | null
  health: Health
}

// Tag = o que vem depois do último ":" no último segmento do caminho (porta de registry não é tag).
export function imageTag(image: string): string | null {
  const last = image.split('@')[0].split('/').pop() ?? ''
  const i = last.lastIndexOf(':')
  return i > 0 ? last.slice(i + 1) : null
}

function workloadOf(pod: PodJson, replicaSets: Map<string, ReplicaSetJson>) {
  const owner = pod.metadata.ownerReferences?.find(o => o.controller) ?? pod.metadata.ownerReferences?.[0]
  if (!owner) return null
  if (owner.kind === 'ReplicaSet') {
    const rs = replicaSets.get(`${pod.metadata.namespace}/${owner.name}`)
    const dep = rs?.metadata.ownerReferences?.find(o => o.kind === 'Deployment')
    return dep ? { kind: 'Deployment', name: dep.name } : null
  }
  return owner.kind === 'StatefulSet' || owner.kind === 'DaemonSet' ? { kind: owner.kind, name: owner.name } : null
}

const sum = (cs: Container[], field: 'requests' | 'limits', key: 'memory' | 'cpu', parse: (v: string) => number) =>
  cs.reduce((acc, c) => acc + parse(c.resources?.[field]?.[key] ?? '0'), 0)

export async function listPods(namespace?: string) {
  const { target } = await requireSession()
  return podsIn(target, namespace)
}

// Pods de um alvo qualquer (kubeconfig + contexto), sem depender da sessão ativa do Cluster.
export async function podsIn(target: Target, namespace?: string) {
  const scope = namespace ? ['-n', namespace] : ['-A']
  try {
    const [pods, rs, metrics] = await Promise.all([
      kubectlJson<K8sList<PodJson>>(target, ['get', 'pods', ...scope]),
      kubectlJson<K8sList<ReplicaSetJson>>(target, ['get', 'replicasets', ...scope]).catch(() => ({ items: [] })),
      kubectlRaw<K8sList<PodMetricsJson>>(target, namespace ? `/apis/metrics.k8s.io/v1beta1/namespaces/${encodeURIComponent(namespace)}/pods` : '/apis/metrics.k8s.io/v1beta1/pods').catch(() => null),
    ])
    const rsIndex = new Map(rs.items.map(r => [`${r.metadata.namespace}/${r.metadata.name}`, r]))
    const usage = new Map(metrics?.items.map(m => [`${m.metadata.namespace}/${m.metadata.name}`, m.containers]) ?? [])

    const items: Pod[] = pods.items.map(p => {
      const statuses = p.status.containerStatuses ?? []
      const u = usage.get(`${p.metadata.namespace}/${p.metadata.name}`)
      return {
        name: p.metadata.name,
        namespace: p.metadata.namespace,
        // Motivo de espera do container diz mais que a phase (CrashLoopBackOff em vez de Running).
        status: statuses.find(s => s.state?.waiting?.reason)?.state?.waiting?.reason ?? p.status.phase ?? 'Unknown',
        nodeName: p.spec.nodeName ?? '',
        podIP: p.status.podIP ?? '',
        containers: p.spec.containers.map(c => c.name),
        imageTag: imageTag(p.spec.containers[0]?.image ?? ''),
        memRequestMi: toMi(sum(p.spec.containers, 'requests', 'memory', memBytes)),
        memLimitMi: toMi(sum(p.spec.containers, 'limits', 'memory', memBytes)),
        memUsageMi: u ? toMi(u.reduce((a, c) => a + memBytes(c.usage.memory), 0)) : null,
        cpuUsageM: u ? Math.round(u.reduce((a, c) => a + cpuMillis(c.usage.cpu), 0)) : null,
        startTime: p.status.startTime ?? p.metadata.creationTimestamp,
        restartCount: statuses.reduce((a, s) => a + (s.restartCount ?? 0), 0),
        readyContainers: `${statuses.filter(s => s.ready).length}/${p.spec.containers.length}`,
        workload: workloadOf(p, rsIndex),
        health: podHealth(p.status),
      }
    })
    return { pods: items, metricsUnavailable: metrics === null }
  } catch (e) {
    if (e instanceof KubeError && e.kind === 'forbidden' && !namespace) {
      throw new ClusterError('o RBAC não permite listar pods de todos os namespaces: escolha um namespace', 403)
    }
    explain(e)
  }
}

export async function listNamespaces() {
  const { target, kubeconfig, context } = await requireSession()
  try {
    const list = await kubectlJson<K8sList<{ metadata: { name: string } }>>(target, ['get', 'namespaces'])
    return { namespaces: list.items.map(n => n.metadata.name).sort(), limitedRbac: false }
  } catch (e) {
    // ponytail: sem fallback via API do Rancher; com RBAC limitado o usuário digita o namespace.
    if (e instanceof KubeError && e.kind === 'forbidden') {
      const ns = await configView(kubeconfig.file).then(v => v.contexts?.find(c => c.name === context)?.context.namespace).catch(() => undefined)
      return { namespaces: ns ? [ns] : [], limitedRbac: true }
    }
    explain(e)
  }
}

type NodeJson = {
  metadata: { name: string }
  status: {
    capacity: Record<string, string>
    allocatable?: Record<string, string>
    conditions: { type: string; status: string }[]
    nodeInfo: { kubeletVersion: string }
    addresses: { type: string; address: string }[]
  }
}

export async function listNodes() {
  const { target } = await requireSession()
  try {
    const [nodes, metrics, pods] = await Promise.all([
      kubectlJson<K8sList<NodeJson>>(target, ['get', 'nodes']),
      kubectlRaw<K8sList<{ metadata: { name: string }; usage: { cpu: string; memory: string } }>>(target, '/apis/metrics.k8s.io/v1beta1/nodes').catch(() => null),
      kubectlJson<K8sList<PodJson>>(target, ['get', 'pods', '-A', '--field-selector=status.phase=Running']).catch(() => null),
    ])
    const usage = new Map(metrics?.items.map(m => [m.metadata.name, m.usage]) ?? [])
    return {
      metricsUnavailable: metrics === null,
      nodes: nodes.items.map(n => {
        const onNode = pods?.items.filter(p => p.spec.nodeName === n.metadata.name) ?? []
        const u = usage.get(n.metadata.name)
        return {
          name: n.metadata.name,
          status: n.status.conditions.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
          kubeletVersion: n.status.nodeInfo.kubeletVersion,
          internalIP: n.status.addresses.find(a => a.type === 'InternalIP')?.address ?? '',
          cpuCapacity: cpuMillis(n.status.capacity.cpu) / 1000,
          memCapacityGi: toGi(memBytes(n.status.capacity.memory)),
          // Em uso (métricas) quando há metrics-server; reservado (soma dos requests) sempre que dá para ler os pods.
          cpuUsage: u ? Math.round(cpuMillis(u.cpu) / 100) / 10 : null,
          memUsageGi: u ? toGi(memBytes(u.memory)) : null,
          cpuRequested: Math.round(onNode.reduce((a, p) => a + sum(p.spec.containers, 'requests', 'cpu', cpuMillis), 0) / 100) / 10,
          memRequestedGi: toGi(onNode.reduce((a, p) => a + sum(p.spec.containers, 'requests', 'memory', memBytes), 0)),
          pressures: n.status.conditions.filter(c => c.type.endsWith('Pressure') && c.status === 'True').map(c => c.type),
        }
      }),
    }
  } catch (e) {
    if (e instanceof KubeError && e.kind === 'forbidden') return { nodes: [], metricsUnavailable: true, limitedRbac: true }
    explain(e)
  }
}

const NAME = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/

export function checkName(kind: string, v: unknown): string {
  if (typeof v !== 'string' || !NAME.test(v)) throw new ClusterError(`${kind} inválido`)
  return v
}

export async function podEvents(namespace: string, pod: string) {
  const { target } = await requireSession()
  try {
    const list = await kubectlJson<K8sList<{ type: string; reason: string; message: string; count?: number; lastTimestamp?: string; eventTime?: string; metadata: { creationTimestamp: string } }>>(
      target, ['get', 'events', '-n', namespace, `--field-selector=involvedObject.name=${pod}`],
    )
    return list.items
      .map(e => ({ type: e.type, reason: e.reason, message: e.message, count: e.count ?? 1, at: e.lastTimestamp ?? e.eventTime ?? e.metadata.creationTimestamp }))
      .sort((a, b) => b.at.localeCompare(a.at))
  } catch (e) {
    explain(e)
  }
}

export async function podDetail(namespace: string, pod: string) {
  const { target } = await requireSession()
  try {
    const p = await kubectlJson<PodJson & { spec: { containers: (Container & { envFrom?: { configMapRef?: { name: string } }[]; env?: { valueFrom?: { configMapKeyRef?: { name: string } } }[] })[]; volumes?: { configMap?: { name: string } }[] } }>(
      target, ['get', 'pod', pod, '-n', namespace],
    )
    const statuses = p.status.containerStatuses ?? []
    const cmNames = new Set<string>()
    for (const c of p.spec.containers) {
      c.envFrom?.forEach(e => e.configMapRef && cmNames.add(e.configMapRef.name))
      c.env?.forEach(e => e.valueFrom?.configMapKeyRef && cmNames.add(e.valueFrom.configMapKeyRef.name))
    }
    p.spec.volumes?.forEach(v => v.configMap && cmNames.add(v.configMap.name))
    const configMaps = await Promise.all(
      [...cmNames].map(name =>
        kubectlJson<{ data?: Record<string, string> }>(target, ['get', 'configmap', name, '-n', namespace])
          .then(cm => ({ name, data: cm.data ?? {} }))
          .catch(() => ({ name, data: {} as Record<string, string>, error: 'sem permissão ou não encontrado' })),
      ),
    )
    return {
      labels: p.metadata.labels ?? {},
      images: p.spec.containers.map(c => ({ container: c.name, image: c.image, resolvedImage: statuses.find(s => s.name === c.name)?.imageID ?? null })),
      configMaps,
    }
  } catch (e) {
    explain(e)
  }
}

// Única escrita no cluster. A política por ambiente é conferida aqui, não só na tela, e o workload é
// descoberto a partir do pod no próprio servidor: a tela só diz qual pod.
export async function restartWorkload(namespace: string, pod: string) {
  const { target, kubeconfig } = await requireSession()
  const decision = authorizeMutation(kubeconfig.environment, 'restart')
  if (!decision.allowed) throw new ClusterError(decision.reason, 403)

  let workload: { kind: string; name: string } | null
  try {
    const p = await kubectlJson<PodJson>(target, ['get', 'pod', pod, '-n', namespace])
    const owner = p.metadata.ownerReferences?.find(o => o.controller)
    const rs = owner?.kind === 'ReplicaSet' ? await kubectlJson<ReplicaSetJson>(target, ['get', 'replicaset', owner.name, '-n', namespace]) : null
    workload = workloadOf(p, new Map(rs ? [[`${namespace}/${rs.metadata.name}`, rs]] : []))
  } catch (e) {
    explain(e)
  }
  if (!workload) throw new ClusterError('o pod não pertence a um Deployment, StatefulSet ou DaemonSet; não há o que reiniciar', 422)

  const resource = `${workload.kind.toLowerCase()}/${workload.name}`
  try {
    await kubectl(target, ['rollout', 'restart', resource, '-n', namespace])
  } catch (e) {
    explain(e)
  }
  console.log(`[cluster] rollout restart ${resource} -n ${namespace} em ${kubeconfig.id} (${kubeconfig.environment})`)
  return { ok: true, workload: `${workload.kind}/${workload.name}`, namespace, environment: kubeconfig.environment }
}

// Últimas linhas de log para o diagnóstico com IA (sem follow).
export async function recentLogs(namespace: string, pod: string, container?: string, lines = 150) {
  const { target } = await requireSession()
  try {
    return await kubectl(target, ['logs', pod, '-n', namespace, `--tail=${lines}`, ...(container ? ['-c', container] : ['--all-containers=true', '--prefix=true'])])
  } catch (e) {
    if (e instanceof KubeError) return `(não foi possível ler os logs: ${e.message.split('\n')[0]})`
    throw e
  }
}
