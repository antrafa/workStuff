// Ideas of a project: idea.json holds the state, idea.md is the living document rendered from it.
// Autoteste: node server/lib/ideation/store.ts --selfcheck

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DATA_DIR } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { say } from '../i18n.ts'
import { ProjectError } from '../factory/projects.ts'
import { DOC_SECTIONS, type ExecutableTask, type Idea, type MasterTask } from './types.ts'

const ID = /^[0-9a-f-]{36}$/

const list = (title: string, items: string[]) => (items.length ? `**${title}:**\n${items.map(i => `- ${i}`).join('\n')}` : '')

function masterMd(m: MasterTask): string {
  return [
    `### ${m.key} · ${m.title}${m.walkingSkeleton ? ' (walking skeleton)' : ''}`,
    m.objective,
    `Repositórios: ${[...m.repos].join(', ')}${m.dependsOn.length ? ` · depende de ${m.dependsOn.join(', ')}` : ''}`,
    list('No escopo', m.inScope),
    list('Fora do escopo', m.outOfScope),
    m.scenarios.length ? '```gherkin\n' + m.scenarios.join('\n\n') + '\n```' : '',
  ].filter(Boolean).join('\n\n')
}

function taskMd(t: ExecutableTask, dispatchedId?: string): string {
  return [
    `#### ${t.key} · ${t.title}`,
    `\`${t.repo}\` · ${t.stack}${t.dependsOn.length ? ` · depende de ${t.dependsOn.join(', ')}` : ''}${dispatchedId ? ` · na fábrica: ${dispatchedId}` : ''}`,
    t.objective,
    list('No escopo', t.inScope),
    list('Fora do escopo', t.outOfScope),
    list('Contratos com as irmãs', t.contracts),
  ].filter(Boolean).join('\n\n')
}

export function renderIdeaMarkdown(idea: Idea): string {
  const parts = [`# ${idea.title}`, `Fase: ${idea.phase} · Atualizado: ${idea.updatedAt.slice(0, 16).replace('T', ' ')}`]
  for (const [key, title] of DOC_SECTIONS) {
    const body = idea.doc[key]?.trim()
    if (body) parts.push(`## ${title}\n\n${body}`)
  }
  if (idea.masters?.length) parts.push(`## Plano: tarefas master\n\n${idea.masters.map(masterMd).join('\n\n')}`)
  if (idea.tasks?.length) parts.push(`## Tarefas executáveis\n\n${idea.tasks.map(t => taskMd(t, idea.dispatched?.[t.key])).join('\n\n')}`)
  return parts.join('\n\n') + '\n'
}

export function createIdeaStore(projectsDir: string = join(DATA_DIR, 'factory', 'projects')) {
  const ideasDir = (projectId: string) => {
    if (!ID.test(projectId)) throw new ProjectError(say({ en: 'invalid project', pt: 'projeto inválido' }))
    return join(projectsDir, projectId, 'ideas')
  }
  const dirOf = (projectId: string, id: string) => {
    if (!ID.test(id)) throw new ProjectError(say({ en: 'invalid idea', pt: 'ideia inválida' }))
    return join(ideasDir(projectId), id)
  }

  return {
    list(projectId: string): Idea[] {
      const dir = ideasDir(projectId)
      if (!existsSync(dir)) return []
      return readdirSync(dir)
        .filter(id => ID.test(id) && existsSync(join(dir, id, 'idea.json')))
        .map(id => readJson<Idea>(join(dir, id, 'idea.json'), null as never))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    get(projectId: string, id: string): Idea {
      const file = join(dirOf(projectId, id), 'idea.json')
      if (!existsSync(file)) throw new ProjectError(say({ en: 'idea not found', pt: 'ideia não encontrada' }), 404)
      return readJson<Idea>(file, null as never)
    },

    create(projectId: string, title: string, text: string): Idea {
      const now = new Date().toISOString()
      const idea: Idea = { id: randomUUID(), projectId, title: title.trim(), phase: 'explore', doc: { original: text.trim() }, turns: [], createdAt: now, updatedAt: now }
      if (!idea.title) throw new ProjectError(say({ en: 'the idea needs a title', pt: 'a ideia precisa de um título' }))
      if (!text.trim()) throw new ProjectError(say({ en: 'describe the idea', pt: 'descreva a ideia' }))
      this.save(idea)
      return idea
    },

    save(idea: Idea): Idea {
      const dir = dirOf(idea.projectId, idea.id)
      mkdirSync(dir, { recursive: true })
      const next = { ...idea, updatedAt: new Date().toISOString() }
      writeJson(join(dir, 'idea.json'), next)
      writeFileSync(join(dir, 'idea.md'), renderIdeaMarkdown(next), 'utf-8')
      return next
    },

    markdown(projectId: string, id: string): string {
      return readFileSync(join(dirOf(projectId, id), 'idea.md'), 'utf-8')
    },

    remove(projectId: string, id: string): void {
      this.get(projectId, id)
      rmSync(dirOf(projectId, id), { recursive: true, force: true })
    },
  }
}

export const defaultIdeaStore = createIdeaStore()

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const tmp = mkdtempSync(join(tmpdir(), 'workstuff-ideas-test-'))
  try {
    const store = createIdeaStore(tmp)
    const pid = randomUUID()
    assert.deepEqual(store.list(pid), [])
    assert.throws(() => store.create(pid, '', 'x'), /título|title/)
    const idea = store.create(pid, 'Custo por cliente', 'Quero ver o custo de cada cluster por cliente')
    assert.equal(idea.phase, 'explore')
    assert.equal(store.list(pid).length, 1)

    store.save({ ...idea, doc: { ...idea.doc, problem: 'Ninguém sabe quanto cada cliente custa' }, masters: [{ key: 'M1', title: 'Coleta', objective: 'Ler custos', inScope: ['a'], outOfScope: [], repos: ['api'], scenarios: ['Dado X quando Y então Z'], dependsOn: [], walkingSkeleton: true }] })
    const md = store.markdown(pid, idea.id)
    assert.match(md, /## Problema real\n\nNinguém sabe/)
    assert.match(md, /### M1 · Coleta \(walking skeleton\)/)
    assert.ok(!md.includes('## Público'), 'seção vazia não aparece')

    assert.throws(() => store.get(pid, '../x'), /inválida|invalid/)
    store.remove(pid, idea.id)
    assert.deepEqual(store.list(pid), [])
    console.log('ideation store selfcheck: ok')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
