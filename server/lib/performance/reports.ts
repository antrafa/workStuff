import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readJson, writeJson } from '../jsonFile.ts'
import { PERF_DIR, type ObservationMeta } from './poller.ts'

const REPORTS_DIR = join(PERF_DIR, 'reports')
const INDEX = join(PERF_DIR, 'reports.json')
mkdirSync(REPORTS_DIR, { recursive: true })

export type ReportMeta = { id: string; observationId: string; namespace: string; pods: number; from: string; to: string; historyHours: number; generatedAt: string; provider: string; model: string }

const readIndex = () => readJson<Record<string, ReportMeta>>(INDEX, {})
const file = (id: string) => join(REPORTS_DIR, `${id}.md`)
const ID = /^[0-9a-f-]{36}$/

export const listReports = () => Object.values(readIndex()).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))

export function saveReport(meta: ObservationMeta, text: string, info: { from: string; to: string; historyHours: number; provider: string; model: string }): ReportMeta {
  const report: ReportMeta = { id: randomUUID(), observationId: meta.id, namespace: meta.namespace, pods: meta.targets.length, generatedAt: new Date().toISOString(), ...info }
  writeFileSync(file(report.id), text)
  writeJson(INDEX, { ...readIndex(), [report.id]: report })
  return report
}

export function getReport(id: string) {
  const meta = ID.test(id) ? readIndex()[id] : undefined
  if (!meta || !existsSync(file(id))) return null
  return { ...meta, report: readFileSync(file(id), 'utf-8') }
}

export function deleteReport(id: string) {
  if (!ID.test(id)) return false
  const all = readIndex()
  if (!all[id]) return false
  delete all[id]
  writeJson(INDEX, all)
  if (existsSync(file(id))) unlinkSync(file(id))
  return true
}
