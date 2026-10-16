// What goes along when an environment takes the other's version: the commits in a local clone between
// the image tag running on one side and the tag on the other. The tag becomes a git ref by trying the
// usual conventions (1.4.2, v1.4.2, a commit hash, 1.4.2-<hash>). Read-only: nothing is fetched.
// Selfcheck: node server/lib/compare/release.ts --selfcheck

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { say } from '../i18n.ts'
import { run } from '../run.ts'
import { RepoError } from '../repos/sources.ts'

export type ReleaseCommit = { sha: string; subject: string; author: string; at: string }
export type ResolvedTag = { tag: string; ref: string | null; tried: string[] }
export type Release = {
  from: ResolvedTag
  to: ResolvedTag
  commits: ReleaseCommit[]
  mergeRequests: string[]
  shortstat: string
  truncated: boolean
}

const MAX_COMMITS = 300
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/+-]*$/
const HASH = /^[0-9a-f]{7,40}$/

// Every git ref a container tag may stand for, the most literal first
export function refCandidates(tag: string): string[] {
  const t = tag.trim()
  if (!SAFE_REF.test(t)) return []
  const out = [`refs/tags/${t}`, `refs/tags/v${t}`]
  if (HASH.test(t)) out.push(t)
  // 1.4.2-3f9c2ab or main-3f9c2ab: version or branch, then the commit the image was built from
  const suffix = /[-_.]([0-9a-f]{7,40})$/.exec(t)?.[1]
  if (suffix) out.push(suffix)
  out.push(t, `origin/${t}`)
  return [...new Set(out)]
}

async function commitOf(repo: string, ref: string): Promise<string | null> {
  try {
    return (await run('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], 10_000)).trim() || null
  } catch {
    return null
  }
}

export async function resolveTag(repo: string, tag: string): Promise<ResolvedTag> {
  const tried = refCandidates(tag)
  for (const candidate of tried) {
    const sha = await commitOf(repo, candidate)
    if (sha) return { tag, ref: sha, tried }
  }
  return { tag, ref: null, tried }
}

// "See merge request group/project!123" (GitLab) and "Merge pull request #45" (GitHub)
export function mergeRequestsIn(text: string): string[] {
  const found = [
    ...[...text.matchAll(/See merge request (\S+![0-9]+)/g)].map(m => m[1]),
    ...[...text.matchAll(/Merge pull request (#[0-9]+)/g)].map(m => m[1]),
  ]
  return [...new Set(found)]
}

// Commits that `to` has and `from` does not: what reaches the environment now running `from`
export async function releaseBetween(repo: string, fromTag: string, toTag: string): Promise<Release> {
  const [from, to] = await Promise.all([resolveTag(repo, fromTag), resolveTag(repo, toTag)])
  if (!from.ref || !to.ref) return { from, to, commits: [], mergeRequests: [], shortstat: '', truncated: false }
  const range = `${from.ref}..${to.ref}`
  const [log, merges, shortstat] = await Promise.all([
    run('git', ['-C', repo, 'log', '--no-merges', `--max-count=${MAX_COMMITS + 1}`, '--format=%h%x1f%an%x1f%cI%x1f%s', range], 20_000),
    run('git', ['-C', repo, 'log', '--merges', '--format=%s%n%b', range], 20_000),
    run('git', ['-C', repo, 'diff', '--shortstat', from.ref, to.ref], 20_000),
  ])
  const commits = log.split('\n').filter(Boolean).map(line => {
    const [sha, author, at, subject] = line.split('\x1f')
    return { sha, author, at, subject }
  })
  return {
    from, to,
    commits: commits.slice(0, MAX_COMMITS),
    mergeRequests: mergeRequestsIn(merges),
    shortstat: shortstat.trim(),
    truncated: commits.length > MAX_COMMITS,
  }
}

export function assertTag(label: string, tag: unknown): string {
  const t = String(tag ?? '').trim()
  if (!SAFE_REF.test(t)) throw new RepoError(say({ en: `invalid ${label} version: ${t || '(empty)'}`, pt: `versão ${label} inválida: ${t || '(vazia)'}` }))
  return t
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.deepEqual(refCandidates('1.4.2'), ['refs/tags/1.4.2', 'refs/tags/v1.4.2', '1.4.2', 'origin/1.4.2'])
  assert.ok(refCandidates('1.4.2-3f9c2ab').includes('3f9c2ab'), 'hash no fim da tag')
  assert.ok(refCandidates('3f9c2ab1').includes('3f9c2ab1'))
  assert.deepEqual(refCandidates('--upload-pack=x'), [], 'tag que parece opção não vira argumento')
  assert.deepEqual(refCandidates('a..b'), ['refs/tags/a..b', 'refs/tags/va..b', 'a..b', 'origin/a..b'], 'faixa é recusada pelo próprio rev-parse --verify')
  assert.throws(() => assertTag('A', '-x'), /invalid A version/)
  assert.deepEqual(mergeRequestsIn("Merge branch 'feat/x' into 'main'\n\nSee merge request produto/api!12\nMerge pull request #4 from a/b\nSee merge request produto/api!12"), ['produto/api!12', '#4'])

  const tmp = mkdtempSync(join(tmpdir(), 'ws-release-'))
  try {
    const git = (...args: string[]) => run('git', ['-C', tmp, '-c', 'user.name=Ana', '-c', 'user.email=a@x', '-c', 'commit.gpgsign=false', ...args])
    await git('init', '--initial-branch=main')
    await git('commit', '--allow-empty', '-m', 'chore: base')
    await git('tag', 'v1.0.0')
    await git('checkout', '-q', '-b', 'feat/login')
    await git('commit', '--allow-empty', '-m', 'feat: login')
    await git('checkout', '-q', 'main')
    await git('merge', '--no-ff', 'feat/login', '-m', "Merge branch 'feat/login' into 'main'\n\nSee merge request produto/api!7")
    await git('commit', '--allow-empty', '-m', 'fix: senha')
    const head = (await git('rev-parse', '--short', 'HEAD')).trim()

    const r = await releaseBetween(tmp, '1.0.0', `1.1.0-${head}`)
    assert.equal(r.from.ref?.length, 40, 'v1.0.0 achada a partir de 1.0.0')
    assert.ok(r.to.ref, 'hash no fim da tag resolve o commit')
    assert.deepEqual(r.commits.map(c => c.subject), ['fix: senha', 'feat: login'])
    assert.deepEqual(r.mergeRequests, ['produto/api!7'])
    assert.equal((await releaseBetween(tmp, `1.1.0-${head}`, '1.0.0')).commits.length, 0, 'voltar de versão não traz commit novo')

    const missing = await releaseBetween(tmp, '9.9.9', '1.0.0')
    assert.equal(missing.from.ref, null)
    assert.ok(missing.from.tried.includes('refs/tags/v9.9.9'), 'mostra o que tentou, para o usuário saber o que buscar')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  console.log('compare release selfcheck: ok')
}
