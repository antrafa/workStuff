// Gerenciamento de Git Worktrees para isolamento seguro do desenvolvimento da Fábrica.
// Autoteste: node server/lib/factory/worktree.ts --selfcheck

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { DATA_DIR } from '../paths.ts'
import { run } from '../run.ts'
import type { DiffStat } from './types.ts'

const git = (dir: string, args: string[], timeoutMs = 30_000) => run('git', ['-C', dir, ...args], timeoutMs)

// Symlinked from the user's repo so builds and tests start fast in the worktree.
const DEP_DIRS = ['node_modules', '.venv', 'venv']

export function linkWorkspaceDependencies(repoPath: string, worktreePath: string): void {
  for (const dir of DEP_DIRS) {
    const src = join(repoPath, dir)
    const dest = join(worktreePath, dir)
    if (existsSync(src) && !existsSync(dest)) {
      try {
        symlinkSync(src, dest, 'dir')
      } catch {
        // ignora se o sistema de arquivos não suportar symlink
      }
    }
  }
}

function unlinkSafeDependencies(worktreePath: string): void {
  for (const dir of DEP_DIRS) {
    const target = join(worktreePath, dir)
    try {
      if (existsSync(target) || lstatSync(target).isSymbolicLink()) {
        if (lstatSync(target).isSymbolicLink()) {
          unlinkSync(target)
        }
      }
    } catch {
      // ignora se não existir
    }
  }
}

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

  // Vincula dependências instaladas do repositório original para acelerar testes e build
  linkWorkspaceDependencies(repoPath, targetDir)

  return { worktreePath: targetDir, branchName }
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  branchName?: string,
): Promise<void> {
  // Desvincula symlinks antes de apagar a pasta da worktree
  unlinkSafeDependencies(worktreePath)

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
  // A `node_modules/` ignore rule matches directories only, not our symlink: without the
  // exclusion `git add -A` commits the link and it ends up in the MR.
  await git(worktreePath, ['add', '-A', '--', '.', ...DEP_DIRS.map(d => `:(exclude)${d}`)])
  // Staged changes only: the untracked dependency symlink always shows up in `status`
  const staged = (await git(worktreePath, ['diff', '--cached', '--name-only'])).trim()
  if (!staged) {
    return (await git(worktreePath, ['rev-parse', 'HEAD'])).trim()
  }
  await git(worktreePath, ['commit', '-m', message])
  return (await git(worktreePath, ['rev-parse', 'HEAD'])).trim()
}

// Files changed since the last commit, dependency symlinks left out.
export async function uncommittedFiles(worktreePath: string): Promise<string[]> {
  const status = await git(worktreePath, ['status', '--porcelain', '--untracked-files=all', '--', '.', ...DEP_DIRS.map(d => `:(exclude)${d}`)])
  return status.split('\n').filter(Boolean).map(l => l.slice(3).replace(/^.* -> /, '').trim())
}

// Throws away uncommitted changes to these files: tracked ones go back to HEAD, new ones are deleted.
export async function discardFiles(worktreePath: string, files: string[]): Promise<void> {
  for (const file of files) {
    const tracked = await git(worktreePath, ['ls-files', '--error-unmatch', '--', file]).then(() => true, () => false)
    if (tracked) await git(worktreePath, ['checkout', 'HEAD', '--', file])
    else rmSync(join(worktreePath, file), { force: true })
  }
}

export async function pushWorktreeBranch(
  worktreePath: string,
  branchName: string,
  remote = 'origin',
): Promise<string> {
  return await git(worktreePath, ['push', '-u', remote, branchName])
}

