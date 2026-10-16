// Text search across every clone of the workspace ("where else is this variable read?"), with git grep:
// it follows each repository's .gitignore, skips binary files and needs nothing installed. Read-only.
// Selfcheck: node server/lib/repos/search.ts --selfcheck

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { mapLimit } from '../concurrency.ts'
import { say } from '../i18n.ts'
import { run, runHead } from '../run.ts'
import { RepoError } from './sources.ts'
import { listWorkspaceRepos } from './workspace.ts'

export type SearchHit = { file: string; line: number; text: string }
export type RepoHits = { name: string; path: string; relPath: string; hits: SearchHit[]; truncated: boolean }
export type SearchQuery = { text: string; regex?: boolean; matchCase?: boolean; paths?: string }
export type SearchResult = { repos: RepoHits[]; searched: number; failed: { path: string; error: string }[] }

const MAX_HITS_PER_REPO = 200
// git 2.34 (Ubuntu 22.04) has no grep --max-count: the output is cut by size instead
const MAX_BYTES_PER_REPO = 256 * 1024
const MAX_LINE = 300
const MIN_TEXT = 2

// file\0line\0text, the shape of `git grep -n --null`: a name with ":" or spaces stays whole
export function parseGrep(output: string): SearchHit[] {
  const hits: SearchHit[] = []
  for (const row of output.split('\n')) {
    const [file, line, ...rest] = row.split('\0')
    if (!file || !line || !/^\d+$/.test(line)) continue
    hits.push({ file, line: Number(line), text: rest.join('\0').slice(0, MAX_LINE) })
  }
  return hits
}

export function grepArgs(query: SearchQuery): string[] {
  const text = query.text.trim()
  if (text.length < MIN_TEXT) throw new RepoError(say({ en: `type at least ${MIN_TEXT} characters`, pt: `digite pelo menos ${MIN_TEXT} caracteres` }))
  const pathspecs = (query.paths ?? '').split(/[\s,]+/).filter(Boolean)
  // A pathspec starting with "-" would be read as an option, and ":(" magic can reach outside the clone
  if (pathspecs.some(p => p.startsWith('-') || p.startsWith(':'))) throw new RepoError(say({ en: 'invalid file filter', pt: 'filtro de arquivo inválido' }))
  return [
    // --untracked: a file not committed yet is the user's work too; ignored ones still stay out
    'grep', '--untracked', '-n', '-I', '--null', '--no-color',
    query.regex ? '-E' : '-F',
    ...(query.matchCase ? [] : ['-i']),
    '-e', text, '--', ...pathspecs,
  ]
}

async function searchRepo(repoPath: string, workspace: string, args: string[]): Promise<RepoHits> {
  const { stdout, truncated } = await runHead('git', ['-C', repoPath, ...args], MAX_BYTES_PER_REPO, 20_000, [0, 1])
  // When cut, the last row may be half a line: it is dropped by the parser's line-number check
  const hits = parseGrep(stdout)
  return {
    name: basename(repoPath),
    path: repoPath,
    relPath: relative(workspace, repoPath) || basename(repoPath),
    hits: hits.slice(0, MAX_HITS_PER_REPO),
    truncated: truncated || hits.length > MAX_HITS_PER_REPO,
  }
}

export async function searchClones(query: SearchQuery, roots?: string[]): Promise<SearchResult> {
  const args = grepArgs(query)
  const clones = listWorkspaceRepos(roots)
  const failed: SearchResult['failed'] = []
  const found = await mapLimit(clones, 6, async ({ repoPath, workspace }) => {
    try {
      return await searchRepo(repoPath, workspace, args)
    } catch (e) {
      // An invalid regex fails in every clone with the same message: shown once, by the route
      // git's own reason, without the command line that carries the full path
      const message = (e as Error).message
      failed.push({ path: repoPath, error: message.includes('fatal: ') ? message.slice(message.lastIndexOf('fatal: ') + 7).trim() : message })
      return null
    }
  })
  return {
    repos: found.filter((r): r is RepoHits => Boolean(r?.hits.length)).sort((a, b) => b.hits.length - a.hits.length),
    searched: clones.length,
    failed,
  }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.deepEqual(parseGrep('a b.txt\x001\x00x: foo\nsrc/c.ts\x0012\x00const foo = 1\ncortad'), [
    { file: 'a b.txt', line: 1, text: 'x: foo' },
    { file: 'src/c.ts', line: 12, text: 'const foo = 1' },
  ], 'nome com espaço e dois-pontos fica inteiro; linha cortada sai')
  assert.deepEqual(grepArgs({ text: 'DB_URL' }).slice(-4), ['-i', '-e', 'DB_URL', '--'])
  assert.ok(grepArgs({ text: 'a.b', regex: true, matchCase: true }).includes('-E'))
  assert.ok(!grepArgs({ text: 'ab', matchCase: true }).includes('-i'))
  assert.deepEqual(grepArgs({ text: 'ab', paths: '*.yml, src/' }).slice(-2), ['*.yml', 'src/'])
  assert.throws(() => grepArgs({ text: ' a ' }), /at least 2/)
  assert.throws(() => grepArgs({ text: 'ab', paths: '--output=x' }), /invalid file filter/)
  assert.throws(() => grepArgs({ text: 'ab', paths: ':(top)../x' }), /invalid file filter/)

  const tmp = mkdtempSync(join(tmpdir(), 'ws-search-'))
  try {
    const git = (cwd: string, args: string[]) =>
      run('git', ['-C', cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args])
    const api = join(tmp, 'grupo', 'api')
    const web = join(tmp, 'grupo', 'web')
    for (const repo of [api, web]) {
      mkdirSync(repo, { recursive: true })
      await git(repo, ['init', '--initial-branch=main'])
    }
    writeFileSync(join(api, 'app.yml'), 'datasource:\n  url: ${DB_URL}\n')
    writeFileSync(join(api, '.gitignore'), 'target/\n')
    mkdirSync(join(api, 'target'))
    writeFileSync(join(api, 'target', 'copia.yml'), 'url: ${DB_URL}\n')
    writeFileSync(join(web, 'index.ts'), 'export const nada = 1\n')

    const found = await searchClones({ text: 'db_url' }, [tmp])
    assert.equal(found.searched, 2)
    assert.deepEqual(found.repos.map(r => [r.relPath, r.hits]), [['grupo/api', [{ file: 'app.yml', line: 2, text: '  url: ${DB_URL}' }]]], 'o que o .gitignore ignora não aparece')
    assert.equal((await searchClones({ text: 'db_url', matchCase: true }, [tmp])).repos.length, 0)
    assert.equal((await searchClones({ text: 'DB_URL', paths: '*.ts' }, [tmp])).repos.length, 0)
    assert.equal((await searchClones({ text: 'url:\\s+\\$', regex: true }, [tmp])).repos.length, 1)
    assert.equal((await searchClones({ text: 'nada' }, [tmp])).repos[0].name, 'web')
    const broken = await searchClones({ text: '(ab', regex: true }, [tmp])
    assert.equal(broken.failed.length, 2, 'regex inválida vira erro por clone, sem derrubar a busca')
    assert.ok(!broken.failed[0].error.includes('grep --untracked'), 'o motivo do git, sem a linha de comando')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  console.log('repos search selfcheck: ok')
}
