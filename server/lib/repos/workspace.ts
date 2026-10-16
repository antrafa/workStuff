// Radar de Workspace Local: varre as pastas de workspace configuradas (e projetos da Fábrica),
// inspeciona o estado Git de cada repositório clonado (branch, dirty, stash, ahead/behind, branches
// já mergeadas) e mede artefatos pesados de build (target/, node_modules/, dist/, build/).
// Autoteste: node server/lib/repos/workspace.ts --selfcheck

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { defaultProjectStore } from '../factory/projects.ts'
import { say } from '../i18n.ts'
import { expandHome, tildify } from '../paths.ts'
import { run } from '../run.ts'
import { listSources, RepoError } from './sources.ts'

const exec = promisify(execFile)

export type ArtifactDir = 'target' | 'node_modules' | 'dist' | 'build'

export type WorkspaceRepo = {
  name: string
  path: string
  relPath: string
  workspace: string
  workspaceLabel: string
  branch: string
  dirtyCount: number
  stashCount: number
  ahead: number
  behind: number
  lastCommitAt: string | null
  lastCommitSubject: string | null
  mergedBranches: string[]
  artifactDirs: ArtifactDir[]
  artifactBytes: number
}

const ARTIFACT_DIRS: ArtifactDir[] = ['target', 'node_modules', 'dist', 'build']
const SKIP_WALK = new Set(['.git', 'node_modules', 'target', 'dist', 'build', 'vendor', '.gradle', '.next', '.cache'])
const PROTECTED_BRANCHES = new Set(['main', 'master', 'develop', 'dev', 'homolog', 'staging', 'production'])
const SAFE_BRANCH = /^[A-Za-z0-9._/-]+$/

export function isInsideRoot(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function knownWorkspaces(explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) {
    return [...new Set(explicit.map(w => resolve(expandHome(w)))).values()].filter(w => existsSync(w))
  }
  const set = new Set<string>()
  for (const s of listSources()) {
    if (s.workspace) {
      const p = resolve(expandHome(s.workspace))
      if (existsSync(p)) set.add(p)
    }
  }
  for (const p of defaultProjectStore.list()) {
    if (p.rootPath && !p.missing) {
      const root = resolve(expandHome(p.rootPath))
      if (existsSync(root)) set.add(root)
    }
  }
  return [...set]
}

export function assertWorkspaceRepo(repoPath: string, roots?: string[]): string {
  const resolved = resolve(expandHome(repoPath.trim()))
  const allowed = knownWorkspaces(roots)
  if (!allowed.some(r => isInsideRoot(r, resolved))) {
    throw new RepoError(say({
      en: 'repository is outside the configured workspaces',
      pt: 'o repositório está fora das pastas de workspace configuradas',
    }), 403)
  }
  if (!existsSync(join(resolved, '.git'))) {
    throw new RepoError(say({
      en: `not a git repository: ${resolved}`,
      pt: `não é um repositório git: ${resolved}`,
    }), 404)
  }
  return resolved
}

function findGitRepos(root: string, maxDepth = 4): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    if (existsSync(join(dir, '.git'))) {
      found.push(dir)
      return
    }
    if (depth >= maxDepth) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_WALK.has(e.name)) continue
      walk(join(dir, e.name), depth + 1)
    }
  }
  walk(resolve(root), 0)
  return found
}

// Mede o tamanho de uma pasta de build com limite de entradas para nunca travar o processo.
function measureDirBytes(dir: string, maxEntries = 6_000): number {
  let bytes = 0
  let visited = 0
  const stack = [dir]
  while (stack.length > 0 && visited < maxEntries) {
    const cur = stack.pop()!
    let entries
    try {
      entries = readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      visited++
      if (visited >= maxEntries) break
      const full = join(cur, e.name)
      try {
        if (e.isDirectory()) {
          stack.push(full)
        } else if (e.isFile()) {
          bytes += statSync(full).size
        }
      } catch {
        // symlink quebrado ou arquivo removido durante leitura
      }
    }
  }
  return bytes
}

function measureArtifacts(repoPath: string): { artifactDirs: ArtifactDir[]; artifactBytes: number } {
  const artifactDirs: ArtifactDir[] = []
  let artifactBytes = 0
  for (const name of ARTIFACT_DIRS) {
    const sub = join(repoPath, name)
    try {
      if (existsSync(sub) && statSync(sub).isDirectory()) {
        artifactDirs.push(name)
        artifactBytes += measureDirBytes(sub)
      }
    } catch {
      // ignora erro de permissão
    }
  }
  return { artifactDirs, artifactBytes }
}

async function gitQuiet(repoPath: string, args: string[], timeoutMs = 8_000): Promise<string> {
  try {
    return (await run('git', ['-C', repoPath, ...args], timeoutMs)).trim()
  } catch {
    return ''
  }
}

