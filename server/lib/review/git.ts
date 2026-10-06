// Git de um repositório local para a revisão antes do MR: branch atual, base padrão e o diff contra ela.
// Só leitura: nenhum comando aqui escreve no repositório.
// Autoteste (repo git temporário): node server/lib/review/git.ts --selfcheck

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from '../run.ts'
import { say } from '../i18n.ts'

// Diff acima disso não cabe com folga no contexto da IA junto com a leitura dos arquivos.
export const MAX_DIFF = 150_000

const git = (repo: string, args: string[]) => run('git', ['-C', repo, ...args], 30_000)

// Referência vinda da tela: nome de branch, tag, origin/x ou HEAD~n. Nada começando com "-".
const REF = /^[A-Za-z0-9][A-Za-z0-9._/~^-]{0,199}$/
export const validRef = (r: string) => REF.test(r) && !r.includes('..')

export const originUrl = (repo: string) => git(repo, ['remote', 'get-url', 'origin']).then(u => u.trim() || undefined, () => undefined)

export async function repoInfo(repo: string) {
  const inside = (await git(repo, ['rev-parse', '--is-inside-work-tree']).catch(() => '')).trim()
  if (inside !== 'true') throw new Error(say({ en: 'the folder is not a git repository', pt: 'a pasta não é um repositório git' }))
  const current = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  // origin/HEAD aponta para a branch padrão do remoto (main, master, develop…), sem supor nome.
  const originHead = (await git(repo, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']).catch(() => '')).trim()
  const branches = (await git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes']))
    .split('\n').map(b => b.trim()).filter(b => b && b !== 'origin/HEAD' && b !== 'origin')
  const fallback = ['origin/main', 'origin/master', 'main', 'master', 'origin/develop', 'develop'].find(b => branches.includes(b) && b !== current)
  const dirty = (await git(repo, ['status', '--porcelain'])).trim().split('\n').filter(Boolean).length
  return { current, defaultBase: originHead || fallback || null, branches, dirty }
}

export type Diff = { base: string; mergeBase: string; stat: string; diff: string; truncated: boolean; files: number }

// base...HEAD: só o que a branch trouxe desde que saiu da base. Com includeWorking, o que ainda não
// foi commitado entra junto (diff do merge-base contra a árvore de trabalho).
export async function branchDiff(repo: string, base: string, includeWorking: boolean): Promise<Diff> {
  if (!validRef(base)) throw new Error(say({ en: 'invalid base branch', pt: 'branch base inválida' }))
  await git(repo, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).catch(() => {
    throw new Error(say({ en: `the base branch ${base} does not exist in this repository (run git fetch if it is remote)`, pt: `a branch base ${base} não existe neste repositório (faça git fetch se ela for remota)` }))
  })
  const mergeBase = (await git(repo, ['merge-base', base, 'HEAD'])).trim()
  const range = includeWorking ? [mergeBase] : [`${mergeBase}`, 'HEAD']
  const [stat, full, names] = await Promise.all([
    git(repo, ['diff', '--stat', ...range]),
    git(repo, ['diff', '--no-color', '-U5', ...range]),
    git(repo, ['diff', '--name-only', ...range]),
  ])
  const files = names.split('\n').filter(Boolean).length
  return { base, mergeBase: mergeBase.slice(0, 10), stat: stat.trim(), diff: full.slice(0, MAX_DIFF), truncated: full.length > MAX_DIFF, files }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  for (const ok of ['main', 'origin/develop', 'release/2.3', 'HEAD~3', 'v1.2.0']) assert.ok(validRef(ok), ok)
  for (const bad of ['--output=/tmp/x', '-p', 'a..b', 'main;rm', '']) assert.ok(!validRef(bad), bad)

  const repo = mkdtempSync(join(tmpdir(), 'review-git-'))
  const sh = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' })
  try {
    sh('init', '-q', '-b', 'main')
    sh('config', 'user.email', 't@t'), sh('config', 'user.name', 't')
    writeFileSync(join(repo, 'a.txt'), 'um\n')
    sh('add', '.'), sh('commit', '-qm', 'base')
    sh('checkout', '-qb', 'feature')
    writeFileSync(join(repo, 'a.txt'), 'um\ndois\n')
    sh('commit', '-qam', 'muda a')
    writeFileSync(join(repo, 'b.txt'), 'novo\n')
    sh('add', 'b.txt')

    const info = await repoInfo(repo)
    assert.equal(info.current, 'feature')
    assert.equal(info.defaultBase, 'main', 'sem origin, cai na main local')
    assert.equal(info.dirty, 1)

    const committed = await branchDiff(repo, 'main', false)
    assert.equal(committed.files, 1, 'só o commit da branch')
    assert.match(committed.diff, /\+dois/)
    const withWorking = await branchDiff(repo, 'main', true)
    assert.equal(withWorking.files, 2, 'inclui o que está no índice')
    await assert.rejects(branchDiff(repo, 'nao-existe', false), /does not exist|não existe/)
    await assert.rejects(repoInfo(tmpdir()), /not a git repository|não é um repositório/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
  console.log('review git selfcheck: ok')
}
