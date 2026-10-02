// Relatórios gerados, um por projeto, em ~/.workstuff/analysis/history.json.
// Autoteste (repo git temporário): node server/lib/analysis/store.ts --selfcheck

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { dataFile, expandHome, tildify } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { run } from '../run.ts'
import { reportFileName, sanitizeReport } from './prompts.ts'

export type ReportEntry = {
  report: string
  generatedAt: string
  gitCommit: string | null
  provider: string
  model: string
  durationMs: number
}

const DIR = dataFile('analysis')
const HISTORY = join(DIR, 'history.json')
export const REPORT_DIR = join('docs', 'arquitetura')

export const readHistory = () => readJson<Record<string, ReportEntry>>(HISTORY, {})

export function saveEntry(projectPath: string, entry: ReportEntry) {
  mkdirSync(DIR, { recursive: true })
  writeJson(HISTORY, { ...readHistory(), [projectPath]: entry })
}

export function deleteEntry(projectPath: string) {
  const history = readHistory()
  if (!(projectPath in history)) return false
  delete history[projectPath]
  writeJson(HISTORY, history)
  return true
}

export class AnalysisError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

// Caminho do projeto vindo da tela: absoluto (ou ~) e diretório existente. É o cwd do agente.
export function resolveProject(input: unknown) {
  if (typeof input !== 'string' || !input.trim()) throw new AnalysisError('informe a pasta do projeto')
  const path = expandHome(input.trim()).replace(/[\\/]+$/, '')
  if (!isAbsolute(path)) throw new AnalysisError('use o caminho absoluto da pasta (ou começando com ~)')
  if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) throw new AnalysisError(`pasta não encontrada: ${path}`)
  return path
}

// Repositório grande deixa git lento; estourar o limite só perde o atalho, não quebra nada.
const GIT_TIMEOUT = 15_000

export async function gitCommit(dir: string) {
  try {
    return (await run('git', ['-C', dir, 'rev-parse', 'HEAD'], GIT_TIMEOUT)).trim()
  } catch {
    return null // não é repositório git
  }
}

export async function commitsSince(dir: string, from: string | null) {
  if (!from) return null
  try {
    return Number((await run('git', ['-C', dir, 'rev-list', '--count', `${from}..HEAD`], GIT_TIMEOUT)).trim())
  } catch {
    return null // commit sumiu num rebase
  }
}

function latestReportFile(projectDir: string) {
  try {
    const files = readdirSync(join(projectDir, REPORT_DIR)).filter(f => f.endsWith('.md')).sort()
    return files.length ? join(REPORT_DIR, files.at(-1)!) : null
  } catch {
    return null
  }
}

export const graphHtmlPath = (projectDir: string) => join(projectDir, 'graphify-out', 'graph.html')

export async function listReports() {
  const items = await Promise.all(
    Object.entries(readHistory()).map(async ([projectPath, e]) => {
      const exists = existsSync(projectPath)
      const current = exists ? await gitCommit(projectPath) : null
      const stale = Boolean(current && e.gitCommit && current !== e.gitCommit)
      return {
        projectPath,
        pathLabel: tildify(projectPath),
        name: basename(projectPath),
        generatedAt: e.generatedAt,
        gitCommit: e.gitCommit,
        provider: e.provider,
        model: e.model,
        exists,
        stale,
        behind: stale ? await commitsSince(projectPath, e.gitCommit) : 0,
        reportFile: exists ? latestReportFile(projectPath) : null,
        hasGraph: exists && existsSync(graphHtmlPath(projectPath)),
      }
    }),
  )
  return items.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
}

// Grava <projeto>/docs/arquitetura/arquitetura-AAAA-MM-DD.md. Só roda quando o usuário pede.
export function writeReportFile(projectDir: string, entry: ReportEntry) {
  const relative = join(REPORT_DIR, reportFileName(new Date(entry.generatedAt)))
  mkdirSync(join(projectDir, REPORT_DIR), { recursive: true })
  const frontmatter = [
    '---',
    `gerado-em: ${entry.generatedAt}`,
    `commit: ${entry.gitCommit ?? '(projeto sem git)'}`,
    `gerado-por: workStuff — Análise arquitetural (${entry.provider}${entry.model ? ` · ${entry.model}` : ''})`,
    '---',
    '',
  ].join('\n')
  writeFileSync(join(projectDir, relative), frontmatter + sanitizeReport(entry.report).trim() + '\n', 'utf-8')
  return relative
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const repo = mkdtempSync(join(tmpdir(), 'analysis-repo-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stdio: 'pipe' })
  git('init', '-q')
  writeFileSync(join(repo, 'a.txt'), '1')
  git('add', '.')
  git('commit', '-qm', 'um')
  const first = await gitCommit(repo)
  assert.match(first ?? '', /^[0-9a-f]{40}$/)
  writeFileSync(join(repo, 'a.txt'), '2')
  git('commit', '-qam', 'dois')
  assert.equal(await commitsSince(repo, first), 1)
  assert.equal(await commitsSince(repo, 'deadbeef'), null, 'commit inexistente vira indeterminado')
  assert.equal(await gitCommit(tmpdir()), null, 'pasta sem git')

  assert.equal(resolveProject(repo + '/'), repo)
  assert.throws(() => resolveProject('relativo/x'), /absoluto/)
  assert.throws(() => resolveProject(join(repo, 'nao-existe')), /não encontrada/)
  assert.throws(() => resolveProject(''), /informe/)

  const rel = writeReportFile(repo, { report: 'Intro.\n# Relatório\nok', generatedAt: '2026-09-30T12:00:00.000Z', gitCommit: first, provider: 'claude', model: 'sonnet', durationMs: 1 })
  assert.equal(rel, join('docs', 'arquitetura', 'arquitetura-2026-09-30.md'))
  const written = execFileSync('cat', [join(repo, rel)], { encoding: 'utf-8' })
  assert.ok(written.startsWith('---\ngerado-em: 2026-09-30') && written.endsWith('# Relatório\nok\n'), 'frontmatter + relatório limpo')
  assert.equal(latestReportFile(repo), rel)

  rmSync(repo, { recursive: true })
  console.log('analysis store selfcheck: ok')
}
