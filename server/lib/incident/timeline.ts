// Linha do tempo de um incidente num namespace: eventos, restarts, rollouts e linhas de erro do log
// anterior dos pods que reiniciaram, numa ordem só. Só leitura.
// Autoteste: node server/lib/incident/timeline.ts --selfcheck

import assert from 'node:assert/strict'
import { mapLimit } from '../concurrency.ts'
import { kubectl, kubectlJson, type Target } from '../k8s/kubectl.ts'

export type Entry = {
  at: string
  source: 'evento' | 'restart' | 'rollout' | 'log'
  severity: 'info' | 'aviso' | 'crítico'
  object: string
  title: string
  detail: string
}

type EventJson = {
  type: string
  reason: string
  message: string
  count?: number
  lastTimestamp?: string | null
  eventTime?: string | null
  firstTimestamp?: string | null
  metadata: { creationTimestamp: string }
  involvedObject: { kind: string; name: string }
}

type Terminated = { reason?: string; exitCode?: number; finishedAt?: string; startedAt?: string }
type PodJson = {
  metadata: { name: string }
  status: { containerStatuses?: { name: string; restartCount: number; lastState?: { terminated?: Terminated } }[] }
}

type ReplicaSetJson = {
  metadata: { name: string; creationTimestamp: string; annotations?: Record<string, string>; ownerReferences?: { kind: string; name: string }[] }
  spec: { template: { spec: { containers: { name: string; image: string }[] } } }
}

const NOISE = /^(Scheduled|Pulled|Created|Started|SuccessfulCreate|SuccessfulDelete)$/

export function fromEvents(events: EventJson[], since: Date): Entry[] {
  return events.flatMap(e => {
    const at = e.lastTimestamp ?? e.eventTime ?? e.firstTimestamp ?? e.metadata.creationTimestamp
    if (new Date(at) < since) return []
    const warning = e.type === 'Warning'
    // Evento normal de rotina (agendou, baixou imagem) só polui: entra só o que é aviso ou mudança de escala.
    if (!warning && NOISE.test(e.reason)) return []
    const severity: Entry['severity'] = warning ? (/BackOff|OOM|Failed|Unhealthy|Evict|Kill/i.test(e.reason) ? 'crítico' : 'aviso') : 'info'
    return [{
      at, source: 'evento' as const, severity, object: `${e.involvedObject.kind}/${e.involvedObject.name}`,
      title: `${e.reason}${(e.count ?? 1) > 1 ? ` ×${e.count}` : ''}`, detail: e.message.slice(0, 500),
    }]
  })
}

export function fromPods(pods: PodJson[], since: Date): Entry[] {
  return pods.flatMap(p => (p.status.containerStatuses ?? []).flatMap(c => {
    const t = c.lastState?.terminated
    if (!t?.finishedAt || new Date(t.finishedAt) < since) return []
    const oom = t.reason === 'OOMKilled'
    return [{
      at: t.finishedAt, source: 'restart' as const, severity: (oom || (t.exitCode ?? 0) !== 0 ? 'crítico' : 'aviso') as Entry['severity'],
      object: `Pod/${p.metadata.name}`,
      title: `${c.name} terminou: ${t.reason ?? 'sem motivo'} (código ${t.exitCode ?? '?'})`,
      detail: `${c.restartCount} restart(s) no total${oom ? '; memória acima do limit' : ''}`,
    }]
  }))
}

// ReplicaSet novo = rollout: guarda a data, a revisão e a imagem que entrou.
export function fromReplicaSets(sets: ReplicaSetJson[], since: Date): Entry[] {
  return sets.flatMap(rs => {
    if (new Date(rs.metadata.creationTimestamp) < since) return []
    const owner = rs.metadata.ownerReferences?.find(o => o.kind === 'Deployment')?.name ?? rs.metadata.name
    const revision = rs.metadata.annotations?.['deployment.kubernetes.io/revision'] ?? '?'
    const images = rs.spec.template.spec.containers.map(c => `${c.name}=${c.image.split('/').pop()}`).join(', ')
    return [{ at: rs.metadata.creationTimestamp, source: 'rollout' as const, severity: 'info' as const, object: `Deployment/${owner}`, title: `rollout para a revisão ${revision}`, detail: images }]
  })
}

// "Exception" e "Error" grudados no nome da classe (NullPointerException, OutOfMemoryError) não têm
// fronteira de palavra antes: casam pelo sufixo.
const ERROR_LINE = /\b(ERROR|FATAL|SEVERE|panic|Caused by)\b|\w(Exception|Error)\b/

// Log anterior (--previous --timestamps) de quem reiniciou: as últimas linhas de erro antes de morrer.
export function errorLines(pod: string, container: string, log: string, since: Date, max = 5): Entry[] {
  return log.split('\n')
    .map(l => l.match(/^(\S+Z) (.*)$/))
    .filter((m): m is RegExpMatchArray => Boolean(m) && ERROR_LINE.test(m![2]) && new Date(m![1]) >= since)
    .slice(-max)
    .map(m => ({ at: m[1], source: 'log' as const, severity: 'crítico' as const, object: `Pod/${pod}`, title: `erro no log de ${container}`, detail: m[2].slice(0, 400) }))
}

