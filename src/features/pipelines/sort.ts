import type { Job, Status, Watch } from './api.ts'

export type SortKey = 'project' | 'status' | 'ref' | 'when' | 'duration'
export type Sort = { key: SortKey; desc: boolean }
// 'stage' is the order the pipeline runs the jobs in, the order they arrive in.
export type JobSortKey = 'name' | 'stage' | 'status' | 'duration'
export type JobSort = { key: JobSortKey; desc: boolean }

type Value = string | number | null

// Sorting by status puts first what needs attention.
const STATUS_RANK: Record<Status, number> = { failed: 0, running: 1, pending: 2, manual: 3, canceled: 4, skipped: 5, success: 6, unknown: 7 }

export const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

// The column's value to sort by; null (no pipeline) always goes last, in both directions.
function sortValue(w: Watch, key: SortKey): Value {
  if (key === 'project') return w.fullPath
  if (key === 'status') return w.error ? -1 : w.latest ? STATUS_RANK[w.latest.status] : null
  const p = w.latest
  if (!p) return null
  if (key === 'ref') return p.ref
  // Negative so the first click brings the most recent to the top.
  if (key === 'when') return -new Date(p.createdAt).getTime()
  return p.durationSec
}

// null always goes last; a tie returns 0 so the caller breaks it.
function compareValues(va: Value, vb: Value, desc: boolean) {
  if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1
  const diff = typeof va === 'number' && typeof vb === 'number' ? va - vb : byName(String(va), String(vb))
  return desc ? -diff : diff
}

export function compareWatches({ key, desc }: Sort) {
  return (a: Watch, b: Watch) => compareValues(sortValue(a, key), sortValue(b, key), desc) || byName(a.fullPath, b.fullPath)
}

export function sortJobs(jobs: Job[], { key, desc }: JobSort): Job[] {
  const value = (j: Job, i: number): Value =>
    key === 'name' ? j.name : key === 'stage' ? i : key === 'status' ? STATUS_RANK[j.status] : j.durationSec
  return jobs
    .map((job, i) => ({ job, i, v: value(job, i) }))
    .sort((a, b) => compareValues(a.v, b.v, desc) || a.i - b.i)
    .map(x => x.job)
}
