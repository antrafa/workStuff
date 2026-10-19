// What the factory learned from earlier tasks in a repository: blocking findings the Verifier confirmed,
// false positives it refuted, and the adjustments the developer had to ask for. Recorded when a task
// reaches review, recalled when the next task in the same repository is planned.
// The Mentat vault (~/.mentat) is used when it is installed, so the lessons join the rest of the
// developer's memory; otherwise they go to a local file under WORKSTUFF_HOME.
// Autoteste: node server/lib/factory/learnings.ts --selfcheck

import assert from 'node:assert/strict'
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { AGENT_HOME, DATA_DIR } from '../paths.ts'
import { run } from '../run.ts'
import type { FactoryTask, SecurityFinding } from './types.ts'

export type Lesson = { kind: 'confirmed' | 'refuted' | 'adjusted'; text: string }

export type MemoryBackend =
  | { kind: 'mentat'; vault: string; script: string }
  | { kind: 'local'; file: string }

const LOCAL_FILE = join(DATA_DIR, 'factory', 'learnings.jsonl')
// The skill folder each agent reads; the first one found wins
const MENTAT_SCRIPTS = ['.claude', '.agents', '.codex'].map(dir => join(dir, 'skills', 'mentat', 'scripts', 'vault.py'))
const MAX_LESSONS = 12
const MAX_RECALLED = 5
const MAX_BLOCK = 4_000

export function memoryBackend(home = AGENT_HOME, localFile = LOCAL_FILE): MemoryBackend {
  const vault = process.env.MENTAT_VAULT ?? join(home, '.mentat')
  const script = process.env.WORKSTUFF_MENTAT_SCRIPT ?? MENTAT_SCRIPTS.map(rel => join(home, rel)).find(existsSync)
  if (script && existsSync(join(vault, 'entries'))) return { kind: 'mentat', vault, script }
  return { kind: 'local', file: localFile }
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const findingText = (f: SecurityFinding) => clip(`${f.file ? `${f.file}${f.line !== undefined ? `:${f.line}` : ''} ` : ''}${f.description}`, 300)

export const confirmedLesson = (f: SecurityFinding): Lesson => ({ kind: 'confirmed', text: findingText(f) })
export const refutedLesson = (f: SecurityFinding): Lesson => ({ kind: 'refuted', text: `${findingText(f)} — ${clip(f.refuted ?? '', 200)}` })
export const adjustedLesson = (feedback: string): Lesson => ({ kind: 'adjusted', text: clip(feedback.trim(), 400) })

// The same finding raised in two rounds is one lesson
export function uniqueLessons(lessons: Lesson[]): Lesson[] {
  const seen = new Set<string>()
  return lessons.filter(l => l.text && !seen.has(`${l.kind}|${l.text}`) && seen.add(`${l.kind}|${l.text}`)).slice(0, MAX_LESSONS)
}

const LABEL: Record<Lesson['kind'], string> = {
  confirmed: 'Achado confirmado pela revisão',
  refuted: 'Falso positivo refutado pelo Verifier',
  adjusted: 'Ajuste que o desenvolvedor precisou pedir',
}
const lessonLine = (l: Lesson) => `- ${LABEL[l.kind]}: ${l.text}`

const projectSlug = (repoPath: string) => basename(repoPath).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'repo'

// Words of the demand worth matching against earlier lessons
function termsOf(task: Pick<FactoryTask, 'title' | 'description'>): string[] {
  const words = `${task.title} ${task.description ?? ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{4,}/g) ?? []
  return [...new Set(words)].slice(0, 12)
}

// Records the lessons of one review. Mentat failing (python missing, vault locked) must not lose them:
// they go to the local file and the caller is told where they landed.
export async function recordLessons(task: FactoryTask, lessons: Lesson[], backend = memoryBackend()): Promise<{ stored: MemoryBackend['kind']; error?: string } | null> {
  const unique = uniqueLessons(lessons)
  if (unique.length === 0) return null
  if (backend.kind === 'mentat') {
    try {
      await writeMentat(backend, task, unique)
      return { stored: 'mentat' }
    } catch (e) {
      writeLocal(LOCAL_FILE, task, unique)
      return { stored: 'local', error: `Mentat: ${(e as Error).message.split('\n')[0]}` }
    }
  }
  writeLocal(backend.file, task, unique)
  return { stored: 'local' }
}

function writeLocal(file: string, task: FactoryTask, lessons: Lesson[]) {
  mkdirSync(join(file, '..'), { recursive: true })
  appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), repo: task.source.repoPath, taskId: task.id, task: task.title, lessons }) + '\n')
}

async function writeMentat(backend: Extract<MemoryBackend, { kind: 'mentat' }>, task: FactoryTask, lessons: Lesson[]) {
  const project = projectSlug(task.source.repoPath)
  const body = [
    `# Fábrica: lições de "${task.title}"`,
    '## Insight', ...lessons.map(lessonLine),
    '## Context', `- Tarefa ${task.id} da Fábrica do workStuff no repositório [[${project}]], revisada em ${new Date().toISOString().slice(0, 10)}.`,
    '## Application', '- A Fábrica injeta estas lições no plano, na implementação e na revisão da próxima tarefa deste repositório.',
  ].join('\n\n')
  // A second review of the same task (an adjustment) is a new entry, not an overwrite of the first
  const slug = `fabrica-${project}-${task.id.slice(0, 8)}-${Date.now().toString(36)}`
  await run('python3', [backend.script, 'write', '--type', 'learning', '--slug', slug,
    '--title', clip(`Fábrica: lições de ${task.title}`, 100), '--summary', clip(lessons[0].text, 120),
    '--project', project, '--tags', 'factory/review', '--body', body], 30_000)
}

