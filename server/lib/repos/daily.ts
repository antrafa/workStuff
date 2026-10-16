// What you committed since the last working day, across every clone of the workspace: the raw
// material for the stand-up. Each clone is read with its own git identity (a work clone may use
// another e-mail than a personal one). Read-only.
// Selfcheck: node server/lib/repos/daily.ts --selfcheck

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { mapLimit } from '../concurrency.ts'
import { run } from '../run.ts'
import { listWorkspaceRepos } from './workspace.ts'

export type DailyCommit = { sha: string; subject: string; at: string }
export type DailyRepo = { name: string; path: string; relPath: string; commits: DailyCommit[] }
export type DailySummary = { since: string; repos: DailyRepo[]; noIdentity: number }

const MAX_COMMITS_PER_REPO = 30

// Monday looks back to Friday; any other day, to the day before. Always from midnight, local time.
export function lastWorkday(now: Date): Date {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const back = now.getDay() === 1 ? 3 : now.getDay() === 0 ? 2 : 1
  since.setDate(since.getDate() - back)
  return since
}

async function gitOut(repoPath: string, args: string[]): Promise<string> {
  try {
    return (await run('git', ['-C', repoPath, ...args], 15_000)).trim()
  } catch {
    return ''
  }
}

async function commitsOf(repoPath: string, since: Date): Promise<DailyCommit[] | null> {
  const email = await gitOut(repoPath, ['config', 'user.email'])
  if (!email) return null
  // --all: what was already pushed and what sits in another local branch both count
  const log = await gitOut(repoPath, [
    'log', '--all', '--no-merges', `--since=${since.toISOString()}`, `--author=<${email}>`,
    `--max-count=${MAX_COMMITS_PER_REPO}`, '--format=%h%x09%cI%x09%s',
  ])
  return log.split('\n').filter(Boolean).map(line => {
    const [sha, at, ...subject] = line.split('\t')
    return { sha, at, subject: subject.join('\t') }
  })
}

export async function dailySummary(since: Date, roots?: string[]): Promise<DailySummary> {
  const clones = listWorkspaceRepos(roots)
  let noIdentity = 0
  const repos = await mapLimit(clones, 6, async ({ repoPath, workspace }): Promise<DailyRepo | null> => {
    const commits = await commitsOf(repoPath, since)
    if (commits === null) noIdentity++
    if (!commits?.length) return null
    return { name: basename(repoPath), path: repoPath, relPath: relative(workspace, repoPath) || basename(repoPath), commits }
  })
  return {
    since: since.toISOString(),
    repos: repos.filter((r): r is DailyRepo => r !== null).sort((a, b) => b.commits[0].at.localeCompare(a.commits[0].at)),
    noIdentity,
  }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const day = (iso: string) => lastWorkday(new Date(iso)).toDateString()
  assert.equal(day('2026-10-19T09:00:00'), new Date('2026-10-16T00:00:00').toDateString(), 'segunda olha a sexta')
  assert.equal(day('2026-10-16T09:00:00'), new Date('2026-10-15T00:00:00').toDateString(), 'sexta olha a quinta')
  assert.equal(day('2026-10-18T09:00:00'), new Date('2026-10-16T00:00:00').toDateString(), 'domingo olha a sexta')
  assert.equal(lastWorkday(new Date('2026-10-16T15:30:00')).getHours(), 0, 'começa à meia-noite')

  const tmp = mkdtempSync(join(tmpdir(), 'ws-daily-'))
  // The test machine's ~/.gitconfig must not lend an identity to the clone that has none
  process.env.GIT_CONFIG_GLOBAL = join(tmp, 'gitconfig-vazio')
  process.env.GIT_CONFIG_NOSYSTEM = '1'
  try {
    const commit = (cwd: string, email: string, msg: string) =>
      run('git', ['-C', cwd, '-c', `user.email=${email}`, '-c', 'user.name=X', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', msg])
    const mine = join(tmp, 'grupo', 'api')
    const anon = join(tmp, 'grupo', 'sem-identidade')
    for (const repo of [mine, anon]) {
      mkdirSync(repo, { recursive: true })
      await run('git', ['-C', repo, 'init', '--initial-branch=main'])
    }
    await run('git', ['-C', mine, 'config', 'user.email', 'eu@empresa.com'])
    await commit(mine, 'eu@empresa.com', 'feat: meu commit')
    await commit(mine, 'outra@empresa.com', 'fix: commit de outra pessoa')
    await commit(mine, 'eu@empresa.com.br', 'chore: e-mail parecido não é o meu')
    await run('git', ['-C', mine, 'checkout', '-q', '-b', 'feat/lado'])
    await commit(mine, 'eu@empresa.com', 'feat: em outra branch')
    writeFileSync(join(anon, 'x'), '')

    const summary = await dailySummary(new Date(Date.now() - 60 * 60_000), [tmp])
    assert.equal(summary.repos.length, 1)
    assert.equal(summary.repos[0].relPath, 'grupo/api')
    assert.deepEqual(summary.repos[0].commits.map(c => c.subject).sort(), ['feat: em outra branch', 'feat: meu commit'])
    assert.equal(summary.noIdentity, 1, 'clone sem user.email é contado, não lido com a identidade de outro')
    assert.equal((await dailySummary(new Date(Date.now() + 60 * 60_000), [tmp])).repos.length, 0, 'nada depois da data')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  console.log('repos daily selfcheck: ok')
}
