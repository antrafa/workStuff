// End-to-end check of the factory pipeline with a fake `claude` on PATH: no tokens, no real repo.
// Covers: Analyst questions stop the run, correction loop after a failed gate, review squad
// blocking finding + automatic fix round, Verifier refuting a finding, Documenter gate discarding
// non-doc files, readiness (blockers and attention), rebase and verification on a base that moved.
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
// The panel sends the prompt on stdin (an argument fails with E2BIG past 128 KiB)
const prompt = fs.readFileSync(0, 'utf-8')
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
  if (prompt.includes('AJUSTE_IMPOSSIVEL')) {
    fs.writeFileSync('meio-feito.txt', 'x\\n')
    console.log(JSON.stringify({ type: 'result', is_error: false, result: env({ status: 'error', changedFiles: [], summary: 'não dá' }), total_cost_usd: 0.01 }))
    process.exit(0)
  }
  const stubborn = prompt.includes('TEIMOSO')
  const content = prompt.includes('bloqueiam') && !stubborn ? 'ok\\nX tratado\\n' : prompt.includes('NÃO passou') || stubborn ? 'ok\\n' : 'bug\\n'
  fs.writeFileSync('feature.txt', content)
  out = env({ changedFiles: ['feature.txt'], commitMessage: 'feat: feature', summary: 'feito' })
} else if (sys.includes('o Tester')) {
  fs.writeFileSync('feature.test.txt', 'teste\\n')
  out = env({ testSuitePassed: true, testsRan: ['t1'], criteriaTests: [{ id: 'CA1', tests: ['feature.test.txt'] }], details: 'cobertura ok' })
} else if (sys.includes('o Verifier')) {
  out = env({ verdicts: [{ index: 1, holds: !prompt.includes('REFUTA'), reason: 'a entrada já é validada antes' }] })
} else if (sys.includes('o Reviewer') && prompt.includes('PROSA')) {
  out = 'Revisei tudo e está certo.'
} else if (sys.includes('o Reviewer')) {
  const second = prompt.includes('rodada anterior') && !prompt.includes('TEIMOSO') && !prompt.includes('REFUTA')
  out = env({ findings: second ? [] : [{ severity: 'high', confidence: 90, file: 'feature.txt', line: 1, description: 'falta X' }],
    criteria: [{ id: 'CA1', criterion: 'Dado x, quando y, então ok', met: true, evidence: 'feature.txt' }], mrDescription: 'rascunho', summary: 'revisado' })
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

const { which } = await import('../server/lib/run.ts')
if (!(await which('bwrap'))) {
  writeFileSync(join(bin, 'bwrap'), `#!/usr/bin/env node
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
let i = 0
let cwd = process.cwd()
const env = { ...process.env }

while (i < args.length) {
  const arg = args[i]
  if (arg === '--ro-bind' || arg === '--bind' || arg === '--ro-bind-try') {
    i += 3
  } else if (arg === '--dev' || arg === '--proc' || arg === '--tmpfs') {
    i += 2
  } else if (arg === '--setenv') {
    env[args[i + 1]] = args[i + 2]
    i += 3
  } else if (arg === '--chdir') {
    cwd = args[i + 1]
    i += 2
  } else if (arg === '--unshare-pid' || arg === '--die-with-parent' || arg === '--clearenv') {
    i += 1
  } else {
    break
  }
}

const targetBin = args[i]
const targetArgs = args.slice(i + 1)
const agentDir = process.env.WORKSTUFF_AGENT_HOME ? path.join(process.env.WORKSTUFF_AGENT_HOME, '.claude') : null

if (agentDir && fs.existsSync(agentDir)) {
  try { fs.chmodSync(agentDir, 0o555) } catch {}
}

const child = spawn(targetBin, targetArgs, {
  cwd,
  env,
  stdio: ['inherit', 'pipe', 'pipe'],
})

child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)

const restore = () => {
  if (agentDir && fs.existsSync(agentDir)) {
    try { fs.chmodSync(agentDir, 0o755) } catch {}
  }
}

process.on('SIGTERM', () => {
  restore()
  child.kill('SIGTERM')
})

child.on('exit', code => {
  restore()
  process.exit(code ?? 0)
})

child.on('error', err => {
  restore()
  console.error(err)
  process.exit(1)
})
`)
  chmodSync(join(bin, 'bwrap'), 0o755)
}

process.env.PATH = `${bin}:${process.env.PATH}`

const repo = join(tmp, 'repo')
mkdirSync(repo)
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' })
git('init', '-b', 'main')
git('config', 'user.name', 'Test')
git('config', 'user.email', 'test@local')
// Cites the file the fake Implementer writes, so the Documenter has something to keep current
writeFileSync(join(repo, 'README.md'), '# repo\n\nVeja feature.txt.\n')
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
  assert.ok(done.spans!.some(s => s.name.startsWith('Fix 1')), 'laço de correção registrado')
  assert.equal(done.securityReport?.passed, true, 'achado bloqueante corrigido na rodada automática')
  assert.equal(done.securityReport?.fixRounds, 1)
  assert.equal(done.qaReport?.passed, true)
  assert.ok(existsSync(join(wt, 'README.md')) && !existsSync(join(wt, 'sneaky.ts')), 'Documenter só mexe em documentação')
  assert.equal(done.handoffs?.docs?.mrDescription, 'descrição final')
  assert.equal(done.spans!.filter(s => s.agentId === 'security').length, 2, 'Security audita a correção também')
  assert.equal(done.spans!.filter(s => s.agentId === 'reviewer').length, 2, 'Reviewer confere a correção')
  assert.equal(done.spans!.filter(s => s.agentId === 'verifier').length, 1, 'Verifier só roda quando há achado bloqueante')
  assert.equal(done.spans!.filter(s => s.agentId === 'tester').length, 2, 'Tester roda de novo depois da correção')
  assert.ok(done.spans!.findIndex(s => s.agentId === 'documenter') < done.spans!.findIndex(s => s.agentId === 'reviewer'), 'revisão lê a documentação')
  assert.deepEqual(done.qaReport?.criteria?.map(c => c.status), ['tested'], 'critério ligado a um arquivo de teste que existe')
  assert.deepEqual(done.readiness?.blockers, [], 'nada bloqueia')
  assert.ok(done.securityReport?.tools?.some(t => t.tool === 'gitleaks'), 'ferramentas de segurança registradas')
  assert.equal(done.qaReport?.baseSync?.status, 'current')
  assert.ok(done.verifiedBase, 'base verificada registrada')
  assert.ok(done.spans!.every(s => s.status !== 'running'))
  assert.ok(done.spans!.some(s => s.usage?.costUsd === 0.01), 'custo por agente registrado')
  const jailSeen = JSON.parse(readFileSync(`${wt}.agent-home/claude/jail-seen.json`, 'utf-8'))
  assert.equal(jailSeen.cfg, `${wt}.agent-home/claude`, 'agente com escrita usa a config própria da worktree')
  assert.equal(jailSeen.realWritable, false, '~/.claude real somente leitura dentro do jail')
  assert.deepEqual(jailSeen.creds, { claudeAiOauth: { accessToken: 'a' } }, 'login copiado sem o refresh token')
  const log = execFileSync('git', ['-C', wt, 'log', '--format=%s', 'main..HEAD'], { encoding: 'utf-8' })
  assert.match(log, /^docs: /m)
  assert.match(log, /^test: /m)
  assert.match(log, /^fix: address automatic review findings/m)
  assert.match(log, /^feat: feature/m)
  // The base moved after the review: the finish rebases and verifies again before merging
  const { reverifyOnNewBase } = await import('../server/lib/factory/pipeline.ts')
  writeFileSync(join(repo, 'outro.txt'), 'base andou\n')
  git('add', 'outro.txt')
  git('commit', '-m', 'feat: base andou')
  const moved = await reverifyOnNewBase(ctx, done)
  assert.equal(moved.qaReport?.baseSync?.status, 'rebased')
  assert.notEqual(moved.verifiedBase, done.verifiedBase)
  assert.ok(existsSync(join(wt, 'outro.txt')), 'branch em cima da base nova')
  assert.equal(moved.qaReport?.passed, true, 'verificação de novo sobre a base nova')
  assert.equal(await reverifyOnNewBase(ctx, moved), moved, 'base parada, nada a refazer')
  await removeWorktree(repo, wt, done.branchName)

  // Model per agent: the override goes to its agent only, the others keep the task model
  const modelOf = (agent: string) => new Set(done.spans!.filter(s => s.agentId === agent).map(s => s.model))
  assert.deepEqual(modelOf('architect'), new Set(['plan-model']))
  assert.deepEqual(modelOf('implementer'), new Set(['base-model']))

  // Failure paths that used to pass silently. Each builds a fresh task on the same repo.
  const runCase = async (id: string, title: string, patch: Partial<Task> = {}) => {
    const t: Task = { ...task, id, branchName: `factory/${id}`, title, spans: [], ...patch }
    await store.saveTask(t)
    const c = { ...ctx, taskId: id }
    return { c, built: await buildTask(c, await planTask(c, t)) }
  }
  const prose = await runCase('fac-prose', 'Feature PROSA')
  assert.equal(prose.built.securityReport?.passed, false, 'Reviewer sem envelope não aprova')
  assert.match(prose.built.securityReport!.findings[0].description, /Reviewer did not finish/)
  await removeWorktree(repo, prose.built.worktreePath!, prose.built.branchName)

  const refuted = await runCase('fac-refuta', 'Feature REFUTA')
  assert.equal(refuted.built.securityReport?.passed, true, 'achado refutado não bloqueia')
  assert.equal(refuted.built.securityReport?.fixRounds, 0, 'nem gasta rodada de correção')
  assert.ok(refuted.built.securityReport?.findings[0].refuted, 'refutação fica à mostra')
  assert.ok(refuted.built.readiness?.attention.some(a => /refuted/.test(a)), 'e pede um olhar humano')
  await removeWorktree(repo, refuted.built.worktreePath!, refuted.built.branchName)

  const unverified = await runCase('fac-sem-verificacao', 'Feature', { verifyCommand: undefined })
  assert.equal(unverified.built.qaReport?.passed, false, 'sem comando de verificação não há aprovação')
  assert.match(unverified.built.readiness!.blockers[0], /Nothing was verified/)
  await removeWorktree(repo, unverified.built.worktreePath!, unverified.built.branchName)

  const stubborn = await runCase('fac-stubborn', 'Feature TEIMOSO')
  assert.equal(stubborn.built.securityReport?.passed, false)
  assert.equal(stubborn.built.securityReport?.fixRounds, 0, 'correção que não muda nada encerra o laço')
  assert.equal(stubborn.built.spans!.filter(s => s.agentId === 'reviewer').length, 1, 'sem revisão repetida do mesmo código')

  // A failed adjust goes back to the reviewed commit: nothing unreviewed reaches a merge
  const { adjustTask } = await import('../server/lib/factory/pipeline.ts')
  const wtS = stubborn.built.worktreePath!
  const reviewedHead = execFileSync('git', ['-C', wtS, 'rev-parse', 'HEAD'], { encoding: 'utf-8' })
  await assert.rejects(adjustTask(stubborn.c, stubborn.built, 'AJUSTE_IMPOSSIVEL'), /blocker/)
  assert.equal(execFileSync('git', ['-C', wtS, 'rev-parse', 'HEAD'], { encoding: 'utf-8' }), reviewedHead)
  assert.ok(!existsSync(join(wtS, 'meio-feito.txt')), 'alteração do ajuste que falhou descartada')
  await removeWorktree(repo, wtS, stubborn.built.branchName)

  // Budget: each fake run costs US$ 0.01; with a 0.015 cap the second run still starts
  // (0.01 spent) and the third is refused before it spends anything
  const capped: Task = { ...task, id: 'fac-budget', branchName: 'factory/fac-budget', title: 'Feature', budgetUsd: 0.015, spans: [] }
  await store.saveTask(capped)
  const cappedCtx = { ...ctx, taskId: capped.id }
  const planned2 = await planTask(cappedCtx, capped)
  await assert.rejects(buildTask(cappedCtx, planned2), /Cost cap reached: US\$ 0\.02 spent of US\$ 0\.01/)
  const after = await store.getTask(capped.id)
  assert.equal(after?.spans?.filter(s => s.kind === 'agent').length, 2, 'nenhum agente começou depois do teto')
  if (after?.worktreePath) await removeWorktree(repo, after.worktreePath, after.branchName)
  console.log('factory pipeline e2e: ok')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
