// Remote Merge Request / Pull Request inspection for Pre-MR Review (/revisao).
// Fetches open MRs/PRs from followed projects or by direct URL, builds a unified diff compatible
// with CognitiveDiffViewer, and computes Blast Radius when a local clone exists in the workspace.
// Selfcheck: node server/lib/review/mr.ts --selfcheck

import assert from 'node:assert/strict'
import { mapLimit } from '../concurrency.ts'
import { computeBlastRadius } from '../factory/gates.ts'
import type { BlastRadiusReport } from '../factory/types.ts'
import { say } from '../i18n.ts'
import { tildify } from '../paths.ts'
import { connFor, listWatches, localClone } from '../pipelines/watch.ts'
import { normalizePath } from '../repos/layout.ts'
import { allPages, call, type Conn } from '../repos/providers.ts'
import { run } from '../run.ts'
import { parseRemote, sourceForRemote } from '../repos/remote.ts'
import { getSource, listSources, RepoError, type ProviderKind, type Source } from '../repos/sources.ts'

const MAX_DIFF = 150_000

export type ParsedMrUrl = {
  provider: ProviderKind
  host: string
  fullPath: string
  iid: number
}

export type RemoteMrSummary = {
  sourceId: string
  sourceLabel: string
  provider: ProviderKind
  fullPath: string
  iid: number
  title: string
  author: string
  sourceBranch: string
  targetBranch: string
  updatedAt: string
  webUrl: string
  draft: boolean
  localClone: string | null
}

export type RemoteMrDetail = RemoteMrSummary & {
  description: string
}

export type RemoteMrDiffResult = {
  mr: RemoteMrDetail
  diff: string
  truncated: boolean
  files: number
  changedFiles: string[]
  blastRadius: BlastRadiusReport | null
  clonePath: string | null
  /** Where the local clone stands: it is whatever was checked out, not the MR's branch. */
  cloneRef: { branch: string; commit: string } | null
}

// GitHub lists at most 3000 files of a PR
const MAX_MR_FILES = 3000

// Parses a GitLab MR URL (.../group/project/-/merge_requests/123) or GitHub PR URL (.../owner/repo/pull/45)
export function parseMrUrl(rawUrl: string): ParsedMrUrl | null {
  try {
    const u = new URL(rawUrl.trim())
    const host = u.hostname.toLowerCase()
    const path = normalizePath(u.pathname)

    const gl = /^(.+?)\/(?:-\/)?merge_requests\/(\d+)(?:\/.*)?$/.exec(path)
    if (gl) {
      return { provider: 'gitlab', host, fullPath: normalizePath(gl[1]), iid: Number(gl[2]) }
    }

    const gh = /^([^/]+\/[^/]+)\/pull\/(\d+)(?:\/.*)?$/.exec(path)
    if (gh) {
      return { provider: 'github', host, fullPath: normalizePath(gh[1]), iid: Number(gh[2]) }
    }
    return null
  } catch {
    return null
  }
}

export type GlDiffItem = {
  old_path: string
  new_path: string
  new_file?: boolean
  deleted_file?: boolean
  diff: string
}

export type GhPullFile = {
  filename: string
  previous_filename?: string
  status?: string
  patch?: string
}

export function buildUnifiedDiffFromGitLab(items: GlDiffItem[]): { diff: string; changedFiles: string[] } {
  const blocks: string[] = []
  const changedFiles: string[] = []

  for (const item of items) {
    const oldPath = item.old_path || item.new_path
    const newPath = item.new_path || item.old_path
    const targetPath = item.deleted_file ? oldPath : newPath
    if (targetPath && !changedFiles.includes(targetPath)) changedFiles.push(targetPath)
    if (!item.diff) continue

    const header = [
      `diff --git a/${oldPath} b/${newPath}`,
      ...(item.new_file ? ['new file mode 100644'] : []),
      ...(item.deleted_file ? ['deleted file mode 100644'] : []),
      `--- ${item.new_file ? '/dev/null' : `a/${oldPath}`}`,
      `+++ ${item.deleted_file ? '/dev/null' : `b/${newPath}`}`,
      item.diff.trimEnd(),
    ]
    blocks.push(header.join('\n'))
  }

  return { diff: blocks.join('\n'), changedFiles }
}

