// End-to-end check of the ideation flow with a fake `claude` on PATH: no tokens, no real data.
// Covers: phase gates, red × blue with decisions, planner retry after a refused plan, split with
// a dependency on a whole master, dispatch (dependencies, given criteria, idempotency), the
// dependency block, the autopilot and where it stops, a killed idea and going back a phase.
// Run: node scripts/check-ideation-flow.ts
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'workstuff-ideation-'))
process.env.WORKSTUFF_HOME = join(tmp, 'home')
process.env.WORKSTUFF_AGENT_HOME = join(tmp, 'agent-home')

const bin = join(tmp, 'bin')
mkdirSync(bin)
writeFileSync(join(bin, 'claude'), `#!/usr/bin/env node
const a = process.argv
const sys = a[a.indexOf('--append-system-prompt') + 1]
// The panel sends the prompt on stdin (an argument fails with E2BIG past 128 KiB)
const prompt = require('fs').readFileSync(0, 'utf-8')
const env = o => 'Resposta.\\n\\n\`\`\`json\\n' + JSON.stringify(o) + '\\n\`\`\`'
const scenario = key => 'Cenário: ' + key + ' feliz'
let out
if (sys.includes('o Facilitador')) {
  out = prompt.includes('FASE REFINAR')
    ? env({ questions: [], doc: { refined: 'Painel com custo por cliente', outOfV1: 'Previsão', recommendation: 'go se 3 clientes usarem' }, recommendation: 'go', phaseReady: true })
    : env({ questions: [{ question: 'É por mês?', recommendation: 'sim' }], doc: { problem: 'P', audience: 'A', job: 'J', workaround: 'W', original: 'reescrito' }, phaseReady: true })
} else if (sys.includes('o blue team')) {
  out = env({ responses: [{ id: 'A1', stance: 'mitiga', argument: 'o billing exporta', mitigation: 'ler o export do billing' }] })
} else if (sys.includes('o red team')) {
  out = env({ attacks: [{ id: 'A1', target: 'dado', attack: 'não há dado de custo', severity: 'alta', evidence: 'fraca' }, { id: 'A2', target: 'uso', attack: 'ninguém abre painel', severity: 'baixa', evidence: 'nenhuma' }], assumptions: '| x | D | alta | fraca |', premortem: 'falhou por falta de dado' })
} else if (sys.includes('o Planner')) {
  const valid = prompt.includes('recusada')
  out = env({ masters: [
    { key: 'M1', title: 'Esqueleto', objective: 'ponta a ponta', repos: ['api'], scenarios: [scenario('M1')], dependsOn: [], walkingSkeleton: valid },
    { key: 'M2', title: 'Relatório', objective: 'relatório', repos: ['api'], scenarios: [scenario('M2')], dependsOn: ['M1'], walkingSkeleton: false },
  ] })
} else if (sys.includes('o Splitter')) {
  const key = prompt.includes('"key": "M2"') ? 'M2' : 'M1'
  out = env({ tasks: [{ key: key + '.T1', title: 'tarefa ' + key, repo: 'api', stack: 'backend', objective: 'o', scenarios: [scenario(key)], dependsOn: key === 'M2' ? ['M1'] : [], verifyHint: 'npm test' }] })
}
console.log(JSON.stringify({ type: 'result', is_error: false, result: out, total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 } }))
`)
chmodSync(join(bin, 'claude'), 0o755)
process.env.PATH = `${bin}:${process.env.PATH}`

// The project: a folder holding one repository with a first commit
const root = join(tmp, 'work')
const api = join(root, 'api')
mkdirSync(api, { recursive: true })
const git = (...args: string[]) => execFileSync('git', ['-C', api, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args])
git('init', '-q', '--initial-branch=main')
git('commit', '-q', '--allow-empty', '-m', 'init')

const { defaultProjectStore } = await import('../server/lib/factory/projects.ts')
const { defaultIdeaStore } = await import('../server/lib/ideation/store.ts')
const { defaultFactoryStore } = await import('../server/lib/factory/store.ts')
const { pendingDependencies } = await import('../server/lib/factory/types.ts')
const flow = await import('../server/lib/ideation/flow.ts')
const { discardTask } = await import('../server/lib/factory/discard.ts')

