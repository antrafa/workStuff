// My MR/PR queue: what waits for my review and how my own open MRs stand (conflict, pipeline,
// approval), across every repository connection. One list call per question; no per-MR calls.
// Selfcheck: node server/lib/review/queue.ts --selfcheck

import assert from 'node:assert/strict'
import { mapLimit } from '../concurrency.ts'
import { say } from '../i18n.ts'
import { connFor } from '../pipelines/watch.ts'
import { call, whoami, type Conn } from '../repos/providers.ts'
import { parseRemote } from '../repos/remote.ts'
import { listSources, type ProviderKind, type Source } from '../repos/sources.ts'

// What blocks the merge, in words the screen translates. `unknown` when the server does not say
// (GitHub's search, or a GitLab older than 15.6 without detailed_merge_status).
export type QueueState =
  | 'conflict' | 'rebase' | 'ci_failed' | 'ci_running' | 'needs_approval' | 'changes_requested'
  | 'discussions' | 'draft' | 'ready' | 'blocked' | 'unknown'

export type QueueMr = {
  sourceId: string
  provider: ProviderKind
  fullPath: string
  iid: number
  title: string
  author: string
  webUrl: string
  updatedAt: string
  sourceBranch: string
  targetBranch: string
  state: QueueState
  comments: number
}

export type Queue = { toReview: QueueMr[]; mine: QueueMr[]; errors: { source: string; error: string }[]; sources: number }

const PER_PAGE = 50

export type GlQueueMr = {
  iid: number
  title: string
  web_url: string
  updated_at: string
  source_branch: string
  target_branch: string
  draft?: boolean
  work_in_progress?: boolean
  has_conflicts?: boolean
  merge_status?: string
  detailed_merge_status?: string
  user_notes_count?: number
  author?: { username?: string }
  references?: { full?: string }
}

export type GhSearchItem = {
  number: number
  title: string
  html_url: string
  updated_at: string
  repository_url: string
  draft?: boolean
  comments?: number
  user?: { login?: string }
}

const GL_STATES: Record<string, QueueState> = {
  conflict: 'conflict',
  broken_status: 'conflict',
  need_rebase: 'rebase',
  ci_must_pass: 'ci_failed',
  ci_still_running: 'ci_running',
  not_approved: 'needs_approval',
  approvals_syncing: 'needs_approval',
  requested_changes: 'changes_requested',
  discussions_not_resolved: 'discussions',
  draft_status: 'draft',
  mergeable: 'ready',
  checking: 'unknown',
  unchecked: 'unknown',
  preparing: 'unknown',
}

export function gitLabState(m: GlQueueMr): QueueState {
  if (m.detailed_merge_status) return GL_STATES[m.detailed_merge_status] ?? 'blocked'
  if (m.has_conflicts) return 'conflict'
  if (m.draft || m.work_in_progress) return 'draft'
  return m.merge_status === 'can_be_merged' ? 'ready' : 'unknown'
}