const MAX_LOG_PODS = 6

export async function buildTimeline(t: Target, namespace: string, hours: number): Promise<{ entries: Entry[]; since: string; notes: string[] }> {
  const since = new Date(Date.now() - hours * 3_600_000)
  const notes: string[] = []
  const tolerant = async <T>(what: string, fn: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await fn()
    } catch (e) {
      notes.push(`${what}: ${(e as Error).message.split('\n')[0].slice(0, 160)}`)
      return []
    }
  }
  const [events, pods, sets] = await Promise.all([
    tolerant('eventos', async () => (await kubectlJson<{ items: EventJson[] }>(t, ['get', 'events', '-n', namespace], 60_000)).items),
    tolerant('pods', async () => (await kubectlJson<{ items: PodJson[] }>(t, ['get', 'pods', '-n', namespace], 60_000)).items),
    tolerant('replicasets', async () => (await kubectlJson<{ items: ReplicaSetJson[] }>(t, ['get', 'replicasets', '-n', namespace], 60_000)).items),
  ])
  const restarts = fromPods(pods, since)
  // Log anterior só dos pods que reiniciaram na janela, e no máximo seis: cada um é uma chamada.
  const restartedPods = [...new Map(restarts.map(r => [r.object, r])).values()]
  const targets = restartedPods.slice(0, MAX_LOG_PODS)
  if (restartedPods.length > targets.length) notes.push(`log anterior lido de ${MAX_LOG_PODS} dos ${restartedPods.length} pods que reiniciaram`)
  const logs = await mapLimit(targets, 3, async r => {
    const pod = r.object.slice(4)
    const container = r.title.split(' ')[0]
    // Falha ao ler o log entra nas notas: o post-mortem precisa saber que esse dado faltou.
    const log = await kubectl(t, ['logs', pod, '-n', namespace, '-c', container, '--previous', '--timestamps', '--tail=400'], 30_000)
      .catch(e => (notes.push(`log anterior de ${pod}: ${(e as Error).message.split('\n')[0].slice(0, 120)}`), ''))
    return errorLines(pod, container, log, since)
  })
  if (events.length && !fromEvents(events, since).length) notes.push('o cluster guarda eventos por pouco tempo (em geral 1 h): eventos mais antigos já sumiram')
  const entries = [...fromEvents(events, since), ...restarts, ...fromReplicaSets(sets, since), ...logs.flat()]
    .sort((a, b) => a.at.localeCompare(b.at))
  return { entries, since: since.toISOString(), notes }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const since = new Date('2026-10-01T10:00:00Z')
  const ev = (reason: string, type: string, at: string, count = 1): EventJson => ({
    type, reason, message: `msg ${reason}`, count, lastTimestamp: at, metadata: { creationTimestamp: at }, involvedObject: { kind: 'Pod', name: 'api-1' },
  })
  const events = fromEvents([
    ev('BackOff', 'Warning', '2026-10-01T10:05:00Z', 12),
    ev('Pulled', 'Normal', '2026-10-01T10:06:00Z'),
    ev('ScalingReplicaSet', 'Normal', '2026-10-01T10:01:00Z'),
    ev('Unhealthy', 'Warning', '2026-10-01T09:00:00Z'),
  ], since)
  assert.deepEqual(events.map(e => [e.title, e.severity]), [['BackOff ×12', 'crítico'], ['ScalingReplicaSet', 'info']])

  const restarts = fromPods([{ metadata: { name: 'api-1' }, status: { containerStatuses: [{ name: 'app', restartCount: 3, lastState: { terminated: { reason: 'OOMKilled', exitCode: 137, finishedAt: '2026-10-01T10:04:00Z' } } }] } }], since)
  assert.equal(restarts[0].severity, 'crítico')
  assert.match(restarts[0].title, /^app terminou: OOMKilled \(código 137\)/)

  const rollouts = fromReplicaSets([{
    metadata: { name: 'api-7d9f', creationTimestamp: '2026-10-01T10:00:30Z', annotations: { 'deployment.kubernetes.io/revision': '14' }, ownerReferences: [{ kind: 'Deployment', name: 'api' }] },
    spec: { template: { spec: { containers: [{ name: 'app', image: 'registry.x/time/api:2.3.1' }] } } },
  }], since)
  assert.deepEqual([rollouts[0].object, rollouts[0].title, rollouts[0].detail], ['Deployment/api', 'rollout para a revisão 14', 'app=api:2.3.1'])

  const log = [
    '2026-10-01T09:59:00.000000000Z ERROR antes da janela',
    '2026-10-01T10:03:00.000000000Z INFO tudo bem',
    '2026-10-01T10:03:30.000000000Z java.lang.OutOfMemoryError: Java heap space',
    '2026-10-01T10:03:30.500000000Z java.lang.IllegalStateException: pool esgotado',
    '2026-10-01T10:03:31.000000000Z ERROR c.x.Api - falhou ao processar',
  ].join('\n')
  assert.deepEqual(errorLines('api-1', 'app', log, since).map(e => e.detail), ['java.lang.OutOfMemoryError: Java heap space', 'java.lang.IllegalStateException: pool esgotado', 'ERROR c.x.Api - falhou ao processar'])
  console.log('incident timeline selfcheck: ok')
}
