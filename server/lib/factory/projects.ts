// Factory projects: a folder chosen or created by the developer, grouping its ideas and tasks.
// Autoteste: node server/lib/factory/projects.ts --selfcheck

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { DATA_DIR } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { run } from '../run.ts'
import { say } from '../i18n.ts'
import type { FactoryProject, FactoryProjectView, FactoryTask, ProjectRepo } from './types.ts'

const ID = /^[0-9a-f-]{36}$/
const FOLDER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'target', 'dist', 'build'])

export class ProjectError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function isInside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

// The root itself when it is a repository, plus repositories up to two levels below it
// (backend/ and frontend/ side by side, or apps/<name>/).
export function discoverRepos(root: string, depth = 2): ProjectRepo[] {
  const repos: ProjectRepo[] = []
  const walk = (dir: string, level: number) => {
    if (existsSync(join(dir, '.git'))) repos.push({ name: basename(dir), path: dir })
    if (level >= depth) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
      walk(join(dir, e.name), level + 1)
    }
  }
  walk(resolve(root), 0)
  return repos
}

// Tasks with no project whose repository lives under the project folder.
export function adoptableTasks(project: Pick<FactoryProject, 'rootPath'>, tasks: FactoryTask[]): FactoryTask[] {
  return tasks.filter(t => !t.projectId && isInside(project.rootPath, t.source.repoPath))
}

// Creates <parent>/<folder>, optionally as a git repository with an empty first commit: a worktree
// needs a commit to branch from. Never touches a folder that already exists.
export async function createProjectFolder(parent: string, folder: string, gitInit: boolean): Promise<string> {
  if (!isAbsolute(parent) || !existsSync(parent) || !statSync(parent).isDirectory()) {
    throw new ProjectError(say({ en: `parent folder not found: ${parent}`, pt: `pasta pai não encontrada: ${parent}` }))
  }
  if (!FOLDER_NAME.test(folder)) {
    throw new ProjectError(say({ en: 'folder name: letters, digits, dot, dash and underscore only', pt: 'nome da pasta: só letras, dígitos, ponto, hífen e sublinhado' }))
  }
  const target = join(parent, folder)
  if (existsSync(target)) throw new ProjectError(say({ en: `the folder already exists: ${target}`, pt: `a pasta já existe: ${target}` }), 409)
  mkdirSync(target)
  if (!gitInit) return target
  try {
    await run('git', ['-C', target, 'init', '--initial-branch=main'])
    await run('git', ['-C', target, 'commit', '--allow-empty', '-m', 'chore: initial commit'])
  } catch (e) {
    throw new ProjectError(say({ en: `folder created at ${target}, but git failed: ${(e as Error).message}`, pt: `pasta criada em ${target}, mas o git falhou: ${(e as Error).message}` }), 500)
  }
  return target
}