try {
  const project = defaultProjectStore.create({ name: 'Custos', rootPath: root, provider: 'claude' })
  const events: object[] = []
  const ctx = { signal: new AbortController().signal, send: (e: object) => events.push(e) }
  let idea = defaultIdeaStore.create(project.id, 'Custo por cliente', 'quero ver o custo de cada cliente')

  // Explore
  assert.throws(() => flow.advance(idea, project), /empty/, 'gate fechado sem as seções')
  idea = await flow.converse(ctx, project, idea, 'começa')
  assert.equal(idea.doc.problem, 'P')
  assert.equal(idea.doc.original, 'quero ver o custo de cada cliente', 'o agente não reescreve a ideia original')
  assert.equal(idea.turns.at(-1)?.questions?.[0].recommendation, 'sim')
  assert.ok(events.some(e => (e as { agentId?: string }).agentId === 'facilitator'), 'eventos marcados com o agente')
  idea = flow.advance(idea, project)
  assert.equal(idea.phase, 'challenge')

  // Challenge
  assert.throws(() => flow.advance(idea, project), /Run the challenge/)
  idea = await flow.challenge(ctx, project, idea)
  assert.equal(idea.challenge?.[0].attacks[0].mitigation, 'ler o export do billing')
  assert.equal(idea.doc.premortem, 'falhou por falta de dado')
  assert.throws(() => flow.advance(idea, project), /1 high-severity/, 'ataque alto sem decisão segura o gate')
  await assert.rejects(flow.challenge(ctx, project, idea), /decide|decida/, 'nova rodada só depois de decidir')
  idea = flow.decide(idea, [{ round: 1, id: 'A1', decision: 'mitigate' }, { round: 1, id: 'A2', decision: 'discard' }])
  assert.match(idea.doc.mitigations ?? '', /Mitigar.*export do billing/)
  idea = flow.advance(idea, project)

  // Refine
  idea = await flow.converse(ctx, project, idea, 'refina')
  assert.equal(idea.recommendation, 'go')
  idea = flow.advance(idea, project)
  assert.equal(idea.phase, 'plan')

  // Plan: the first attempt has no walking skeleton and is fed back
  const planned = await flow.plan(ctx, project, idea, '')
  idea = planned.idea
  assert.deepEqual(planned.errors, [])
  assert.equal(idea.runs?.filter(r => r.agent === 'planner').length, 2, 'plano recusado volta ao planner')
  idea = flow.advance(idea, project)

  // Split
  const splitted = await flow.split(ctx, project, idea, '')
  idea = splitted.idea
  assert.deepEqual(splitted.errors, [])
  assert.deepEqual(idea.tasks?.map(t => t.key).sort(), ['M1.T1', 'M2.T1'])

  // Dispatch
  const sent = await flow.dispatch(project, idea)
  assert.equal(sent.created.length, 2)
  assert.equal(sent.idea.phase, 'dispatched')
  const [first, second] = sent.created
  assert.equal(first.origin?.taskKey, 'M1.T1', 'dependência criada antes')
  assert.deepEqual(second.dependsOn, [first.id])
  assert.deepEqual(second.givenCriteria, ['Cenário: M2 feliz'])
  assert.equal(second.projectId, project.id)
  assert.equal(second.verifyCommand, 'npm test')
  assert.equal(second.baseBranch, 'main')
  assert.equal((await flow.dispatch(project, sent.idea)).created.length, 0, 'reenviar não duplica')
  const all = await defaultFactoryStore.getTasks()
  assert.equal(all.length, 2)
  assert.equal(pendingDependencies(second, all).length, 1, 'M2.T1 espera M1.T1')
  await defaultFactoryStore.saveTask({ ...first, state: 'done' })
  assert.equal(pendingDependencies(second, await defaultFactoryStore.getTasks()).length, 0)

  // Discarding a task: the one that depended on it stops waiting
  await discardTask(first.id)
  assert.equal((await defaultFactoryStore.getTasks()).length, 1)
  assert.equal(pendingDependencies(second, await defaultFactoryStore.getTasks()).length, 0, 'dependência descartada não segura mais')

  // Autopilot: from the raw idea to a finished split, never dispatching
  const auto = await flow.autopilot(ctx, project, defaultIdeaStore.create(project.id, 'Piloto', 'quero ver o custo de cada cliente'))
  assert.deepEqual(auto.errors, [])
  assert.equal(auto.idea.phase, 'split', 'o piloto para antes de enviar')
  assert.equal(auto.idea.dispatched, undefined)
  assert.deepEqual(auto.idea.tasks?.map(t => t.key).sort(), ['M1.T1', 'M2.T1'])
  const autoAttacks = auto.idea.challenge?.[0].attacks ?? []
  assert.equal(autoAttacks.find(a => a.id === 'A1')?.decision, 'mitigate', 'ataque alto mitigado pelo blue team')
  assert.equal(autoAttacks.find(a => a.id === 'A2')?.decision, 'accept', 'ataque baixo sem resposta vira risco aceito')

  // Autopilot stops at a high-severity attack the blue team conceded, deciding nothing
  let conceded = defaultIdeaStore.create(project.id, 'Concedida', 'x')
  conceded = defaultIdeaStore.save({ ...conceded, phase: 'challenge', challenge: [{ round: 1, at: '', attacks: [
    { id: 'A1', target: 't', attack: 'derruba a ideia', severity: 'alta', evidence: 'fraca', stance: 'concede' },
    { id: 'A2', target: 't', attack: 'incomoda', severity: 'baixa', evidence: 'fraca', stance: 'defende' },
  ] }] })
  const halted = await flow.autopilot(ctx, project, conceded)
  assert.match(halted.errors[0], /A1/)
  assert.equal(halted.idea.phase, 'challenge')
  assert.ok(halted.idea.challenge?.[0].attacks.every(a => !a.decision), 'nenhuma decisão tomada por você')

  // Autopilot stops at a pivot instead of going back to Explore
  let pivoted = defaultIdeaStore.create(project.id, 'Pivot', 'x')
  pivoted = defaultIdeaStore.save({ ...pivoted, phase: 'refine', recommendation: 'pivot', doc: { ...pivoted.doc, refined: 'r', outOfV1: 'o', recommendation: 'pivot' } })
  const atPivot = await flow.autopilot(ctx, project, pivoted)
  assert.match(atPivot.errors[0], /pivot/)
  assert.equal(atPivot.idea.phase, 'refine')

  // A killed idea, then reopened
  let other = defaultIdeaStore.create(project.id, 'Outra', 'x')
  other = defaultIdeaStore.save({ ...other, phase: 'challenge' })
  other = await flow.challenge(ctx, project, other)
  other = flow.decide(other, [{ round: 1, id: 'A1', decision: 'kill', note: 'sem dado' }])
  assert.equal(other.phase, 'dropped')
  other = flow.back(other)
  assert.equal(other.phase, 'challenge')
  assert.ok(other.stale?.includes('plan'))

  console.log('check-ideation-flow: ok')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
