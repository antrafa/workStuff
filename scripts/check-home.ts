// Autoteste do Início. O campo "O que você precisa?": cada necessidade aponta para uma tela e uma
// página de manual que existem, cada atalho cai na necessidade certa, e frases soltas, em português e
// em inglês, acham a tela que resolve. E o texto do resumo para a daily. node scripts/check-home.ts
import assert from 'node:assert/strict'
import { NAV } from '../src/app/nav.ts'
import { NEEDS, PRESETS, findNeeds } from '../src/features/dashboard/needs.ts'
import { buildDailyText } from '../src/features/dashboard/dailyText.ts'

const paths = NAV.flatMap(g => g.items.map(i => i.path))
const ids = new Set<string>()
for (const need of NEEDS) {
  assert.ok(!ids.has(need.id), `necessidade repetida: ${need.id}`)
  ids.add(need.id)
  const path = need.route.split('?')[0]
  assert.ok(paths.some(p => path === p || (p !== '/' && path.startsWith(p + '/'))), `${need.id}: tela ${need.route} fora do menu`)
  assert.ok(need.steps.length > 0 && need.words.trim(), `${need.id}: sem passos ou sem palavras`)
}

const top = (q: string) => findNeeds(q)[0]?.id
const among = (q: string, n = 3) => findNeeds(q).slice(0, n).map(m => m.id)

for (const p of PRESETS) assert.equal(top(p.query), p.expect, `atalho "${p.label}" (${p.query})`)
for (const m of findNeeds('testar endpoint')) assert.ok(m.manual, `${m.id}: sem página no manual`)

const cases: [string, string][] = [
  ['chamar a api com token', 'call-endpoint'],
  ['test the API with a bearer token', 'call-endpoint'],
  ['Address already in use', 'busy-port'],
  ['where is this variable used in all projects', 'search-code'],
  ['certificado vencendo', 'certificates'],
  ['my pipeline is red', 'pipeline-failed'],
  ['como instalo o java e o maven', 'machine'],
  ['gerar cpf', 'test-data'],
  ['OOMKilled', 'pod-problem'],
  ['decodificar jwt', 'decode'],
  ['changelog entre versões', 'what-goes-to-prod'],
  ['lentidão na aplicação', 'performance'],
  ['acessar o banco do cluster', 'tunnel'],
  ['projeto legado que não conheço', 'architecture'],
]
for (const [q, id] of cases) assert.equal(top(q), id, `"${q}" deveria achar ${id}, achou ${among(q).join(', ')}`)

assert.ok(among('o que mudou entre hml e pro').includes('compare-envs'))
assert.ok(among('o que mudou entre hml e pro').includes('what-goes-to-prod'))
assert.equal(top('playbook'), 'screen:/playbooks', 'tela sem necessidade escrita ainda é achada pelo nome')
assert.deepEqual(findNeeds(''), [])
assert.deepEqual(findNeeds('de para o'), [], 'só palavras vazias não acha nada')
assert.ok(findNeeds('kafka zookeeper').length <= 5)
assert.ok(!findNeeds('docker').some(m => m.id === 'screen:/servicos'), 'a tela não repete quando uma necessidade escrita já leva a ela')

assert.equal(top('subir minha api local'), 'local-app')

const text = buildDailyText({
  since: '2026-10-15T03:00:00.000Z',
  repos: [{ name: 'pedidos-api', commits: [{ subject: 'feat: login' }, { subject: 'fix: senha' }, { subject: 'feat: login' }] }],
  openMrs: [{ ref: 'produto/pedidos-api!42', title: 'feat: login', state: 'pipeline failed' }],
  brokenPipelines: [{ project: 'portal-web', ref: 'main' }],
})
assert.match(text, /^Since \w+, 10\/15:/, 'data de início no topo')
assert.ok(text.includes('- pedidos-api: feat: login; fix: senha'), 'commit repetido (em duas branches) aparece uma vez')
assert.ok(text.includes('- produto/pedidos-api!42 feat: login (pipeline failed)'))
assert.ok(text.includes('Broken pipelines:\n- portal-web (main)'))
assert.ok(text.endsWith('Today:\n- \n\nBlockers:\n- '), 'hoje e impedimentos ficam para a pessoa')
const empty = buildDailyText({ since: '2026-10-15T03:00:00.000Z', repos: [], openMrs: [], brokenPipelines: [] })
assert.ok(empty.includes('(no commit of yours') && !empty.includes('Open MRs'), 'seção vazia some, exceto a dos commits')

console.log(`check-home: ok (${NEEDS.length} necessidades, ${PRESETS.length} atalhos)`)