export function createProjectStore(baseDir: string = join(DATA_DIR, 'factory', 'projects')) {
  const dirOf = (id: string) => {
    if (!ID.test(id)) throw new ProjectError(say({ en: 'invalid project', pt: 'projeto inválido' }))
    return join(baseDir, id)
  }
  const fileOf = (id: string) => join(dirOf(id), 'project.json')

  const view = (p: FactoryProject): FactoryProjectView => {
    const missing = !existsSync(p.rootPath)
    return { ...p, missing, repos: missing ? [] : discoverRepos(p.rootPath) }
  }

  function readAll(): FactoryProject[] {
    if (!existsSync(baseDir)) return []
    return readdirSync(baseDir)
      .filter(id => ID.test(id) && existsSync(join(baseDir, id, 'project.json')))
      .map(id => readJson<FactoryProject>(join(baseDir, id, 'project.json'), null as never))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  return {
    dirOf,

    list(): FactoryProjectView[] {
      return readAll().map(view)
    },

    get(id: string): FactoryProjectView {
      const file = fileOf(id)
      if (!existsSync(file)) throw new ProjectError(say({ en: 'project not found', pt: 'projeto não encontrado' }), 404)
      return view(readJson<FactoryProject>(file, null as never))
    },

    create(input: { name: string; rootPath: string } & Partial<Pick<FactoryProject, 'provider' | 'model' | 'verifyCommand'>>): FactoryProjectView {
      const name = input.name.trim()
      const rootPath = resolve(input.rootPath.trim())
      if (!name) throw new ProjectError(say({ en: 'the project needs a name', pt: 'o projeto precisa de um nome' }))
      if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
        throw new ProjectError(say({ en: `folder not found: ${rootPath}`, pt: `pasta não encontrada: ${rootPath}` }))
      }
      const taken = readAll().find(p => p.rootPath === rootPath)
      if (taken) throw new ProjectError(say({ en: `the folder already belongs to the project "${taken.name}"`, pt: `a pasta já pertence ao projeto "${taken.name}"` }), 409)
      const now = new Date().toISOString()
      const project: FactoryProject = { id: randomUUID(), name, rootPath, provider: input.provider, model: input.model, verifyCommand: input.verifyCommand, createdAt: now, updatedAt: now }
      mkdirSync(dirOf(project.id), { recursive: true })
      writeJson(fileOf(project.id), project)
      return view(project)
    },

    update(id: string, patch: Partial<Pick<FactoryProject, 'name' | 'provider' | 'model' | 'verifyCommand'>>): FactoryProjectView {
      const current = this.get(id)
      const { repos: _r, missing: _m, ...stored } = current
      const next: FactoryProject = { ...stored, ...patch, name: patch.name?.trim() || stored.name, updatedAt: new Date().toISOString() }
      writeJson(fileOf(id), next)
      return view(next)
    },

    // Removes the project's data (ideas included) from the data dir; the folder itself is never touched.
    remove(id: string): void {
      this.get(id)
      rmSync(dirOf(id), { recursive: true, force: true })
    },
  }
}

export const defaultProjectStore = createProjectStore()

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const tmp = mkdtempSync(join(tmpdir(), 'workstuff-projects-test-'))
  try {
    const store = createProjectStore(join(tmp, 'data'))
    const root = join(tmp, 'work')
    for (const dir of ['backend/.git', 'frontend/.git', 'node_modules/lib/.git', '.cache/x/.git', 'apps/admin/.git', 'a/b/c/.git']) {
      mkdirSync(join(root, dir), { recursive: true })
    }
    const names = discoverRepos(root).map(r => r.name).sort()
    assert.deepEqual(names, ['admin', 'backend', 'frontend'], 'até dois níveis, sem node_modules nem pastas ocultas')
    writeFileSync(join(root, '.git'), 'gitdir: x')
    assert.ok(discoverRepos(root).some(r => r.path === root), 'a raiz entra quando é repositório (worktree inclusive)')

    assert.deepEqual(store.list(), [])
    const p = store.create({ name: ' Painel ', rootPath: root })
    assert.equal(p.name, 'Painel')
    assert.equal(p.repos.length, 4)
    assert.throws(() => store.create({ name: 'Outro', rootPath: root }), /Painel/, 'mesma pasta não vira dois projetos')
    assert.throws(() => store.create({ name: 'X', rootPath: join(tmp, 'nada') }), ProjectError)
    assert.throws(() => store.get('../etc'), /inválido|invalid/, 'id fora do formato é recusado')

    assert.equal(store.update(p.id, { name: 'Painel 2', verifyCommand: 'npm test' }).name, 'Painel 2')
    assert.equal(store.get(p.id).verifyCommand, 'npm test')

    const task = (id: string, repoPath: string, projectId?: string) => ({ id, projectId, source: { type: 'manual', repoPath } }) as FactoryTask
    const adopt = adoptableTasks(p, [task('a', join(root, 'backend')), task('b', join(tmp, 'outro')), task('c', root, 'x'), task('d', `${root}-irmao`)])
    assert.deepEqual(adopt.map(t => t.id), ['a'], 'só avulsas dentro da pasta (pasta irmã com prefixo igual não conta)')

    store.remove(p.id)
    assert.deepEqual(store.list(), [])
    assert.ok(existsSync(root), 'excluir o projeto não apaga a pasta')

    const created = await createProjectFolder(tmp, 'novo-app', false)
    assert.ok(existsSync(created))
    await assert.rejects(createProjectFolder(tmp, 'novo-app', false), /existe|exists/)
    await assert.rejects(createProjectFolder(tmp, '../fora', false), /nome|name/)
    await assert.rejects(createProjectFolder('relativo', 'x', false), /pai|parent/)

    console.log('factory projects selfcheck: ok')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