export function buildUnifiedDiffFromGitHub(files: GhPullFile[]): { diff: string; changedFiles: string[] } {
  const blocks: string[] = []
  const changedFiles: string[] = []

  for (const f of files) {
    const isNew = f.status === 'added'
    const isDeleted = f.status === 'removed'
    const oldPath = f.previous_filename || f.filename
    const newPath = f.filename
    if (newPath && !changedFiles.includes(newPath)) changedFiles.push(newPath)
    if (!f.patch) continue

    const header = [
      `diff --git a/${oldPath} b/${newPath}`,
      ...(isNew ? ['new file mode 100644'] : []),
      ...(isDeleted ? ['deleted file mode 100644'] : []),
      `--- ${isNew ? '/dev/null' : `a/${oldPath}`}`,
      `+++ ${isDeleted ? '/dev/null' : `b/${newPath}`}`,
      f.patch.trimEnd(),
    ]
    blocks.push(header.join('\n'))
  }

  return { diff: blocks.join('\n'), changedFiles }
}

const enc = (s: string) => encodeURIComponent(s)

type GlMr = {
  iid: number
  title: string
  description?: string | null
  state: string
  draft?: boolean
  work_in_progress?: boolean
  updated_at: string
  source_branch: string
  target_branch: string
  web_url: string
  author?: { username?: string; name?: string }
}

type GhPr = {
  number: number
  title: string
  body?: string | null
  state: string
  draft?: boolean
  updated_at: string
  html_url: string
  user?: { login?: string }
  head?: { ref?: string }
  base?: { ref?: string }
}

async function listProjectOpenMrs(source: Source, conn: Conn, fullPath: string, limit = 10): Promise<RemoteMrSummary[]> {
  const clone = localClone(source, fullPath)
  const localLabel = clone ? tildify(clone) : null

  if (conn.provider === 'gitlab') {
    const { data } = await call(
      conn,
      `/projects/${enc(fullPath)}/merge_requests?state=opened&order_by=updated_at&sort=desc&per_page=${limit}`,
    )
    return (data as GlMr[]).map(m => ({
      sourceId: source.id,
      sourceLabel: source.label,
      provider: 'gitlab',
      fullPath,
      iid: m.iid,
      title: m.title,
      author: m.author?.username ?? m.author?.name ?? '?',
      sourceBranch: m.source_branch,
      targetBranch: m.target_branch,
      updatedAt: m.updated_at,
      webUrl: m.web_url,
      draft: Boolean(m.draft || m.work_in_progress),
      localClone: localLabel,
    }))
  }

  const repoPath = fullPath.split('/').map(enc).join('/')
  const { data } = await call(
    conn,
    `/repos/${repoPath}/pulls?state=open&sort=updated&direction=desc&per_page=${limit}`,
  )
  return (data as GhPr[]).map(p => ({
    sourceId: source.id,
    sourceLabel: source.label,
    provider: 'github',
    fullPath,
    iid: p.number,
    title: p.title,
    author: p.user?.login ?? '?',
    sourceBranch: p.head?.ref ?? '?',
    targetBranch: p.base?.ref ?? '?',
    updatedAt: p.updated_at,
    webUrl: p.html_url,
    draft: Boolean(p.draft),
    localClone: localLabel,
  }))
}

