// Self-check of the Pipelines table order: node scripts/check-pipelines-sort.ts
import assert from 'node:assert/strict'
import type { Job, Watch } from '../src/features/pipelines/api.ts'
import { compareWatches, sortJobs, type Sort } from '../src/features/pipelines/sort.ts'

const watch = (fullPath: string, latest: Partial<NonNullable<Watch['latest']>> | null, error: string | null = null) =>
  ({ id: fullPath, sourceId: 's', fullPath, sourceLabel: null, error, latest: latest && { id: '1', status: 'success', ref: 'main', sha: 'x', title: '', webUrl: '', createdAt: '2026-01-01T00:00:00Z', durationSec: 60, ...latest } }) as Watch
const list = [
  watch('g/ok', { status: 'success', createdAt: '2026-01-02T00:00:00Z', durationSec: 30 }),
  watch('g/none', null),
  watch('g/broken', null, 'boom'),
  watch('g/fail', { status: 'failed', createdAt: '2026-01-01T00:00:00Z', durationSec: 90 }),
  watch('g/run', { status: 'running', createdAt: '2026-01-03T00:00:00Z', durationSec: null }),
]
const order = (sort: Sort) => [...list].sort(compareWatches(sort)).map(w => w.fullPath.slice(2))

assert.deepEqual(order({ key: 'status', desc: false }), ['broken', 'fail', 'run', 'ok', 'none'])
assert.deepEqual(order({ key: 'status', desc: true }), ['ok', 'run', 'fail', 'broken', 'none'])
assert.deepEqual(order({ key: 'when', desc: false }), ['run', 'ok', 'fail', 'broken', 'none'])
assert.deepEqual(order({ key: 'duration', desc: true }), ['fail', 'ok', 'broken', 'none', 'run'])
assert.deepEqual(order({ key: 'project', desc: false }), ['broken', 'fail', 'none', 'ok', 'run'])
const job = (name: string, status: Job['status'], durationSec: number | null) =>
  ({ id: name, name, stage: 'build', status, allowFailure: false, failedStep: null, webUrl: '', durationSec }) as Job
const jobs = [job('compile', 'success', 40), job('lint', 'failed', 5), job('deploy', 'manual', null), job('test', 'running', 70)]
const names = (key: Parameters<typeof sortJobs>[1]['key'], desc = false) => sortJobs(jobs, { key, desc }).map(j => j.name)

assert.deepEqual(names('stage'), ['compile', 'lint', 'deploy', 'test'])
assert.deepEqual(names('stage', true), ['test', 'deploy', 'lint', 'compile'])
assert.deepEqual(names('status'), ['lint', 'test', 'deploy', 'compile'])
assert.deepEqual(names('duration', true), ['test', 'compile', 'lint', 'deploy'])
assert.deepEqual(names('name'), ['compile', 'deploy', 'lint', 'test'])
console.log('check-pipelines-sort: ok')
