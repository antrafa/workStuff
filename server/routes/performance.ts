import { Router, type Request, type Response } from 'express'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAi } from '../lib/ai/runner.ts'
import { openSse } from '../lib/sse.ts'
import { KubeError } from '../lib/k8s/kubectl.ts'
import { fetchHistory, listNamespaces, listPods } from '../lib/performance/cluster.ts'
import { aggregateSamples, buildReportPrompt, cleanKubeMessage, sanitizeReport, type Target } from '../lib/performance/metrics.ts'
import {
  deleteObservation, getObservation, listObservations, readSamples, resolveTarget, resumeObservation, resumeRunning, startObservation, stopObservation, subscribe,
} from '../lib/performance/poller.ts'
import { deleteReport, getReport, listReports, saveReport } from '../lib/performance/reports.ts'
import { say } from '../lib/i18n.ts'

export const performanceRouter = Router()

void resumeRunning()

class BadRequest extends Error {}



// A validation or cluster error becomes a response with its message; the rest goes to the general handler.
const handle = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json((await fn(req)) ?? { ok: true })
  } catch (e) {
    if (e instanceof BadRequest) res.status(400).json({ error: e.message })
    else if (e instanceof KubeError) {
      const msg = cleanKubeMessage(e.message)
      res.status(e.kind === 'forbidden' ? 403 : 502).json({ error: e.kind === 'forbidden' ? say({ en: `this user's RBAC does not allow this read: ${msg}`, pt: `o RBAC deste usuário não permite essa leitura: ${msg}` }) : msg })
    }
    else throw e
  }
}

const NAME = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/
const name = (label: string, v: unknown) => {
  if (typeof v !== 'string' || !NAME.test(v)) throw new BadRequest(`${label} inválido`)
  return v
}
const str = (label: string, v: unknown) => {
  if (typeof v !== 'string' || !v) throw new BadRequest(`informe ${label}`)
  return v
}

async function targetOf(req: Request) {
  try {
    return await resolveTarget(str('o kubeconfig', req.query.kubeconfigId), str('o contexto', req.query.context))
  } catch (e) {
    throw new BadRequest((e as Error).message)
  }
}

// Namespaces and pods of the kubeconfig chosen on this screen (independent of the Cluster session).
performanceRouter.get('/namespaces', handle(async req => {
  try {
    return { namespaces: await listNamespaces(await targetOf(req)), limitedRbac: false }
  } catch (e) {
    // A Rancher user often cannot list namespaces: the screen asks to type one.
    if (e instanceof KubeError && e.kind === 'forbidden') return { namespaces: [], limitedRbac: true }
    throw e
  }
}))
performanceRouter.get('/pods', handle(async req => ({ pods: await listPods(await targetOf(req), name('namespace', req.query.namespace)) })))

performanceRouter.get('/observations', handle(() => ({ observations: listObservations() })))

performanceRouter.post('/observations', handle(async req => {
  const b = req.body ?? {}
  if (!Array.isArray(b.targets)) throw new BadRequest(say({ en: 'select at least one pod', pt: 'selecione ao menos um pod' }))
  const targets: Target[] = b.targets.map((t: { pod?: unknown; containers?: unknown }) => ({
    pod: name('pod', t.pod),
    containers: Array.isArray(t.containers) ? t.containers.map((c: unknown) => name('container', c)) : [],
  }))
  try {
    return await startObservation({ kubeconfigId: str('o kubeconfig', b.kubeconfigId), context: str('o contexto', b.context), namespace: name('namespace', b.namespace), targets, intervalSeconds: Number(b.intervalSeconds) })
  } catch (e) {
    throw new BadRequest((e as Error).message)
  }
}))

const existing = (req: Request) => {
  const meta = getObservation(String(req.params.id))
  if (!meta) throw new BadRequest(say({ en: 'observation not found', pt: 'observação não encontrada' }))
  return meta
}

performanceRouter.post('/observations/:id/stop', handle(req => stopObservation(existing(req).id)))
performanceRouter.post('/observations/:id/resume', handle(async req => {
  try {
    return await resumeObservation(existing(req).id)
  } catch (e) {
    throw new BadRequest((e as Error).message)
  }
}))
performanceRouter.delete('/observations/:id', handle(req => deleteObservation(existing(req).id)))