export async function mergeWorktreeLocal(
  repoPath: string,
  branchName: string,
  targetBranch: string,
): Promise<void> {
  // 1. Verifica se o repositório principal tem alterações não salvas
  const dirty = (await git(repoPath, ['status', '--porcelain'])).trim()
  if (dirty) {
    throw new Error('O repositório principal possui alterações pendentes não commitadas. Faça commit ou stash antes de mesclar.')
  }

  // 2. Guarda a branch original do usuário
  const currentBranch = (await git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()

  try {
    if (currentBranch !== targetBranch) {
      await git(repoPath, ['checkout', targetBranch])
    }
    await git(repoPath, ['merge', '--no-ff', branchName, '-m', `Merge branch '${branchName}' via workstuff fabrica`])
  } catch (err) {
    await git(repoPath, ['merge', '--abort']).catch(() => {})
    throw err
  } finally {
    // Se o usuário estava em outra branch diferente de targetBranch, restaura
    if (currentBranch && currentBranch !== targetBranch) {
      await git(repoPath, ['checkout', currentBranch]).catch(() => {})
    }
  }
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
    writeFileSync(join(repoDir, '.gitignore'), 'node_modules/\n.venv/\n')
    sh('add', 'README.md', '.gitignore')
    sh('commit', '-m', 'chore: commit inicial')

    // Criação de worktree com simulação de node_modules
    mkdirSync(join(repoDir, 'node_modules', 'fake-pkg'), { recursive: true })
    writeFileSync(join(repoDir, 'node_modules', 'fake-pkg', 'index.js'), 'module.exports = 42\n')

    const { worktreePath, branchName } = await createWorktree(repoDir, 'wt-task-1', 'main', wtRootDir)
    assert.ok(existsSync(worktreePath), 'worktree criada')
    assert.equal(branchName, 'factory/wt-task-1')

    // Confere se o symlink de node_modules foi criado na worktree
    assert.ok(existsSync(join(worktreePath, 'node_modules', 'fake-pkg', 'index.js')), 'node_modules acessivel na worktree via symlink')

    // Modificação na worktree
    writeFileSync(join(worktreePath, 'app.ts'), 'console.log("hello world")\n')
    const commitHash = await commitWorktree(worktreePath, 'feat: adiciona app.ts')
    assert.ok(commitHash, 'commit gerado')
    assert.equal(await commitWorktree(worktreePath, 'nada novo'), commitHash, 'sem mudança staged, não tenta commit vazio')

    // Descarte seletivo (portão do Documenter)
    writeFileSync(join(worktreePath, 'app.ts'), 'mexido\n')
    writeFileSync(join(worktreePath, 'novo.ts'), 'x\n')
    writeFileSync(join(worktreePath, 'NOTES.md'), 'doc\n')
    assert.deepEqual((await uncommittedFiles(worktreePath)).sort(), ['NOTES.md', 'app.ts', 'novo.ts'], 'sem o symlink de node_modules')
    await discardFiles(worktreePath, ['app.ts', 'novo.ts'])
    assert.deepEqual(await uncommittedFiles(worktreePath), ['NOTES.md'], 'só a documentação sobrevive')
    rmSync(join(worktreePath, 'NOTES.md'))

    // Verificação de diff
    const { diff, stat } = await getWorktreeDiff(worktreePath, 'main')
    assert.ok(diff.includes('hello world'), 'diff contem adicoes')
    assert.equal(stat.filesChanged, 1)
    assert.equal(stat.insertions, 1)
    assert.deepEqual(stat.files, ['app.ts'], 'symlink de node_modules fora do commit')

    // Remoção da worktree e garantia de que o node_modules original NÃO foi apagado
    await removeWorktree(repoDir, worktreePath, branchName)
    assert.ok(!existsSync(worktreePath), 'worktree removida')
    assert.ok(existsSync(join(repoDir, 'node_modules', 'fake-pkg', 'index.js')), 'node_modules original permanece intacto no repositorio pai')

    // Teste de mergeWorktreeLocal com repositório sujo (dirty check)
    writeFileSync(join(repoDir, 'dirty.txt'), 'modificacao nao commitada\n')
    await assert.rejects(
      async () => mergeWorktreeLocal(repoDir, 'some-branch', 'main'),
      /alterações pendentes/
    )
    rmSync(join(repoDir, 'dirty.txt'))

    console.log('factory worktree selfcheck: ok')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
