// Descobre os itens de IA nas pastas escolhidas e classifica cada um por uma regra única.
// Autoteste: node server/lib/catalog/discover.ts --selfcheck

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { parseFrontmatter } from './frontmatter.ts'

export type Kind = 'skill' | 'prompt' | 'rule' | 'persona' | 'template' | 'nota'

export type DiscoveredItem = {
  id: string
  kind: Kind
  slug: string
  title: string
  description: string
  usage: string | null
  apply: string | null
  path: string
  mainFile: string
  root: string
  relPath: string
  lines: number
  updatedAt: string
}

// Prefixo do nome do arquivo, convenção comum de catálogos de IA (rule-clean-code.md).
const PREFIX: Record<string, Kind> = { 'rule-': 'rule', 'persona-': 'persona', 'template-': 'template', 'prompt-': 'prompt' }
// Nome da pasta que contém o arquivo (rules/, personas/…).
const FOLDER: Record<string, Kind> = {
  rules: 'rule', rule: 'rule', personas: 'persona', persona: 'persona',
  templates: 'template', template: 'template', prompts: 'prompt', prompt: 'prompt',
}
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'target', 'graphify-out'])
const IGNORED_FILES = new Set(['readme.md', 'changelog.md', 'license.md', 'agents.md', 'claude.md'])
// Profundidade suficiente para root/tipo/arquivo e root/grupo/skill/SKILL.md, sem varrer um repositório inteiro.
const MAX_DEPTH = 4

const idOf = (path: string) => createHash('sha1').update(path).digest('hex').slice(0, 12)

// Ordem da regra: skill > prefixo do arquivo > pasta do tipo > frontmatter (prompt) > sem frontmatter (nota).
export function classifyFile(fileName: string, parentDir: string, hasFrontmatter: boolean): { kind: Kind; slug: string } {
  const base = fileName.replace(/\.md$/i, '')
  for (const [prefix, kind] of Object.entries(PREFIX)) {
    if (base.startsWith(prefix)) return { kind, slug: base.slice(prefix.length) }
  }
  const byFolder = FOLDER[parentDir.toLowerCase()]
  if (byFolder) return { kind: byFolder, slug: base }
  return { kind: hasFrontmatter ? 'prompt' : 'nota', slug: base }
}

function toItem(root: string, path: string, mainFile: string, kind: Kind, slug: string): DiscoveredItem {
  const content = readFileSync(mainFile, 'utf-8')
  const fm = parseFrontmatter(content)
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return {
    id: idOf(path),
    kind,
    slug,
    title: fm.titulo || fm.title || (kind === 'nota' && heading) || slug,
    description: fm.description || fm.descricao || '',
    usage: fm.triggers || fm['usar-quando'] || null,
    apply: fm.apply || null,
    path,
    mainFile,
    root,
    relPath: relative(root, path),
    lines: content.split('\n').length,
    updatedAt: statSync(mainFile).mtime.toISOString(),
  }
}

function walk(root: string, dir: string, depth: number, out: DiscoveredItem[]) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    const stat = statSync(full, { throwIfNoEntry: false })
    if (!stat) continue // link quebrado

    if (stat.isDirectory()) {
      if (IGNORED_DIRS.has(name)) continue
      const skillFile = join(full, 'SKILL.md')
      if (existsSync(skillFile)) {
        out.push(toItem(root, full, skillFile, 'skill', name))
        continue // o conteúdo da skill (references/, scripts/) pertence a ela
      }
      if (depth < MAX_DEPTH) walk(root, full, depth + 1, out)
      continue
    }

    if (!name.toLowerCase().endsWith('.md') || IGNORED_FILES.has(name.toLowerCase())) continue
    const hasFrontmatter = Object.keys(parseFrontmatter(readFileSync(full, 'utf-8'))).length > 0
    const { kind, slug } = classifyFile(name, basename(dir), hasFrontmatter)
    out.push(toItem(root, full, full, kind, slug))
  }
}

export type Discovery = { items: DiscoveredItem[]; missingRoots: string[] }

// Uma pasta que sumiu não derruba as outras: vai para missingRoots e a tela avisa qual foi.
export function discover(roots: string[]): Discovery {
  const items: DiscoveredItem[] = []
  const missingRoots: string[] = []
  for (const root of roots) {
    if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
      missingRoots.push(root)
      continue
    }
    walk(root, root, 1, items)
  }
  return { items, missingRoots }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.deepEqual(classifyFile('rule-clean-code.md', 'rules', true), { kind: 'rule', slug: 'clean-code' })
  assert.deepEqual(classifyFile('persona-sre.md', 'qualquer', false), { kind: 'persona', slug: 'sre' })
  assert.deepEqual(classifyFile('revisao.md', 'prompts', false), { kind: 'prompt', slug: 'revisao' })
  assert.deepEqual(classifyFile('ideias.md', 'notas', false), { kind: 'nota', slug: 'ideias' })
  assert.deepEqual(classifyFile('resumo.md', 'coisas', true), { kind: 'prompt', slug: 'resumo' })

  const root = mkdtempSync(join(tmpdir(), 'catalog-'))
  const file = (p: string, content: string) => {
    mkdirSync(join(root, p, '..'), { recursive: true })
    writeFileSync(join(root, p), content)
  }
  file('rules/rule-react.md', '---\nname: react\ndescription: Componentes pequenos\n---\n# react')
  file('personas/persona-sre.md', '---\ndescription: SRE\n---\n')
  file('skills/revisar-pr/SKILL.md', '---\nname: revisar-pr\ndescription: Revisa MR\n---\n')
  file('skills/revisar-pr/references/guia.md', 'não é item: pertence à skill')
  file('ideias.md', '# Ideias do painel\nsoltas')
  file('README.md', 'ignorado')
  file('node_modules/x/rule-y.md', 'ignorado')

  const { items, missingRoots } = discover([root, join(root, 'nao-existe')])
  const summary = items.map(i => `${i.kind}:${i.slug}`).sort()
  assert.deepEqual(summary, ['nota:ideias', 'persona:sre', 'rule:react', 'skill:revisar-pr'])
  assert.equal(items.find(i => i.kind === 'nota')?.title, 'Ideias do painel')
  assert.equal(items.find(i => i.kind === 'rule')?.description, 'Componentes pequenos')
  assert.deepEqual(missingRoots, [join(root, 'nao-existe')])
  rmSync(root, { recursive: true })

  console.log('discover selfcheck: ok')
}