// Samples already stored, all at once (backlog), then the new ones while collection is active.
performanceRouter.get('/observations/:id/stream', (req, res) => {
  const meta = getObservation(String(req.params.id))
  if (!meta) {
    res.status(404).json({ error: say({ en: 'observation not found', pt: 'observação não encontrada' }) })
    return
  }
  const sse = openSse(res)
  sse.send({ type: 'backlog', samples: readSamples(meta.id) })
  const unsubscribe = subscribe(meta.id, sse.send)
  if (!unsubscribe) {
    sse.send({ type: 'stopped', status: meta.status, failure: meta.failure })
    sse.end()
    return
  }
  sse.signal.addEventListener('abort', unsubscribe, { once: true })
})

// History before the start, rebuilt from Prometheus: slow degradation shows up over hours.
performanceRouter.get('/observations/:id/history', handle(async req => {
  const meta = existing(req)
  const hours = Math.min(72, Math.max(1, Number(req.query.hours) || 24))
  const toMs = Date.now()
  // ~300 points per series are enough for the chart; more only bloats the response.
  const stepSec = Math.max(60, Math.round((hours * 3600) / 300 / 60) * 60)
  const samples = await fetchHistory(await resolveTarget(meta.kubeconfigId, meta.context), meta.namespace, meta.targets.map(t => t.pod), toMs - hours * 3600_000, toMs, stepSec)
  if (!samples) throw new BadRequest(say({ en: 'no Prometheus in this cluster: there is no history to rebuild', pt: 'sem Prometheus neste cluster: não há histórico para reconstruir' }))
  return { samples, hours, stepSec }
}))

performanceRouter.post('/observations/:id/report', async (req, res) => {
  let meta
  try {
    meta = existing(req)
  } catch (e) {
    res.status(404).json({ error: (e as Error).message })
    return
  }
  const from = typeof req.body?.from === 'string' ? req.body.from : meta.startedAt
  const to = typeof req.body?.to === 'string' ? req.body.to : meta.stoppedAt ?? new Date().toISOString()
  const historyHours = Math.min(72, Math.max(0, Number(req.body?.historyHours) || 0))
  const sse = openSse(res)
  const cwd = mkdtempSync(join(tmpdir(), 'perf-report-'))
  try {
    let samples = readSamples(meta.id, { from, to })
    if (historyHours) {
      const toMs = Date.now()
      const history = await fetchHistory(await resolveTarget(meta.kubeconfigId, meta.context), meta.namespace, meta.targets.map(t => t.pod), toMs - historyHours * 3600_000, toMs, 300).catch(e => {
        sse.send({ type: 'status', message: say({ en: 'history unavailable: ', pt: 'histórico indisponível: ' }) + cleanKubeMessage((e as Error).message) })
        return null
      })
      if (history?.length) samples = [...history.filter(h => !samples.length || h.t < samples[0].t), ...samples]
    }
    if (!samples.length) throw new Error(say({ en: 'no samples in the selected period', pt: 'sem amostras no período selecionado' }))
    sse.send({ type: 'status', message: say({ en: `${samples.length} samples aggregated in 5-min blocks`, pt: `${samples.length} amostras agregadas em blocos de 5 min` }) })
    const prompt = buildReportPrompt({ namespace: meta.namespace, targets: meta.targets, from, to, buckets: aggregateSamples(samples) })
    const result = await runAi({ prompt, cwd, signal: sse.signal, onEvent: sse.send, timeoutMs: 5 * 60_000 })
    if (result.stopped) throw new Error(say({ en: 'generation stopped', pt: 'geração interrompida' }))
    const report = saveReport(meta, sanitizeReport(result.text), { from, to, historyHours, provider: result.provider, model: result.model })
    sse.send({ type: 'done', report })
  } catch (e) {
    sse.send({ type: 'error', message: (e as Error).message })
  } finally {
    rmSync(cwd, { recursive: true, force: true })
    sse.end()
  }
})

performanceRouter.get('/reports', handle(() => ({ reports: listReports() })))
performanceRouter.get('/reports/:id', handle(req => {
  const r = getReport(String(req.params.id))
  if (!r) throw new BadRequest(say({ en: 'report not found', pt: 'relatório não encontrado' }))
  return r
}))
performanceRouter.delete('/reports/:id', handle(req => {
  if (!deleteReport(String(req.params.id))) throw new BadRequest(say({ en: 'report not found', pt: 'relatório não encontrado' }))
}))
