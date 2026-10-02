// Verificações agendadas: rodam enquanto o servidor está no ar, uma por vez, e avisam por notificação do
// desktop só quando o estado muda (ok → problema, problema → ok). Histórico em ~/.workstuff.
// Autoteste: node server/lib/schedules/scheduler.ts --selfcheck

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { which } from '../run.ts'
import { KINDS, runKind, validateParams, type Kind } from './kinds.ts'

export type LastState = 'ok' | 'problema' | 'erro' | null

export type Schedule = {
  id: string
  kind: Kind
  label: string
  params: Record<string, string>
  intervalMin: number
  enabled: boolean
  lastRun: string | null
  lastState: LastState
  lastSummary: string
}

export type Alert = { at: string; scheduleId: string; label: string; state: 'problema' | 'recuperado'; summary: string; notified: boolean }

const FILE = dataFile('schedules.json')
const ALERTS = dataFile('schedule-alerts.json')
const MAX_ALERTS = 200
export const MIN_INTERVAL = 5
export const MAX_SCHEDULES = 30

export const listSchedules = () => readJson<Schedule[]>(FILE, [])
export const listAlerts = () => readJson<Alert[]>(ALERTS, [])
const saveAll = (all: Schedule[]) => writeJson(FILE, all)

export async function createSchedule(body: Record<string, unknown>): Promise<Schedule> {
  const kind = body.kind as Kind
  if (!KINDS.includes(kind)) throw new Error(`tipo inválido: use ${KINDS.join(', ')}`)
  const intervalMin = Math.round(Number(body.intervalMin))
  if (!(intervalMin >= MIN_INTERVAL && intervalMin <= 1440)) throw new Error(`intervalo entre ${MIN_INTERVAL} e 1440 minutos`)
  const all = listSchedules()
  if (all.length >= MAX_SCHEDULES) throw new Error(`no máximo ${MAX_SCHEDULES} verificações`)
  const { params, label } = await validateParams(kind, (body.params ?? {}) as Record<string, unknown>)
  const s: Schedule = { id: randomUUID(), kind, label, params, intervalMin, enabled: true, lastRun: null, lastState: null, lastSummary: '' }
  saveAll([...all, s])
  return s
}

export function updateSchedule(id: string, patch: { enabled?: unknown }) {
  const all = listSchedules()
  const s = all.find(x => x.id === id)
  if (!s) throw new Error('verificação não encontrada')
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled
  saveAll(all)
  return s
}

export function deleteSchedule(id: string) {
  const all = listSchedules()
  if (!all.some(s => s.id === id)) throw new Error('verificação não encontrada')
  saveAll(all.filter(s => s.id !== id))
}

// Avisa na transição, não a cada rodada: problema contínuo vira um aviso só. Erro de coleta (rede, VPN)
// não muda o estado conhecido, para não alternar entre "problema" e "recuperado" a cada falha de rede.
export function transition(prev: LastState, next: 'ok' | 'problema' | 'erro'): Alert['state'] | null {
  if (next === 'erro') return null
  if (next === 'problema' && prev !== 'problema') return 'problema'
  if (next === 'ok' && prev === 'problema') return 'recuperado'
  return null
}

export const isDue = (s: Schedule, now: number) => s.enabled && (!s.lastRun || now - new Date(s.lastRun).getTime() >= s.intervalMin * 60_000)

// Notificação do sistema. Texto vai como argumento (Linux) ou escapado no AppleScript; no Windows não há
// notificação nativa sem módulo extra, e o aviso fica só no histórico.
export async function notify(title: string, body: string): Promise<boolean> {
  const launch = (bin: string, args: string[]) => new Promise<boolean>(resolve => {
    const p = spawn(bin, args, { stdio: 'ignore' })
    p.on('error', () => resolve(false))
    p.on('close', code => resolve(code === 0))
  })
  if (process.platform === 'linux') return (await which('notify-send')) ? launch('notify-send', ['--app-name=workStuff', title, body]) : false
  if (process.platform === 'darwin') {
    const q = (s: string) => `"${s.replace(/["\\]/g, '')}"`
    return launch('osascript', ['-e', `display notification ${q(body)} with title ${q(title)}`])
  }
  return false
}

export async function runSchedule(id: string): Promise<Schedule> {
  const s = listSchedules().find(x => x.id === id)
  if (!s) throw new Error('verificação não encontrada')
  let next: 'ok' | 'problema' | 'erro', summary: string
  try {
    const out = await runKind(s.kind, s.params)
    next = out.status
    summary = out.summary
  } catch (e) {
    next = 'erro'
    summary = (e as Error).message.split('\n')[0].slice(0, 200)
  }
  const change = transition(s.lastState, next)
  // Relê antes de gravar: a pessoa pode ter apagado ou pausado durante a coleta.
  const all = listSchedules()
  const current = all.find(x => x.id === id)
  if (!current) return s
  Object.assign(current, { lastRun: new Date().toISOString(), lastSummary: summary, ...(next !== 'erro' && { lastState: next }), ...(next === 'erro' && current.lastState === null && { lastState: 'erro' as const }) })
  saveAll(all)
  if (change) {
    const notified = await notify(change === 'problema' ? `workStuff: ${s.label}` : `workStuff: ${s.label} voltou ao normal`, summary)
    writeJson(ALERTS, [{ at: new Date().toISOString(), scheduleId: s.id, label: s.label, state: change, summary, notified }, ...listAlerts()].slice(0, MAX_ALERTS))
  }
  return current
}

let running = false

// Tick de um minuto: roda em sequência o que venceu. Coleta lenta (varredura, cluster longe) não
// empilha uma segunda rodada por cima da primeira.
export function startScheduler() {
  const tick = async () => {
    if (running) return
    running = true
    try {
      for (const s of listSchedules().filter(x => isDue(x, Date.now()))) await runSchedule(s.id)
    } catch (e) {
      console.error('[agenda] falhou:', (e as Error).message)
    } finally {
      running = false
    }
  }
  setInterval(tick, 60_000).unref()
  setTimeout(tick, 10_000).unref()
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.equal(transition(null, 'problema'), 'problema')
  assert.equal(transition('problema', 'problema'), null, 'problema contínuo avisa uma vez só')
  assert.equal(transition('problema', 'ok'), 'recuperado')
  assert.equal(transition('ok', 'ok'), null)
  assert.equal(transition('problema', 'erro'), null, 'falha de rede não vira recuperado')
  assert.equal(transition('erro', 'problema'), 'problema')

  const base: Schedule = { id: 'x', kind: 'certificado', label: 'l', params: {}, intervalMin: 10, enabled: true, lastRun: null, lastState: null, lastSummary: '' }
  const now = Date.parse('2026-10-02T12:00:00Z')
  assert.ok(isDue(base, now), 'nunca rodou')
  assert.ok(!isDue({ ...base, lastRun: '2026-10-02T11:55:00Z' }, now))
  assert.ok(isDue({ ...base, lastRun: '2026-10-02T11:50:00Z' }, now))
  assert.ok(!isDue({ ...base, enabled: false }, now), 'pausada não roda')
  console.log('schedules selfcheck: ok')
}
