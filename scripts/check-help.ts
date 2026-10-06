// Autoteste da ajuda: toda tela do menu (e Configurações) tem texto de ajuda completo.
// node scripts/check-help.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HELP, helpFor } from '../src/app/help.ts'

// Lê as rotas do menu pelo texto do nav.ts: importá-lo puxaria os ícones do React.
const paths = [...readFileSync(new URL('../src/app/nav.ts', import.meta.url), 'utf-8').matchAll(/path: '([^']+)'/g)].map(m => m[1])
assert.ok(paths.length >= 20, `só ${paths.length} rotas lidas do menu`)
for (const p of [...paths, '/configuracoes']) {
  assert.ok(HELP[p], `tela ${p} sem ajuda em src/app/help.ts`)
  for (const lang of ['en', 'pt'] as const) {
    const h = HELP[p][lang]
    assert.ok(h.purpose.length > 40, `${p} (${lang}): propósito curto demais`)
    assert.ok(h.steps.length >= 2, `${p} (${lang}): poucos passos`)
  }
  // Same structure in both languages: a step added in one must be translated in the other
  assert.equal(HELP[p].en.steps.length, HELP[p].pt.steps.length, `${p}: passos diferentes entre en e pt`)
  assert.equal(HELP[p].en.notes.length, HELP[p].pt.notes.length, `${p}: notas diferentes entre en e pt`)
}
// tx() defaults to English outside the browser
assert.equal(helpFor('/cluster/doctor'), HELP['/cluster'].en, 'subrota usa a ajuda da tela')
assert.equal(helpFor('/upgrade/kubeconfigs'), HELP['/upgrade'].en)
assert.equal(helpFor('/inexistente'), null)
console.log(`check-help: ok (${paths.length + 1} telas)`)
