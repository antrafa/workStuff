// GitLab CI e GitHub Actions numa forma só: status, pipelines e jobs com os mesmos campos,
// e o log de job limpo (sem cor nem marcador de seção) para mostrar e mandar à IA.
// Autoteste: node server/lib/pipelines/normalize.ts --selfcheck

import assert from 'node:assert/strict'

export type Status = 'success' | 'failed' | 'running' | 'pending' | 'canceled' | 'skipped' | 'manual' | 'unknown'

export type Pipeline = {
  id: string
  status: Status
  ref: string
  sha: string
  title: string
  webUrl: string
  createdAt: string
  durationSec: number | null
}

export type Job = {
  id: string
  name: string
  stage: string
  status: Status
  allowFailure: boolean
  // Só GitHub: o passo que falhou dentro do job, que é o que o log precisa explicar.
  failedStep: string | null
  webUrl: string
  durationSec: number | null
}

const GITLAB: Record<string, Status> = {
  success: 'success', failed: 'failed', running: 'running', canceled: 'canceled', canceling: 'canceled',
  skipped: 'skipped', manual: 'manual', created: 'pending', pending: 'pending', preparing: 'pending',
  waiting_for_resource: 'pending', waiting_for_callback: 'pending', scheduled: 'pending',
}

export const gitlabStatus = (s: string): Status => GITLAB[s] ?? 'unknown'

// GitHub separa andamento (status) de resultado (conclusion); o resultado só existe quando completed.
export function githubStatus(status: string, conclusion: string | null): Status {
  if (status === 'in_progress') return 'running'
  if (status !== 'completed') return status === 'waiting' && conclusion === null ? 'manual' : 'pending'
  if (conclusion === 'success' || conclusion === 'neutral') return 'success'
  if (conclusion === 'cancelled' || conclusion === 'stale') return 'canceled'
  if (conclusion === 'skipped') return 'skipped'
  if (conclusion === 'action_required') return 'manual'
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') return 'failed'
  return 'unknown'
}

export const secondsBetween = (from: string | null, to: string | null) =>
  from && to ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000)) : null

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g
const GITLAB_SECTION = /section_(start|end):\d+:[^\r\n]*?\r/g
const GITHUB_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z /

// O fim do log é onde está o erro. Corta na quebra de linha para não começar no meio de uma.
export function cleanLog(raw: string, maxChars = 60_000): { text: string; truncated: boolean } {
  const lines = raw
    .replace(GITLAB_SECTION, '')
    .replace(ANSI, '')
    .split('\n')
    // \r sem \n é barra de progresso reescrevendo a linha: vale o último trecho.
    .map(l => l.replace(/\r$/, '').split('\r').pop()!.replace(GITHUB_TIMESTAMP, ''))
  const text = lines.join('\n').trimEnd()
  if (text.length <= maxChars) return { text, truncated: false }
  const tail = text.slice(-maxChars)
  return { text: tail.slice(tail.indexOf('\n') + 1), truncated: true }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.equal(gitlabStatus('failed'), 'failed')
  assert.equal(gitlabStatus('waiting_for_resource'), 'pending')
  assert.equal(gitlabStatus('algo-novo'), 'unknown')

  assert.equal(githubStatus('in_progress', null), 'running')
  assert.equal(githubStatus('queued', null), 'pending')
  assert.equal(githubStatus('completed', 'success'), 'success')
  assert.equal(githubStatus('completed', 'timed_out'), 'failed')
  assert.equal(githubStatus('completed', 'cancelled'), 'canceled')
  assert.equal(githubStatus('completed', 'action_required'), 'manual')

  assert.equal(secondsBetween('2026-10-01T10:00:00Z', '2026-10-01T10:02:30Z'), 150)
  assert.equal(secondsBetween(null, '2026-10-01T10:00:00Z'), null)

  const gitlab = 'section_start:1696000000:build_script\r\x1b[0K\x1b[32;1m$ npm test\x1b[0;m\nbaixando 10%\rbaixando 100%\r\n\x1b[31mFAIL\x1b[0m src/a.test.ts\nsection_end:1696000001:build_script\r\x1b[0K'
  assert.equal(cleanLog(gitlab).text, '$ npm test\nbaixando 100%\nFAIL src/a.test.ts')

  const github = '2026-10-01T10:00:00.1234567Z ##[group]Run npm ci\n2026-10-01T10:00:01.0000000Z npm ERR! code E404'
  assert.equal(cleanLog(github).text, '##[group]Run npm ci\nnpm ERR! code E404')

  const long = Array.from({ length: 1000 }, (_, i) => `linha ${i}`).join('\n')
  const cut = cleanLog(long, 100)
  assert.ok(cut.truncated && cut.text.length <= 100)
  assert.ok(cut.text.startsWith('linha ') && cut.text.endsWith('linha 999'), 'começa numa linha inteira e termina no fim')
  console.log('pipelines normalize selfcheck: ok')
}