export function fromGitLab(source: Source, m: GlQueueMr): QueueMr {
  // "group/sub/project!42": the list endpoint has no project path field of its own
  const full = m.references?.full ?? ''
  const fullPath = full.includes('!') ? full.slice(0, full.lastIndexOf('!')) : m.web_url.replace(/^https?:\/\/[^/]+\//, '').split('/-/')[0]
  return {
    sourceId: source.id, provider: 'gitlab', fullPath, iid: m.iid, title: m.title,
    author: m.author?.username ?? '?', webUrl: m.web_url, updatedAt: m.updated_at,
    sourceBranch: m.source_branch, targetBranch: m.target_branch, state: gitLabState(m), comments: m.user_notes_count ?? 0,
  }
}

export function fromGitHub(source: Source, i: GhSearchItem): QueueMr {
  return {
    sourceId: source.id, provider: 'github', fullPath: i.repository_url.split('/').slice(-2).join('/'), iid: i.number, title: i.title,
    author: i.user?.login ?? '?', webUrl: i.html_url, updatedAt: i.updated_at,
    // The search answer has no branches nor merge state: the MR screen fetches them when opened
    sourceBranch: '', targetBranch: '', state: i.draft ? 'draft' : 'unknown', comments: i.comments ?? 0,
  }
}

const byUpdate = (a: QueueMr, b: QueueMr) => b.updatedAt.localeCompare(a.updatedAt)
const keyOf = (m: QueueMr) => `${m.fullPath}!${m.iid}`

function uniq(list: QueueMr[]): QueueMr[] {
  const seen = new Set<string>()
  return list.filter(m => !seen.has(keyOf(m)) && Boolean(seen.add(keyOf(m))))
}

async function gitLabQueue(source: Source, conn: Conn) {
  const me = await whoami(conn)
  const list = async (query: string) =>
    ((await call(conn, `/merge_requests?state=opened&${query}&order_by=updated_at&per_page=${PER_PAGE}`)).data as GlQueueMr[]).map(m => fromGitLab(source, m))
  // Teams ask for review either as reviewer or by assigning the MR: both mean "waiting for you"
  const [reviewer, assigned, mine] = await Promise.all([
    list(`scope=all&reviewer_username=${encodeURIComponent(me)}`),
    list('scope=assigned_to_me'),
    list('scope=created_by_me'),
  ])
  return { toReview: uniq([...reviewer, ...assigned]).filter(m => m.author !== me), mine }
}

async function gitHubQueue(source: Source, conn: Conn) {
  const search = async (q: string) =>
    ((await call(conn, `/search/issues?q=${encodeURIComponent(`is:pr is:open archived:false ${q}`)}&sort=updated&per_page=${PER_PAGE}`)).data as { items: GhSearchItem[] }).items.map(i => fromGitHub(source, i))
  const [toReview, mine] = await Promise.all([search('review-requested:@me'), search('author:@me')])
  return { toReview, mine }
}

// Two connections to the same server (different base groups) would list the same MRs twice
export function oneSourcePerServer(sources: Source[]): Source[] {
  const seen = new Set<string>()
  return sources.filter(s => {
    const key = `${s.provider}:${parseRemote(s.url)?.host ?? s.url}`
    return s.tokenSource !== 'none' && !seen.has(key) && Boolean(seen.add(key))
  })
}

export async function myQueue(): Promise<Queue> {
  const sources = oneSourcePerServer(listSources())
  const errors: Queue['errors'] = []
  const parts = await mapLimit(sources, 3, async source => {
    try {
      const conn = await connFor(source)
      return source.provider === 'gitlab' ? await gitLabQueue(source, conn) : await gitHubQueue(source, conn)
    } catch (e) {
      errors.push({ source: source.label, error: (e as Error).message })
      return { toReview: [], mine: [] }
    }
  })
  if (sources.length === 0 && listSources().length > 0) {
    errors.push({ source: '', error: say({ en: 'every connection is without a token, and the queue needs to know who you are', pt: 'todas as conexões estão sem token, e a fila precisa saber quem é você' }) })
  }
  return {
    toReview: parts.flatMap(p => p.toReview).sort(byUpdate),
    mine: parts.flatMap(p => p.mine).sort(byUpdate),
    errors,
    sources: sources.length,
  }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const src = { id: 's1', provider: 'gitlab', url: 'https://gitlab.empresa.com', label: 'GL', protocol: 'https', tokenSource: 'stored', basePath: '', workspace: '/tmp' } as Source
  const gl: GlQueueMr = {
    iid: 42, title: 'feat: x', web_url: 'https://gitlab.empresa.com/produto/time/api/-/merge_requests/42', updated_at: '2026-10-15T10:00:00Z',
    source_branch: 'feat/x', target_branch: 'main', detailed_merge_status: 'ci_must_pass', user_notes_count: 3,
    author: { username: 'ana' }, references: { full: 'produto/time/api!42' },
  }
  const mapped = fromGitLab(src, gl)
  assert.equal(mapped.fullPath, 'produto/time/api')
  assert.equal(mapped.state, 'ci_failed')
  assert.equal(mapped.comments, 3)
  assert.equal(fromGitLab(src, { ...gl, references: undefined }).fullPath, 'produto/time/api', 'sem references, o caminho sai da URL')

  assert.equal(gitLabState({ ...gl, detailed_merge_status: 'mergeable' }), 'ready')
  assert.equal(gitLabState({ ...gl, detailed_merge_status: 'algo_novo' }), 'blocked', 'estado desconhecido não vira "pronto"')
  assert.equal(gitLabState({ ...gl, detailed_merge_status: undefined, has_conflicts: true }), 'conflict', 'GitLab antigo')
  assert.equal(gitLabState({ ...gl, detailed_merge_status: undefined, merge_status: 'can_be_merged' }), 'ready')
  assert.equal(gitLabState({ ...gl, detailed_merge_status: undefined, merge_status: 'cannot_be_merged' }), 'unknown')

  const gh = fromGitHub({ ...src, provider: 'github' }, {
    number: 7, title: 'fix', html_url: 'https://github.com/org/repo/pull/7', updated_at: '2026-10-15T10:00:00Z',
    repository_url: 'https://api.github.com/repos/org/repo', draft: true, comments: 1, user: { login: 'bia' },
  })
  assert.deepEqual([gh.fullPath, gh.iid, gh.state, gh.author], ['org/repo', 7, 'draft', 'bia'])

  assert.equal(uniq([mapped, { ...mapped }, { ...mapped, iid: 43 }]).length, 2, 'revisor e responsável ao mesmo tempo aparece uma vez')
  assert.deepEqual(oneSourcePerServer([
    src,
    { ...src, id: 's2', basePath: 'outro-grupo' },
    { ...src, id: 's3', url: 'https://gitlab.com' },
    { ...src, id: 's4', url: 'https://github.com', tokenSource: 'none' },
  ]).map(s => s.id), ['s1', 's3'], 'uma conexão por servidor; sem token fica de fora')

  // The calls themselves: the right scopes and the author filtered out of "to review"
  const realFetch = globalThis.fetch
  const asked: string[] = []
  try {
    globalThis.fetch = (async (url: string) => {
      asked.push(url)
      if (url.endsWith('/user')) return new Response(JSON.stringify({ username: 'eu' }))
      if (url.includes('reviewer_username=eu')) return new Response(JSON.stringify([gl, { ...gl, iid: 9, author: { username: 'eu' } }]))
      if (url.includes('assigned_to_me')) return new Response(JSON.stringify([gl]))
      return new Response(JSON.stringify([{ ...gl, iid: 50, author: { username: 'eu' } }]))
    }) as typeof fetch
    const q = await gitLabQueue(src, { provider: 'gitlab', url: src.url, token: 't' })
    assert.deepEqual(q.toReview.map(m => m.iid), [42], 'o próprio MR não aparece em "para revisar"')
    assert.deepEqual(q.mine.map(m => m.iid), [50])
    assert.ok(asked.some(u => u.includes('scope=created_by_me')))
  } finally {
    globalThis.fetch = realFetch
  }
  console.log('review queue selfcheck: ok')
}
