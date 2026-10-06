// Pod health from its status.
// Autoteste: node server/lib/k8s/health.ts --selfcheck
import assert from 'node:assert/strict'
import { say } from '../i18n.ts'

export type HealthLevel = 'ok' | 'warning' | 'critical'
export type Health = { level: HealthLevel; reasons: string[] }

const CRITICAL_WAITING = new Set(['CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'CreateContainerConfigError', 'CreateContainerError', 'InvalidImageName'])
const RANK: Record<HealthLevel, number> = { ok: 0, warning: 1, critical: 2 }

type ContainerStatus = {
  name: string
  imageID?: string
  ready?: boolean
  restartCount?: number
  state?: { waiting?: { reason?: string; message?: string } }
  lastState?: { terminated?: { reason?: string } }
}
export type PodStatus = { phase?: string; reason?: string; conditions?: { type: string; status: string }[]; containerStatuses?: ContainerStatus[] }

export function podHealth(status: PodStatus): Health {
  let level: HealthLevel = 'ok'
  const reasons: string[] = []
  const raise = (to: HealthLevel, reason?: string) => {
    if (RANK[to] > RANK[level]) level = to
    if (reason) reasons.push(reason)
  }

  if (status.phase === 'Failed') raise('critical', say({ en: `pod in phase Failed`, pt: `pod em phase Failed` }) + (status.reason ? ` (${status.reason})` : ''))
  if (status.phase === 'Pending') raise('warning', say({ en: 'pod in Pending', pt: 'pod em Pending' }))
  const running = status.phase === 'Running'
  if (running && status.conditions?.find(c => c.type === 'Ready')?.status !== 'True') raise('warning')

  for (const c of status.containerStatuses ?? []) {
    const restarts = c.restartCount ?? 0
    if (restarts > 0) {
      const last = c.lastState?.terminated?.reason
      raise(restarts >= 3 ? 'critical' : 'warning', say({
        en: `${c.name} restarted ${restarts}x${last ? ` (last reason: ${last})` : ''}`,
        pt: `${c.name} reiniciou ${restarts}x${last ? ` (último motivo: ${last})` : ''}`,
      }))
    }
    const waiting = c.state?.waiting?.reason
    if (waiting) raise(CRITICAL_WAITING.has(waiting) ? 'critical' : 'warning', `${c.name}: ${waiting}${c.state?.waiting?.message ? ` (${c.state.waiting.message.slice(0, 160)})` : ''}`)
    else if (running && c.ready === false) raise('warning', say({ en: `${c.name} is not ready`, pt: `${c.name} não está pronto` }))
  }
  return { level, reasons }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const ready = [{ type: 'Ready', status: 'True' }]
  assert.deepEqual(podHealth({ phase: 'Running', conditions: ready, containerStatuses: [{ name: 'a', ready: true, restartCount: 0 }] }), { level: 'ok', reasons: [] })
  const crash = podHealth({ phase: 'Running', conditions: [{ type: 'Ready', status: 'False' }], containerStatuses: [{ name: 'api', ready: false, restartCount: 14, state: { waiting: { reason: 'CrashLoopBackOff' } }, lastState: { terminated: { reason: 'Error' } } }] })
  assert.equal(crash.level, 'critical')
  // Language-neutral: the reasons follow the language in settings.json
  assert.equal(crash.reasons.length, 2)
  assert.match(crash.reasons[0], /^api .*14x .*Error\)$/)
  assert.equal(crash.reasons[1], 'api: CrashLoopBackOff')
  assert.equal(podHealth({ phase: 'Running', conditions: ready, containerStatuses: [{ name: 'a', ready: true, restartCount: 2 }] }).level, 'warning')
  assert.equal(podHealth({ phase: 'Pending' }).level, 'warning')
  assert.match(podHealth({ phase: 'Failed', reason: 'Evicted' }).reasons[0], /^pod .*Failed \(Evicted\)$/)
  assert.equal(podHealth({ phase: 'Running', conditions: ready, containerStatuses: [{ name: 'a', state: { waiting: { reason: 'ContainerCreating' } } }] }).level, 'warning')
  console.log('k8s health selfcheck: ok')
}