async function inspectRepo(repoPath: string, workspace: string): Promise<WorkspaceRepo> {
  const [branchRaw, porcelain, stashRaw, logLine, mergedRaw] = await Promise.all([
    gitQuiet(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']),
    gitQuiet(repoPath, ['status', '--porcelain']),
    gitQuiet(repoPath, ['stash', 'list']),
    gitQuiet(repoPath, ['log', '-1', '--format=%cI%x09%s']),
    gitQuiet(repoPath, ['branch', '--merged']),
  ])

  const branch = branchRaw || 'HEAD'
  const dirtyCount = porcelain ? porcelain.split('\n').filter(Boolean).length : 0
  const stashCount = stashRaw ? stashRaw.split('\n').filter(Boolean).length : 0

  let ahead = 0
  let behind = 0
  const counts =
    (await gitQuiet(repoPath, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])) ||
    (await gitQuiet(repoPath, ['rev-list', '--left-right', '--count', 'HEAD...origin/main'])) ||
    (await gitQuiet(repoPath, ['rev-list', '--left-right', '--count', 'HEAD...origin/master']))
  if (counts) {
    const [a, b] = counts.split(/\s+/).map(Number)
    if (Number.isFinite(a) && Number.isFinite(b)) {
      ahead = a
      behind = b
    }
  }

  let lastCommitAt: string | null = null
  let lastCommitSubject: string | null = null
  if (logLine && logLine.includes('\t')) {
    const idx = logLine.indexOf('\t')
    lastCommitAt = logLine.slice(0, idx).trim() || null
    lastCommitSubject = logLine.slice(idx + 1).trim() || null
  }

  const mergedBranches = mergedRaw
    .split('\n')
    .map(l => l.replace(/^[*+]?\s+/, '').trim())
    .filter(b => b && b !== branch && !PROTECTED_BRANCHES.has(b) && !b.startsWith('(') && SAFE_BRANCH.test(b))

  const { artifactDirs, artifactBytes } = measureArtifacts(repoPath)
  const rel = relative(workspace, repoPath)

  return {
    name: basename(repoPath),
    path: repoPath,
    relPath: rel || basename(repoPath),
    workspace,
    workspaceLabel: tildify(workspace),
    branch,
    dirtyCount,
    stashCount,
    ahead,
    behind,
    lastCommitAt,
    lastCommitSubject,
    mergedBranches,
    artifactDirs,
    artifactBytes,
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const idx = next++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export async function scanWorkspace(explicitRoots?: string[]) {
  const roots = knownWorkspaces(explicitRoots)
  const seen = new Set<string>()
  const queue: { repoPath: string; workspace: string }[] = []

  for (const workspace of roots) {
    for (const repoPath of findGitRepos(workspace)) {
      if (seen.has(repoPath)) continue
      seen.add(repoPath)
      queue.push({ repoPath, workspace })
    }
  }

  const repos = await mapLimit(queue, 6, ({ repoPath, workspace }) => inspectRepo(repoPath, workspace))
  // Ordena priorizando repositórios com alterações pendentes/stash e depois pelo commit mais recente
  repos.sort((a, b) => {
    const scoreA = (a.dirtyCount > 0 ? 2 : 0) + (a.stashCount > 0 ? 1 : 0)
    const scoreB = (b.dirtyCount > 0 ? 2 : 0) + (b.stashCount > 0 ? 1 : 0)
    if (scoreA !== scoreB) return scoreB - scoreA
    const timeA = a.lastCommitAt ? Date.parse(a.lastCommitAt) : 0
    const timeB = b.lastCommitAt ? Date.parse(b.lastCommitAt) : 0
    if (timeA !== timeB) return timeB - timeA
    return a.name.localeCompare(b.name)
  })

  return {
    workspaces: roots.map(w => ({ path: w, label: tildify(w) })),
    repos,
  }
}

export async function fetchWorkspaceRepo(repoPath: string, roots?: string[]) {
  const dir = assertWorkspaceRepo(repoPath, roots)
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    GIT_TERMINAL_PROMPT: '0',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10',
  }
  try {
    await exec('git', ['-C', dir, 'fetch', '--prune', '--quiet'], { env, timeout: 45_000 })
    return inspectRepo(dir, knownWorkspaces(roots).find(w => isInsideRoot(w, dir)) ?? dir)
  } catch (e) {
    const msg = ((e as { stderr?: string }).stderr ?? (e as Error).message).trim()
    throw new RepoError(say({ en: `git fetch failed: ${msg}`, pt: `git fetch falhou: ${msg}` }))
  }
}

export async function pruneMergedBranches(repoPath: string, roots?: string[]) {
  const dir = assertWorkspaceRepo(repoPath, roots)
  const workspace = knownWorkspaces(roots).find(w => isInsideRoot(w, dir)) ?? dir
  const info = await inspectRepo(dir, workspace)
  const deleted: string[] = []
  for (const b of info.mergedBranches) {
    if (!SAFE_BRANCH.test(b) || PROTECTED_BRANCHES.has(b)) continue
    try {
      await run('git', ['-C', dir, 'branch', '-d', b], 10_000)
      deleted.push(b)
    } catch {
      // ignora branch que o git recusou apagar com -d
    }
  }
  return { deleted, repo: await inspectRepo(dir, workspace) }
}

export async function cleanRepoArtifacts(repoPath: string, dirs?: string[], roots?: string[]) {
  const dir = assertWorkspaceRepo(repoPath, roots)
  const workspace = knownWorkspaces(roots).find(w => isInsideRoot(w, dir)) ?? dir
  const targets = (dirs?.length ? dirs : ARTIFACT_DIRS).filter((d): d is ArtifactDir => ARTIFACT_DIRS.includes(d as ArtifactDir))
  let freedBytes = 0
  const cleaned: ArtifactDir[] = []

  for (const name of targets) {
    const sub = join(dir, name)
    if (existsSync(sub) && statSync(sub).isDirectory()) {
      freedBytes += measureDirBytes(sub)
      rmSync(sub, { recursive: true, force: true })
      cleaned.push(name)
    }
  }
  return { cleaned, freedBytes, repo: await inspectRepo(dir, workspace) }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const tmp = mkdtempSync(join(tmpdir(), 'ws-workspace-radar-'))
  try {
    const repoA = join(tmp, 'produto', 'api-pagamentos')
    const repoB = join(tmp, 'produto', 'portal-web')
    mkdirSync(repoA, { recursive: true })
    mkdirSync(repoB, { recursive: true })

    const git = (cwd: string, args: string[]) =>
      run('git', ['-C', cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args])

    await git(repoA, ['init', '--initial-branch=main'])
    writeFileSync(join(repoA, '.gitignore'), 'target/\n')
    writeFileSync(join(repoA, 'pom.xml'), '<project/>')
    await git(repoA, ['add', '.gitignore', 'pom.xml'])
    await git(repoA, ['commit', '-m', 'chore: init'])

    // Cria branch e faz merge na main para aparecer como mergedBranch
    await git(repoA, ['checkout', '-b', 'feat/antiga'])
    writeFileSync(join(repoA, 'feature.txt'), 'ok')
    await git(repoA, ['add', 'feature.txt'])
    await git(repoA, ['commit', '-m', 'feat: antiga'])
    await git(repoA, ['checkout', 'main'])
    await git(repoA, ['merge', '--no-ff', 'feat/antiga', '-m', 'merge feat/antiga'])

    // Cria um stash e um arquivo dirty + pasta target/
    writeFileSync(join(repoA, 'pom.xml'), '<project>stash</project>')
    await git(repoA, ['stash', 'push', '-m', 'wip'])
    writeFileSync(join(repoA, 'dirty.txt'), 'alterado')
    mkdirSync(join(repoA, 'target'), { recursive: true })
    writeFileSync(join(repoA, 'target', 'app.jar'), Buffer.alloc(4096, 1))

    // Repo B limpo
    await git(repoB, ['init', '--initial-branch=main'])
    writeFileSync(join(repoB, 'index.ts'), 'export {}')
    await git(repoB, ['add', 'index.ts'])
    await git(repoB, ['commit', '-m', 'chore: init web'])

    const scan = await scanWorkspace([tmp])
    assert.equal(scan.repos.length, 2)
    assert.equal(scan.repos[0].name, 'api-pagamentos', 'repo com dirty/stash vem primeiro')
    assert.equal(scan.repos[0].branch, 'main')
    assert.equal(scan.repos[0].dirtyCount, 1)
    assert.equal(scan.repos[0].stashCount, 1)
    assert.deepEqual(scan.repos[0].mergedBranches, ['feat/antiga'])
    assert.deepEqual(scan.repos[0].artifactDirs, ['target'])
    assert.equal(scan.repos[0].artifactBytes, 4096)

    // Prune merged branches
    const pruned = await pruneMergedBranches(repoA, [tmp])
    assert.deepEqual(pruned.deleted, ['feat/antiga'])
    assert.deepEqual(pruned.repo.mergedBranches, [])

    // Clean artifacts
    const cleaned = await cleanRepoArtifacts(repoA, ['target'], [tmp])
    assert.deepEqual(cleaned.cleaned, ['target'])
    assert.equal(cleaned.freedBytes, 4096)
    assert.equal(cleaned.repo.artifactBytes, 0)
    assert.ok(existsSync(join(repoA, 'dirty.txt')), 'arquivos do repositório continuam intactos')

    // Fora do workspace é recusado
    assert.throws(() => assertWorkspaceRepo('/etc', [tmp]), /outside|fora/)

    console.log('workspace radar selfcheck: ok')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
