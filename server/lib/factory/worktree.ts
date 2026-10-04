// Gerenciamento de Git Worktrees para isolamento seguro do desenvolvimento da Fábrica.
// Autoteste: node server/lib/factory/worktree.ts --selfcheck

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { DATA_DIR } from '../paths.ts'
import { run } from '../run.ts'
import type { DiffStat } from './types.ts'

const git = (dir: string, args: string[], timeoutMs = 30_000) => run('git', ['-C', dir, ...args], timeoutMs)

export async function createWorktree(
  repoPath: string,
  taskId: string,
  baseBranch: string,
  worktreesRoot: string = join(DATA_DIR, 'worktrees'),
): Promise<{ worktreePath: string; branchName: string }> {
  if (!existsSync(repoPath)) throw new Error(`repositorio nao encontrado no caminho: ${repoPath}`)

  const repoName = basename(repoPath)
  const targetDir = join(worktreesRoot, repoName, taskId)
  const branchName = `factory/${taskId}`

  mkdirSync(join(worktreesRoot, repoName), { recursive: true })

  // Se a pasta já existir por resíduo anterior, remove
  if (existsSync(targetDir)) {
    await removeWorktree(repoPath, targetDir, branchName).catch(() => {})
    rmSync(targetDir, { recursive: true, force: true })
  }

  // Verifica se a branch já existe
  const branchExists = await git(repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`])
    .then(() => true)
    .catch(() => false)

  if (branchExists) {
    await git(repoPath, ['worktree', 'add', targetDir, branchName])
  } else {
    await git(repoPath, ['worktree', 'add', '-b', branchName, targetDir, baseBranch])
  }

  return { worktreePath: targetDir, branchName }
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  branchName?: string,
): Promise<void> {
  try {
    await git(repoPath, ['worktree', 'remove', worktreePath, '--force'])
  } catch {
    // Se falhar o comando do git, garante a remoção do diretório físico
  }

  if (existsSync(worktreePath)) {
    rmSync(worktreePath, { recursive: true, force: true })
  }

  try {
    await git(repoPath, ['worktree', 'prune'])
  } catch {
    // ignora
  }

  if (branchName) {
    try {
      await git(repoPath, ['branch', '-D', branchName])
    } catch {
      // ignora se a branch já não existir
    }
  }
}

export async function getWorktreeDiff(
  worktreePath: string,
  baseBranch: string,
): Promise<{ diff: string; stat: DiffStat }> {
  if (!existsSync(worktreePath)) {
    return {
      diff: '',
      stat: { filesChanged: 0, insertions: 0, deletions: 0, files: [] },
    }
  }

  // Diff consolidado da branch base contra a árvore atual (incluindo staging e working dir)
  const mergeBase = (await git(worktreePath, ['merge-base', baseBranch, 'HEAD']).catch(() => baseBranch)).trim()
  const diff = await git(worktreePath, ['diff', mergeBase], 40_000).catch(() => '')
  const numstat = await git(worktreePath, ['diff', '--numstat', mergeBase]).catch(() => '')

  let insertions = 0
  let deletions = 0
  const files: string[] = []

  for (const line of numstat.split('\n').filter(Boolean)) {
    const [ins, del, file] = line.split('\t')
    if (file) {
      files.push(file)
      insertions += ins === '-' ? 0 : Number(ins || 0)
      deletions += del === '-' ? 0 : Number(del || 0)
    }
  }

  return {
    diff,
    stat: {
      filesChanged: files.length,
      insertions,
      deletions,
      files,
    },
  }
}

export async function commitWorktree(
  worktreePath: string,
  message: string,
): Promise<string | null> {
  if (!existsSync(worktreePath)) return null
  await git(worktreePath, ['add', '-A'])
  const status = (await git(worktreePath, ['status', '--porcelain'])).trim()
  if (!status) {
    return (await git(worktreePath, ['rev-parse', 'HEAD'])).trim()
  }
  await git(worktreePath, ['commit', '-m', message])
  return (await git(worktreePath, ['rev-parse', 'HEAD'])).trim()
}

export async function mergeWorktreeLocal(
  repoPath: string,
  branchName: string,
  targetBranch: string,
): Promise<void> {
  await git(repoPath, ['checkout', targetBranch])
  await git(repoPath, ['merge', '--no-ff', branchName, '-m', `Merge branch '${branchName}' via workstuff fabrica`])
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const tmp = mkdtempSync(join(tmpdir(), 'workstuff-wt-test-'))
  const repoDir = join(tmp, 'repo')
  const wtRootDir = join(tmp, 'wts')

  mkdirSync(repoDir, { recursive: true })
  mkdirSync(wtRootDir, { recursive: true })

  const sh = (...args: string[]) => execFileSync('git', ['-C', repoDir, ...args], { stdio: 'pipe' })

  try {
    sh('init', '-b', 'main')
    sh('config', 'user.name', 'Workstuff Test')
    sh('config', 'user.email', 'test@workstuff.local')
    writeFileSync(join(repoDir, 'README.md'), '# Repo de Teste\n')
    sh('add', 'README.md')
    sh('commit', '-m', 'chore: commit inicial')

    // Criação de worktree
    const { worktreePath, branchName } = await createWorktree(repoDir, 'wt-task-1', 'main', wtRootDir)
    assert.ok(existsSync(worktreePath), 'worktree criada')
    assert.equal(branchName, 'factory/wt-task-1')

    // Modificação na worktree
    writeFileSync(join(worktreePath, 'app.ts'), 'console.log("hello world")\n')
    const commitHash = await commitWorktree(worktreePath, 'feat: adiciona app.ts')
    assert.ok(commitHash, 'commit gerado')

    // Verificação de diff
    const { diff, stat } = await getWorktreeDiff(worktreePath, 'main')
    assert.ok(diff.includes('hello world'), 'diff contem adicoes')
    assert.equal(stat.filesChanged, 1)
    assert.equal(stat.insertions, 1)
    assert.deepEqual(stat.files, ['app.ts'])

    // Remoção da worktree
    await removeWorktree(repoDir, worktreePath, branchName)
    assert.ok(!existsSync(worktreePath), 'worktree removida')

    console.log('factory worktree selfcheck: ok')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