export async function listWatchedOpenMrs(): Promise<{
  mrs: RemoteMrSummary[]
  errors: { fullPath: string; error: string }[]
}> {
  const watches = listWatches()
  const errors: { fullPath: string; error: string }[] = []

  const nested = await mapLimit(watches, 4, async w => {
    try {
      const source = getSource(w.sourceId)
      const conn = await connFor(source)
      return await listProjectOpenMrs(source, conn, w.fullPath, 8)
    } catch (e) {
      errors.push({ fullPath: w.fullPath, error: (e as Error).message })
      return []
    }
  })

  const mrs = nested
    .flat()
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))

  return { mrs, errors }
}

function resolveTarget(input: {
  sourceId?: string
  fullPath?: string
  iid?: number
  url?: string
}): { source: Source; fullPath: string; iid: number } {
  if (input.url && input.url.trim()) {
    const parsed = parseMrUrl(input.url)
    if (!parsed) {
      throw new RepoError(
        say({
          en: 'Invalid MR/PR URL: paste a full GitLab (.../-/merge_requests/123) or GitHub (.../pull/45) address.',
          pt: 'URL de MR/PR inválida: cole o endereço completo do GitLab (.../-/merge_requests/123) ou GitHub (.../pull/45).',
        }),
      )
    }
    const sources = listSources()
    const matched =
      sourceForRemote(sources, `https://${parsed.host}/${parsed.fullPath}`)?.source ??
      sources.find(s => parseRemote(s.url)?.host === parsed.host)
    if (!matched) {
      throw new RepoError(
        say({
          en: `No repository connection found for host ${parsed.host}. Add it in the Repositories screen first.`,
          pt: `Nenhuma conexão de repositório configurada para ${parsed.host}. Adicione-a primeiro na tela Repositórios.`,
        }),
      )
    }
    // A /pull/5 address on a GitLab host would otherwise fetch MR !5, a different change
    if (matched.provider !== parsed.provider) {
      throw new RepoError(
        say({
          en: `This is a ${parsed.provider === 'gitlab' ? 'GitLab' : 'GitHub'} address, but the connection for ${parsed.host} is ${matched.provider === 'gitlab' ? 'GitLab' : 'GitHub'}.`,
          pt: `Este é um endereço do ${parsed.provider === 'gitlab' ? 'GitLab' : 'GitHub'}, mas a conexão de ${parsed.host} é ${matched.provider === 'gitlab' ? 'GitLab' : 'GitHub'}.`,
        }),
      )
    }
    return { source: matched, fullPath: parsed.fullPath, iid: parsed.iid }
  }

  const source = getSource(String(input.sourceId ?? ''))
  const fullPath = normalizePath(String(input.fullPath ?? ''))
  const iid = Number(input.iid)
  if (!fullPath || !Number.isInteger(iid) || iid <= 0) {
    throw new RepoError(
      say({
        en: 'Provide the project path and MR/PR number, or paste the MR/PR URL.',
        pt: 'Informe o projeto e o número do MR/PR, ou cole a URL do MR/PR.',
      }),
    )
  }
  return { source, fullPath, iid }
}

