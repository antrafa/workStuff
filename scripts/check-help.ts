// Autoteste da ajuda: toda tela do menu (e Configurações) tem texto de ajuda completo.
// node scripts/check-help.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HELP, helpFor } from '../src/app/help.ts'

// Lê as rotas do menu pelo texto do nav.ts: importá-lo puxaria os ícones do React.
const paths = [...readFileSync(new URL('../src/app/nav.ts', import.meta.url), 'utf-8').matchAll(/path: '([^']+)'/g)].map(m => m[1])
assert.ok(paths.length >= 20, `só ${paths.length} rotas lidas do menu`)
for (const p of [...paths, '/configuracoes']) {
  const h = HELP[p]
  assert.ok(h, `tela ${p} sem ajuda em src/app/help.ts`)
  assert.ok(h.purpose.length > 40, `${p}: propósito curto demais`)
  assert.ok(h.steps.length >= 2, `${p}: poucos passos`)
}
assert.equal(helpFor('/cluster/doctor'), HELP['/cluster'], 'subrota usa a ajuda da tela')
assert.equal(helpFor('/upgrade/kubeconfigs'), HELP['/upgrade'])
assert.equal(helpFor('/inexistente'), null)
console.log(`check-help: ok (${paths.length + 1} telas)`)
