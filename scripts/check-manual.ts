// Autoteste do manual: toda tela do menu tem página nos dois idiomas, com a mesma estrutura, e os
// links entre páginas apontam para páginas e telas que existem.
// node scripts/check-manual.ts
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { MANUAL_PAGES, MANUAL_ROUTE, manualSlugFor } from '../src/app/manual.ts'
import { NAV } from '../src/app/nav.ts'

const dir = new URL('../docs/manual/', import.meta.url)
const LANGS = ['en', 'pt'] as const
const slugs = new Set(MANUAL_PAGES.map(p => p.slug))
const routes = new Set([...NAV.flatMap(g => g.items.map(i => i.path)), '/configuracoes'])

for (const route of routes) {
  if (route !== MANUAL_ROUTE) assert.ok(MANUAL_PAGES.some(p => p.route === route), `tela ${route} sem página no manual`)
}

const headings = (md: string) => md.replace(/```[\s\S]*?```/g, '').split('\n').filter(l => l.startsWith('## '))

for (const page of MANUAL_PAGES) {
  const texts = LANGS.map(lang => {
    const file = new URL(`${lang}/${page.slug}.md`, dir)
    assert.ok(existsSync(file), `docs/manual/${lang}/${page.slug}.md não existe`)
    return readFileSync(file, 'utf-8')
  })
  texts.forEach((md, i) => {
    const where = `docs/manual/${LANGS[i]}/${page.slug}.md`
    const lines = md.split('\n')
    assert.match(lines[0], /^# \S/, `${where}: a primeira linha é o título (# ...)`)
    // The paragraph under the title is what the screen is for: the first thing anyone reads
    const purpose = lines.slice(1).find(l => l.trim())
    assert.ok(purpose && !purpose.startsWith('#') && purpose.length > 40, `${where}: falta o parágrafo de propósito logo abaixo do título`)
    assert.ok(headings(md).length >= 2, `${where}: poucas seções (##)`)
    for (const [, target] of md.matchAll(/\]\((\/[^)#\s]*)/g)) {
      if (target.startsWith(MANUAL_ROUTE + '/')) assert.ok(slugs.has(target.slice(MANUAL_ROUTE.length + 1)), `${where}: link para página inexistente ${target}`)
      else assert.ok(routes.has(target) || [...routes].some(r => r !== '/' && target.startsWith(r + '/')), `${where}: link para tela inexistente ${target}`)
    }
  })
  // Same sections in both languages: a section added in one must be translated in the other
  assert.equal(headings(texts[0]).length, headings(texts[1]).length, `${page.slug}: número de seções (##) diferente entre en e pt`)
}

for (const lang of LANGS) {
  for (const name of readdirSync(new URL(`${lang}/`, dir))) {
    assert.ok(slugs.has(name.replace(/\.md$/, '')), `docs/manual/${lang}/${name} não está em src/app/manual.ts`)
  }
}

assert.equal(manualSlugFor('/cluster/doctor'), 'cluster', 'subrota usa a página da tela')
assert.equal(manualSlugFor('/configuracoes/ia'), 'configuracoes')
assert.equal(manualSlugFor('/'), 'inicio')
assert.equal(manualSlugFor('/documentacao/cluster'), null, 'a própria documentação não tem botão de ajuda')
assert.equal(manualSlugFor('/inexistente'), null)
console.log(`check-manual: ok (${MANUAL_PAGES.length} páginas em ${LANGS.length} idiomas)`)