export async function fetchRemoteMrDiff(input: {
  sourceId?: string
  fullPath?: string
  iid?: number
  url?: string
}): Promise<RemoteMrDiffResult> {
  const { source, fullPath, iid } = resolveTarget(input)
  const conn = await connFor(source)
  const clonePath = localClone(source, fullPath)
  const localLabel = clonePath ? tildify(clonePath) : null

  let mr: RemoteMrDetail
  let rawDiff = ''
  let changedFiles: string[] = []

  if (conn.provider === 'gitlab') {
    const [mrRes, diffItems] = await Promise.all([
      call(conn, `/projects/${enc(fullPath)}/merge_requests/${iid}`),
      gitLabDiffItems(conn, fullPath, iid),
    ])
    const m = mrRes.data as GlMr
    mr = {
      sourceId: source.id,
      sourceLabel: source.label,
      provider: 'gitlab',
      fullPath,
      iid: m.iid,
      title: m.title,
      description: m.description ?? '',
      author: m.author?.username ?? m.author?.name ?? '?',
      sourceBranch: m.source_branch,
      targetBranch: m.target_branch,
      updatedAt: m.updated_at,
      webUrl: m.web_url,
      draft: Boolean(m.draft || m.work_in_progress),
      localClone: localLabel,
    }
    const built = buildUnifiedDiffFromGitLab(diffItems)
    rawDiff = built.diff
    changedFiles = built.changedFiles
  } else {
    const repoPath = fullPath.split('/').map(enc).join('/')
    const [prRes, prFiles] = await Promise.all([
      call(conn, `/repos/${repoPath}/pulls/${iid}`),
      allPages<GhPullFile>(conn, `/repos/${repoPath}/pulls/${iid}/files`, MAX_MR_FILES),
    ])
    const p = prRes.data as GhPr
    mr = {
      sourceId: source.id,
      sourceLabel: source.label,
      provider: 'github',
      fullPath,
      iid: p.number,
      title: p.title,
      description: p.body ?? '',
      author: p.user?.login ?? '?',
      sourceBranch: p.head?.ref ?? '?',
      targetBranch: p.base?.ref ?? '?',
      updatedAt: p.updated_at,
      webUrl: p.html_url,
      draft: Boolean(p.draft),
      localClone: localLabel,
    }
    const built = buildUnifiedDiffFromGitHub(prFiles)
    rawDiff = built.diff
    changedFiles = built.changedFiles
  }

  const cloneRef = clonePath ? await cloneHead(clonePath) : null
  const blastRadius = clonePath && changedFiles.length > 0
    ? await computeBlastRadius(clonePath, changedFiles).catch(() => null)
    : null

  return {
    mr,
    diff: rawDiff.slice(0, MAX_DIFF),
    truncated: rawDiff.length > MAX_DIFF || changedFiles.length >= MAX_MR_FILES,
    files: changedFiles.length,
    changedFiles,
    blastRadius,
    clonePath,
    cloneRef,
  }
}

// Every page of the MR's files. /diffs exists from GitLab 15.7; an older server answers 404 there and
// still serves the deprecated /changes, which returns all files in one response.
async function gitLabDiffItems(conn: Conn, fullPath: string, iid: number): Promise<GlDiffItem[]> {
  const base = `/projects/${enc(fullPath)}/merge_requests/${iid}`
  try {
    return await allPages<GlDiffItem>(conn, `${base}/diffs`, MAX_MR_FILES)
  } catch (e) {
    if ((e as RepoError).status !== 404) throw e
    return ((await call(conn, `${base}/changes`)).data as { changes: GlDiffItem[] }).changes
  }
}

async function cloneHead(clonePath: string): Promise<{ branch: string; commit: string } | null> {
  try {
    const [branch, commit] = await Promise.all([
      run('git', ['-C', clonePath, 'rev-parse', '--abbrev-ref', 'HEAD']),
      run('git', ['-C', clonePath, 'rev-parse', '--short', 'HEAD']),
    ])
    return { branch: branch.trim(), commit: commit.trim() }
  } catch {
    // a clone without commits has no HEAD: the prompt then just does not name a branch
    return null
  }
}

