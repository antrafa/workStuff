// End-to-end check of the factory pipeline with a fake `claude` on PATH: no tokens, no real repo.
// Covers: Analyst questions stop the run, correction loop after a failed gate, review squad
// blocking finding + automatic fix round, Documenter gate discarding non-doc files.
// Run: node scripts/check-factory-pipeline.ts
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'workstuff-pipeline-'))
process.env.WORKSTUFF_HOME = join(tmp, 'home')
// Fake user home with a Claude login: the jailed agents get a copy, never the real ~/.claude
const agentHome = join(tmp, 'agent-home')
process.env.WORKSTUFF_AGENT_HOME = agentHome
mkdirSync(join(agentHome, '.claude'), { recursive: true })
writeFileSync(join(agentHome, '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'a', refreshToken: 'r' } }))

// The fake CLI answers by agent (from the system prompt) and by what the prompt asks.
const bin = join(tmp, 'bin')
mkdirSync(bin)
writeFileSync(join(bin, 'claude'), `#!/usr/bin/env node
const fs = require('fs')
const a = process.argv
const sys = a[a.indexOf('--append-system-prompt') + 1]
const prompt = a[a.indexOf('-p') + 1]
const env = o => '\`\`\`json\\n' + JSON.stringify(o) + '\\n\`\`\`'
let out
if (sys.includes('o Analyst')) {
  out = env(prompt.includes('Respostas') || !prompt.includes('AMBIGUO')
    ? { summary: 's', acceptanceCriteria: ['Dado x, quando y, então ok'], openQuestions: [] }
    : { summary: 's', acceptanceCriteria: [], openQuestions: ['Qual o limite?'] })
} else if (sys.includes('o Architect')) {
  out = '## Plano\\n1. criar feature.txt\\n' + env({ plan: 'p', targetFiles: ['feature.txt'], testScenarios: ['cen1'] })
} else if (sys.includes('o Implementer')) {
  // What the jail gave this agent: its own config home with the login, and a read-only real one
  let realWritable = true
  try { fs.writeFileSync(${JSON.stringify(join(tmp, 'agent-home', '.claude', 'settings.json'))}, '{}') } catch { realWritable = false }
  const cfg = process.env.CLAUDE_CONFIG_DIR
  fs.writeFileSync(cfg + '/jail-seen.json', JSON.stringify({ cfg, realWritable, creds: JSON.parse(fs.readFileSync(cfg + '/.credentials.json', 'utf-8')) }))
  const content = prompt.includes('bloqueiam') ? 'ok\\nX tratado\\n' : prompt.includes('NÃO passou') ? 'ok\\n' : 'bug\\n'
  fs.writeFileSync('feature.txt', content)
  out = env({ changedFiles: ['feature.txt'], commitMessage: 'feat: feature', summary: 'feito' })
} else if (sys.includes('o Tester')) {
  fs.writeFileSync('feature.test.txt', 'teste\\n')
  out = env({ testSuitePassed: true, testsRan: ['t1'], details: 'cobertura ok' })
} else if (sys.includes('o Reviewer')) {
  const second = prompt.includes('rodada anterior')
  out = env({ findings: second ? [] : [{ severity: 'high', confidence: 90, file: 'feature.txt', line: 1, description: 'falta X' }],
    criteria: [{ criterion: 'Dado x, quando y, então ok', met: true, evidence: 'feature.txt' }], mrDescription: 'rascunho', summary: 'revisado' })
} else if (sys.includes('o Security')) {
  out = env({ findings: [], summary: 'seguro' })
} else if (sys.includes('o Documenter')) {
  fs.writeFileSync('README.md', '# doc\\n')
  fs.writeFileSync('sneaky.ts', 'x\\n')
  out = env({ changedFiles: ['README.md'], mrDescription: 'descrição final' })
}
console.log(JSON.stringify({ type: 'system', session_id: 'fake-sess' }))
console.log(JSON.stringify({ type: 'result', is_error: false, result: out, total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 } }))
`)
chmodSync(join(bin, 'claude'), 0o755)
process.env.PATH = `${bin}:${process.env.PATH}`

const repo = join(tmp, 'repo')
mkdirSync(repo)
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' })
git('init', '-b', 'main')
git('config', 'user.name', 'Test')
git('config', 'user.email', 'test@local')
writeFileSync(join(repo, 'README.md'), '# repo\n')
// Like this project: `node_modules` without the slash, so the worktree's dependency symlink is ignored
writeFileSync(join(repo, '.gitignore'), 'node_modules\n')
mkdirSync(join(repo, 'node_modules'))
git('add', '.')
git('commit', '-m', 'init')

const { defaultFactoryStore: store } = await import('../server/lib/factory/store.ts')
const { planTask, buildTask } = await import('../server/lib/factory/pipeline.ts')
const { removeWorktree } = await import('../server/lib/factory/worktree.ts')
type Task = import('../server/lib/factory/types.ts').FactoryTask

const now = new Date().toISOString()
const task: Task = {
  id: 'fac-e2e', title: 'Feature AMBIGUO', description: 'd', source: { type: 'manual', repoPath: repo },
  state: 'intake', baseBranch: 'main', branchName: 'factory/fac-e2e', provider: 'claude',
  verifyCommand: 'grep -q ok feature.txt', model: 'base-model', agentModels: { architect: 'plan-model' }, createdAt: now, updatedAt: now, spans: [],
}
await store.saveTask(task)
const ctx = { taskId: task.id, signal: new AbortController().signal, send: () => {} }

try {
  const asked = await planTask(ctx, task)
  assert.equal(asked.state, 'waiting_clarification', 'dúvida do Analyst para a esteira')

  const planned = await planTask(ctx, { ...asked, clarifications: 'Respostas: 10' })
  assert.equal(planned.state, 'waiting_approval')
  assert.ok(planned.plan?.includes('criar feature.txt'))

  const done = await buildTask(ctx, planned)
  const wt = done.worktreePath!
  assert.equal(done.state, 'review')
  assert.equal(readFileSync(join(wt, 'feature.txt'), 'utf-8'), 'ok\nX tratado\n', 'correção do portão e do achado aplicadas')
  assert.ok(done.spans!.some(s => s.name.startsWith('Correção 1')), 'laço de correção registrado')
  assert.equal(done.securityReport?.passed, true, 'achado bloqueante corrigido na rodada automática')
  assert.equal(done.securityReport?.fixRounds, 1)
  assert.equal(done.qaReport?.passed, true)
  assert.ok(existsSync(join(wt, 'README.md')) && !existsSync(join(wt, 'sneaky.ts')), 'Documenter só mexe em documentação')
  assert.equal(done.handoffs?.docs?.mrDescription, 'descrição final')
  assert.ok(done.spans!.every(s => s.status !== 'running'))
  assert.ok(done.spans!.some(s => s.usage?.costUsd === 0.01), 'custo por agente registrado')
  const jailSeen = JSON.parse(readFileSync(`${wt}.agent-home/claude/jail-seen.json`, 'utf-8'))
  assert.equal(jailSeen.cfg, `${wt}.agent-home/claude`, 'agente com escrita usa a config própria da worktree')
  assert.equal(jailSeen.realWritable, false, '~/.claude real somente leitura dentro do jail')
  assert.deepEqual(jailSeen.creds, { claudeAiOauth: { accessToken: 'a' } }, 'login copiado sem o refresh token')
  const log = execFileSync('git', ['-C', wt, 'log', '--format=%s', 'main..HEAD'], { encoding: 'utf-8' })
  assert.match(log, /^docs: /m)
  assert.match(log, /^test: /m)
  assert.match(log, /^fix: corrige achados/m)
  assert.match(log, /^feat: feature/m)
  await removeWorktree(repo, wt, done.branchName)

  // Model per agent: the override goes to its agent only, the others keep the task model
  const modelOf = (agent: string) => new Set(done.spans!.filter(s => s.agentId === agent).map(s => s.model))
  assert.deepEqual(modelOf('architect'), new Set(['plan-model']))
  assert.deepEqual(modelOf('implementer'), new Set(['base-model']))

  // Budget: each fake run costs US$ 0.01; with a 0.015 cap the second run still starts
  // (0.01 spent) and the third is refused before it spends anything
  const capped: Task = { ...task, id: 'fac-budget', branchName: 'factory/fac-budget', title: 'Feature', budgetUsd: 0.015, spans: [] }
  await store.saveTask(capped)
  const cappedCtx = { ...ctx, taskId: capped.id }
  const planned2 = await planTask(cappedCtx, capped)
  await assert.rejects(buildTask(cappedCtx, planned2), /Teto de custo atingido: US\$ 0\.02 gastos de US\$ 0\.01/)
  const after = await store.getTask(capped.id)
  assert.equal(after?.spans?.filter(s => s.kind === 'agent').length, 2, 'nenhum agente começou depois do teto')
  if (after?.worktreePath) await removeWorktree(repo, after.worktreePath, after.branchName)
  console.log('factory pipeline e2e: ok')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