// Lessons from earlier tasks in the same repository, ranked by how much they share with this demand.
// Empty when there is nothing: the prompts then carry no block at all.
export async function recallLessons(task: FactoryTask, backend = memoryBackend()): Promise<{ text: string; from: MemoryBackend['kind'] }> {
  const lines = backend.kind === 'mentat' ? await recallMentat(backend, task).catch(() => recallLocal(LOCAL_FILE, task)) : recallLocal(backend.file, task)
  return { text: clip(lines.join('\n'), MAX_BLOCK), from: backend.kind }
}

function recallLocal(file: string, task: FactoryTask): string[] {
  if (!existsSync(file)) return []
  const terms = termsOf(task)
  const records = readFileSync(file, 'utf-8').split('\n').filter(Boolean).flatMap(line => {
    try {
      return [JSON.parse(line) as { repo: string; taskId: string; task: string; lessons: Lesson[] }]
    } catch {
      return []
    }
  })
  return records
    .map((r, order) => ({ r, order, score: terms.filter(t => JSON.stringify(r).toLowerCase().includes(t)).length }))
    .filter(({ r }) => r.repo === task.source.repoPath && r.taskId !== task.id)
    .sort((a, b) => b.score - a.score || b.order - a.order)
    .slice(0, MAX_RECALLED)
    .flatMap(({ r }) => [`Tarefa "${r.task}":`, ...r.lessons.map(lessonLine)])
}