// Code fence one backtick longer than any run inside the text: a ``` in an MR description or in a
// diffed Markdown file can then never close the block and turn the rest into instructions.
export function fenced(text: string, lang = ''): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${lang}\n${text}\n${fence}`
}

export function formatBlastPromptNote(blastRadius: BlastRadiusReport | null | undefined): string {
  if (!blastRadius || blastRadius.totalDependents === 0) return ''
  const lines = blastRadius.files
    .filter(f => f.dependents.length > 0)
    .map(f => `- ${f.file}: ${f.dependents.length} dependente(s) fora do diff (${f.dependents.slice(0, 5).join(', ')}), ${f.testFiles.length} suíte(s) de teste cobrindo`)
  return lines.length > 0
    ? `Raio de Impacto determinístico (${blastRadius.totalDependents} módulo(s) externo(s) importam arquivos alterados):\n${lines.join('\n')}`
    : ''
}

export function runMrSelfcheck() {
  assert.deepEqual(
    parseMrUrl('https://gitlab.empresa.com.br/produto/equipe/passagem-api/-/merge_requests/142/diffs'),
    { provider: 'gitlab', host: 'gitlab.empresa.com.br', fullPath: 'produto/equipe/passagem-api', iid: 142 },
  )
  assert.deepEqual(
    parseMrUrl('https://gitlab.com/org/repo/merge_requests/9'),
    { provider: 'gitlab', host: 'gitlab.com', fullPath: 'org/repo', iid: 9 },
  )
  assert.deepEqual(
    parseMrUrl('https://github.com/antrafa/workStuff/pull/27/files'),
    { provider: 'github', host: 'github.com', fullPath: 'antrafa/workStuff', iid: 27 },
  )
  assert.equal(parseMrUrl('https://github.com/antrafa/workStuff/issues/27'), null)
  assert.equal(parseMrUrl('not-a-url'), null)

  const glBuilt = buildUnifiedDiffFromGitLab([
    {
      old_path: 'src/service.ts',
      new_path: 'src/service.ts',
      diff: '@@ -1,2 +1,3 @@\n const a = 1\n+const b = 2\n',
    },
    {
      old_path: 'src/new.ts',
      new_path: 'src/new.ts',
      new_file: true,
      diff: '@@ -0,0 +1,1 @@\n+export const x = 1\n',
    },
  ])
  assert.deepEqual(glBuilt.changedFiles, ['src/service.ts', 'src/new.ts'])
  assert.match(glBuilt.diff, /diff --git a\/src\/service\.ts b\/src\/service\.ts/)
  assert.match(glBuilt.diff, /new file mode 100644/)

  const ghBuilt = buildUnifiedDiffFromGitHub([
    {
      filename: 'server/routes/api.ts',
      status: 'modified',
      patch: '@@ -10,2 +10,3 @@\n+router.get("/ok")',
    },
  ])
  assert.deepEqual(ghBuilt.changedFiles, ['server/routes/api.ts'])
  assert.match(ghBuilt.diff, /\+\+\+ b\/server\/routes\/api\.ts/)
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  runMrSelfcheck()

  // GitLab: every page of /diffs, and /changes when the server predates /diffs (404)
  const realFetch = globalThis.fetch
  const item = (n: number): GlDiffItem => ({ old_path: `f${n}.ts`, new_path: `f${n}.ts`, diff: '@@ -1 +1 @@\n-a\n+b\n' })
  const conn = { provider: 'gitlab', url: 'https://gl.test', token: null } as Conn
  try {
    globalThis.fetch = (async (url: string) => {
      const page = Number(new URL(url).searchParams.get('page'))
      return page === 1
        ? new Response(JSON.stringify(Array.from({ length: 100 }, (_, i) => item(i))), { headers: { 'x-next-page': '2' } })
        : new Response(JSON.stringify([item(100), item(101)]))
    }) as typeof fetch
    assert.equal((await gitLabDiffItems(conn, 'g/p', 1)).length, 102, 'lê além da primeira página de 100')

    globalThis.fetch = (async (url: string) =>
      url.includes('/diffs') ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ changes: [item(1)] }))) as typeof fetch
    assert.deepEqual((await gitLabDiffItems(conn, 'g/p', 1)).map(i => i.new_path), ['f1.ts'], 'GitLab antigo cai para /changes')
  } finally {
    globalThis.fetch = realFetch
  }
  assert.equal(fenced('a'), '```\na\n```')
  assert.equal(fenced('x ``` y', 'diff'), '````diff\nx ``` y\n````', 'a cerca é maior que qualquer sequência de crases do texto')
  console.log('review mr selfcheck: ok')
}
