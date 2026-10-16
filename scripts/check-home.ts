// Autoteste do Início: o texto do resumo para a daily. node scripts/check-home.ts
import assert from 'node:assert/strict'
import { buildDailyText } from '../src/features/dashboard/dailyText.ts'

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

console.log('check-home: ok')
