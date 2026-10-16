// Autoteste da escolha do clone na tela Comparar ambientes: node scripts/check-compare.ts
import assert from 'node:assert/strict'
import { guessClone } from '../src/features/compare/guessClone.ts'

const clones = ['/ws/produto/pedidos-api', '/ws/produto/pedidos-api-legado', '/ws/produto/portal-web', '/ws/infra/helm-charts']
assert.equal(guessClone(['pedidos-api', 'app'], clones), '/ws/produto/pedidos-api', 'nome igual ganha')
assert.equal(guessClone(['pedidos-api-deployment', 'app'], clones), '/ws/produto/pedidos-api', 'prefixo: o caminho mais curto ganha')
assert.equal(guessClone(['portal', 'nginx'], clones), '/ws/produto/portal-web')
assert.equal(guessClone(['Portal_Web'], clones), '/ws/produto/portal-web', 'ignora maiúscula e separador')
assert.equal(guessClone(['redis'], clones), null, 'sem parecido, não chuta')
assert.equal(guessClone(['x'], []), null)
console.log('check-compare: ok')