async function recallMentat(backend: Extract<MemoryBackend, { kind: 'mentat' }>, task: FactoryTask): Promise<string[]> {
  // "fabrica" matches every factory entry by slug, so a demand sharing no word still gets the latest ones
  const out = await run('python3', [backend.script, 'search', '--project', projectSlug(task.source.repoPath), '--type', 'learning', '--json',
    '--limit', String(MAX_RECALLED), 'fabrica', ...termsOf(task)], 30_000)
  const hits = JSON.parse(out) as { slug: string; summary: string; path: string }[]
  const vault = resolve(backend.vault) + sep
  return hits.flatMap(hit => {
    // Only the Insight section, and only from a file inside the vault: the path comes from a script's output
    const path = resolve(hit.path)
    if (!path.startsWith(vault) || !existsSync(path)) return [`- ${hit.summary}`]
    const insight = readFileSync(path, 'utf-8').split(/^## /m).find(s => s.startsWith('Insight'))
    const bullets = insight?.split('\n').filter(l => l.startsWith('- ')) ?? []
    return [`${hit.slug}:`, ...(bullets.length ? bullets : [`- ${hit.summary}`])]
  })
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const dir = mkdtempSync(join(tmpdir(), 'learnings-'))
  const saved = { vault: process.env.MENTAT_VAULT, script: process.env.WORKSTUFF_MENTAT_SCRIPT }
  delete process.env.MENTAT_VAULT
  delete process.env.WORKSTUFF_MENTAT_SCRIPT
  try {
    const task = (id: string, title: string, repoPath = '/repos/My App') =>
      ({ id, title, description: '', source: { type: 'manual', repoPath } }) as unknown as FactoryTask
    const finding: SecurityFinding = { severity: 'high', file: 'src/a.ts', line: 3, description: 'token gravado no log' }

    // Without a vault the lessons stay local
    const home = join(dir, 'home')
    const local = memoryBackend(home, join(dir, 'learnings.jsonl'))
    assert.equal(local.kind, 'local')
    assert.equal(await recordLessons(task('t1', 'Login com token'), [], local), null, 'nothing to learn writes nothing')
    const lessons = [confirmedLesson(finding), confirmedLesson(finding), refutedLesson({ ...finding, refuted: 'já mascarado em b.ts' }), adjustedLesson('use o logger do projeto')]
    assert.deepEqual(await recordLessons(task('t1', 'Login com token'), lessons, local), { stored: 'local' })
    await recordLessons(task('t2', 'Tela de relatório'), [adjustedLesson('relatório em PDF')], local)
    await recordLessons(task('t3', 'Outro repo', '/repos/outro'), [adjustedLesson('não deve aparecer')], local)

    const recalled = await recallLessons(task('t9', 'Renovar o token do login'), local)
    assert.equal(recalled.from, 'local')
    assert.ok(recalled.text.indexOf('Login com token') < recalled.text.indexOf('Tela de relatório'), 'the lesson sharing words with the demand comes first')
    assert.equal(recalled.text.match(/revisão: src\/a\.ts:3 token gravado no log/g)?.length, 1, 'a finding repeated across rounds is one lesson')
    assert.match(recalled.text, /Falso positivo refutado pelo Verifier: .*já mascarado em b\.ts/)
    assert.doesNotMatch(recalled.text, /não deve aparecer/, 'lessons of another repository stay there')
    assert.equal((await recallLessons(task('t9', 'x', '/repos/terceiro'), local)).text, '', 'a repository without lessons recalls nothing')
    assert.doesNotMatch((await recallLessons(task('t1', 'Login com token'), local)).text, /Login com token/, 'a task does not recall its own lessons')

    // With a vault and the skill installed, Mentat is used: a fake vault.py records what it was asked
    const vault = join(home, '.mentat')
    mkdirSync(join(vault, 'entries'), { recursive: true })
    const script = join(home, '.claude', 'skills', 'mentat', 'scripts', 'vault.py')
    mkdirSync(join(script, '..'), { recursive: true })
    const entry = join(vault, 'entries', 'e.md')
    writeFileSync(entry, '---\ntype: learning\n---\n# x\n\n## Insight\n\n- Achado confirmado pela revisão: lição do vault\n\n## Context\n\n- fora\n')
    writeFileSync(script, [
      'import json, sys',
      `open(${JSON.stringify(join(dir, 'calls'))}, "a").write(json.dumps(sys.argv[1:]) + "\\n")`,
      `if sys.argv[1] == "search": print(json.dumps([{"slug": "e", "summary": "s", "path": ${JSON.stringify(entry)}}, {"slug": "fora", "summary": "fora do vault", "path": "/etc/passwd"}]))`,
    ].join('\n'))
    chmodSync(script, 0o755)
    const mentat = memoryBackend(home, join(dir, 'unused.jsonl'))
    assert.equal(mentat.kind, 'mentat')
    assert.deepEqual(await recordLessons(task('t4', 'Fila de e-mail'), lessons, mentat), { stored: 'mentat' })
    const fromVault = await recallLessons(task('t5', 'Fila de e-mail'), mentat)
    assert.equal(fromVault.from, 'mentat')
    assert.match(fromVault.text, /lição do vault/)
    assert.doesNotMatch(fromVault.text, /fora$/m, 'only the Insight section is recalled')
    assert.match(fromVault.text, /- fora do vault/, 'a path outside the vault falls back to the summary, unread')
    const calls = readFileSync(join(dir, 'calls'), 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l) as string[])
    assert.equal(calls[0][0], 'write')
    assert.equal(calls[0][calls[0].indexOf('--project') + 1], 'my-app')
    assert.equal(calls[0][calls[0].indexOf('--type') + 1], 'learning')
    assert.ok(calls[1].includes('fabrica') && calls[1].includes('fila'), 'search carries the demand terms')
    assert.ok(!existsSync(join(dir, 'unused.jsonl')), 'with Mentat nothing goes to the local file')
  } finally {
    if (saved.vault !== undefined) process.env.MENTAT_VAULT = saved.vault
    if (saved.script !== undefined) process.env.WORKSTUFF_MENTAT_SCRIPT = saved.script
    rmSync(dir, { recursive: true, force: true })
  }
  console.log('learnings selfcheck: ok')
}
