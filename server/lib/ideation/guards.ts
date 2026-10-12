// Ideation guards: what code checks before a phase closes, never left to the agent.
// Autoteste: node server/lib/ideation/guards.ts --selfcheck

import assert from 'node:assert/strict'
import { say } from '../i18n.ts'
import { DOC_SECTIONS, PHASE_REQUIRED, STACKS, type DocSection, type ExecutableTask, type Idea, type MasterTask } from './types.ts'

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

// A cycle as a path (a -> b -> a), or null. Unknown dependencies are reported elsewhere.
export function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>()
  const path: string[] = []
  const visit = (key: string): string[] | null => {
    if (state.get(key) === 'done') return null
    if (state.get(key) === 'visiting') return [...path.slice(path.indexOf(key)), key]
    state.set(key, 'visiting')
    path.push(key)
    for (const dep of graph.get(key) ?? []) {
      if (!graph.has(dep)) continue
      const cycle = visit(dep)
      if (cycle) return cycle
    }
    path.pop()
    state.set(key, 'done')
    return null
  }
  for (const key of graph.keys()) {
    const cycle = visit(key)
    if (cycle) return cycle
  }
  return null
}

// Dependencies first; ties keep the given order. Assumes no cycle.
export function topoOrder<T extends { key: string; dependsOn: string[] }>(items: T[]): T[] {
  const byKey = new Map(items.map(i => [i.key, i]))
  const out: T[] = []
  const seen = new Set<string>()
  const visit = (item: T) => {
    if (seen.has(item.key)) return
    seen.add(item.key)
    for (const dep of item.dependsOn) {
      const d = byKey.get(dep)
      if (d) visit(d)
    }
    out.push(item)
  }
  items.forEach(visit)
  return out
}

function duplicates(keys: string[]): string[] {
  return [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))]
}

export function planErrors(masters: MasterTask[], repoNames: string[]): string[] {
  const errors: string[] = []
  if (masters.length === 0) return [say({ en: 'the plan has no master task', pt: 'o plano não tem nenhuma tarefa master' })]
  const keys = masters.map(m => m.key)
  for (const d of duplicates(keys)) errors.push(say({ en: `repeated master key: ${d}`, pt: `chave de master repetida: ${d}` }))
  for (const m of masters) {
    for (const dep of m.dependsOn) if (!keys.includes(dep)) errors.push(say({ en: `${m.key} depends on ${dep}, which does not exist`, pt: `${m.key} depende de ${dep}, que não existe` }))
    for (const repo of m.repos) {
      if (!repoNames.includes(repo) && !(m.newRepos ?? []).includes(repo)) errors.push(say({ en: `${m.key} names the repository ${repo}, which is not in the project (list it in newRepos if this master creates it)`, pt: `${m.key} cita o repositório ${repo}, que não existe no projeto (declare em newRepos se for criado por ela)` }))
    }
    if (m.repos.length === 0) errors.push(say({ en: `${m.key} does not say which repository it happens in`, pt: `${m.key} não diz em qual repositório acontece` }))
    if (m.scenarios.length === 0) errors.push(say({ en: `${m.key} has no acceptance scenario (Gherkin: "Given… When… Then…")`, pt: `${m.key} não tem cenário de aceite (Gherkin: "Dado… Quando… Então…")` }))
  }
  const skeletons = masters.filter(m => m.walkingSkeleton)
  if (skeletons.length !== 1) errors.push(say({ en: `the plan needs exactly one walking skeleton, the first and simplest version that works end to end (it has ${skeletons.length})`, pt: `o plano precisa de exatamente um walking skeleton, a primeira versão, a mais simples, que já funciona de ponta a ponta (tem ${skeletons.length})` }))
  else if (skeletons[0].dependsOn.length > 0) errors.push(say({ en: `${skeletons[0].key} is the walking skeleton and cannot depend on another master`, pt: `${skeletons[0].key} é o walking skeleton e não pode depender de outra master` }))
  const cycle = findCycle(new Map(masters.map(m => [m.key, m.dependsOn])))
  if (cycle) errors.push(say({ en: `circular dependency between masters: ${cycle.join(' -> ')}`, pt: `dependência circular entre masters: ${cycle.join(' -> ')}` }))
  return errors
}

// Master keys in dependsOn become every task of that master; a task with no dependency inside its
// own master also waits for the masters its master depends on.
export function expandDependencies(tasks: ExecutableTask[], masters: MasterTask[]): ExecutableTask[] {
  const masterKeys = new Set(masters.map(m => m.key))
  const tasksOf = (masterKey: string) => tasks.filter(t => t.masterKey === masterKey).map(t => t.key)
  return tasks.map(t => {
    const sameMaster = new Set(tasksOf(t.masterKey))
    const isRoot = !t.dependsOn.some(d => sameMaster.has(d))
    const implicit = isRoot ? masters.find(m => m.key === t.masterKey)?.dependsOn ?? [] : []
    const deps = [...t.dependsOn, ...implicit].flatMap(d => (masterKeys.has(d) ? tasksOf(d) : [d]))
    return { ...t, dependsOn: [...new Set(deps)].filter(d => d !== t.key) }
  })
}

// externalKeys: masters split elsewhere (one master is split at a time); depending on them, or on
// any of their tasks, is accepted here and checked once all masters are split.
export function splitErrors(tasks: ExecutableTask[], masters: MasterTask[], repoNames: string[], externalKeys: string[] = []): string[] {
  const errors: string[] = []
  if (tasks.length === 0) return [say({ en: 'the split produced no executable task', pt: 'o split não gerou nenhuma tarefa executável' })]
  const keys = tasks.map(t => t.key)
  const masterKeys = masters.map(m => m.key)
  for (const d of duplicates(keys)) errors.push(say({ en: `repeated task key: ${d}`, pt: `chave de tarefa repetida: ${d}` }))
  for (const t of tasks) {
    const master = masters.find(m => m.key === t.masterKey)
    if (!master) {
      errors.push(say({ en: `${t.key} points to master ${t.masterKey}, which does not exist`, pt: `${t.key} aponta para a master ${t.masterKey}, que não existe` }))
      continue
    }
    if (!repoNames.includes(t.repo) && !(master.newRepos ?? []).includes(t.repo)) errors.push(say({ en: `${t.key} uses the repository ${t.repo}, which is not in the project`, pt: `${t.key} usa o repositório ${t.repo}, que não existe no projeto` }))
    if (!(STACKS as readonly string[]).includes(t.stack)) errors.push(say({ en: `${t.key} has an invalid stack "${t.stack}" (use ${STACKS.join(', ')}; fullstack becomes two tasks)`, pt: `${t.key} tem stack inválida "${t.stack}" (use ${STACKS.join(', ')}; fullstack vira duas tarefas)` }))
    const external = (dep: string) => externalKeys.some(k => dep === k || dep.startsWith(`${k}.`))
    for (const dep of t.dependsOn) if (!keys.includes(dep) && !masterKeys.includes(dep) && !external(dep)) errors.push(say({ en: `${t.key} depends on ${dep}, which does not exist`, pt: `${t.key} depende de ${dep}, que não existe` }))
    if (t.scenarios.length === 0) errors.push(say({ en: `${t.key} inherited no scenario from its master`, pt: `${t.key} não herdou nenhum cenário da master` }))
  }
  // A scenario no task covers is scope lost in silence
  for (const m of masters) {
    const covered = new Set(tasks.filter(t => t.masterKey === m.key).flatMap(t => t.scenarios.map(norm)))
    for (const s of m.scenarios) if (!covered.has(norm(s))) errors.push(say({ en: `${m.key} scenario with no task: "${s.split('\n')[0]}"`, pt: `cenário de ${m.key} sem tarefa: "${s.split('\n')[0]}"` }))
    if (!tasks.some(t => t.masterKey === m.key)) errors.push(say({ en: `${m.key} got no task`, pt: `${m.key} ficou sem nenhuma tarefa` }))
  }
  if (errors.length) return errors
  const expanded = expandDependencies(tasks, masters)
  const cycle = findCycle(new Map(expanded.map(t => [t.key, t.dependsOn])))
  if (cycle) errors.push(say({ en: `circular dependency between tasks: ${cycle.join(' -> ')}`, pt: `dependência circular entre tarefas: ${cycle.join(' -> ')}` }))
  return errors
}

const filled = (v?: string) => Boolean(v && v.trim())

// Why the current phase cannot close yet; empty means the gate is open.
const sectionTitle = (key: DocSection) => {
  const [, pt, en] = DOC_SECTIONS.find(s => s[0] === key)!
  return say({ en, pt })
}

export function gateBlockers(idea: Idea, repoNames: string[]): string[] {
  const blockers = (PHASE_REQUIRED[idea.phase] ?? []).filter(k => !filled(idea.doc[k])).map(k => say({
    en: `"${sectionTitle(k)}" is still empty in the document: answer the facilitator's questions about it, or say it is still a guess to check later`,
    pt: `"${sectionTitle(k)}" ainda está vazio no documento: responda às perguntas do facilitador sobre isso, ou diga que ainda é um palpite a conferir depois`,
  }))
  if (idea.phase === 'challenge') {
    const rounds = idea.challenge ?? []
    if (rounds.length === 0) blockers.push(say({ en: 'click "Run the challenge" at least once, so the idea is criticized before you go on', pt: 'clique em "Rodar o desafio" ao menos uma vez, para a ideia ser criticada antes de seguir' }))
    const open = rounds.flatMap(r => r.attacks).filter(a => a.severity === 'alta' && !a.decision)
    if (open.length) blockers.push(say({ en: `${open.length} high-severity attack(s) with no decision: choose what to do with each one in the attack card`, pt: `${open.length} ataque(s) de severidade alta sem decisão: escolha o que fazer com cada um no cartão do ataque` }))
  }
  if (idea.phase === 'refine' && !idea.recommendation) blockers.push(say({ en: 'the facilitator has not recommended yet whether to go on (go), change course (pivot) or stop: continue the conversation', pt: 'o facilitador ainda não recomendou seguir (go), mudar o rumo (pivot) ou parar (stop): continue a conversa' }))
  if (idea.phase === 'plan') blockers.push(...planErrors(idea.masters ?? [], repoNames))
  if (idea.phase === 'split') blockers.push(...splitErrors(idea.tasks ?? [], idea.masters ?? [], repoNames))
  return blockers
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const m = (key: string, extra: Partial<MasterTask> = {}): MasterTask => ({ key, title: key, objective: '', inScope: [], outOfScope: [], repos: ['api'], scenarios: [`Cenário ${key}`], dependsOn: [], walkingSkeleton: false, ...extra })
  const t = (key: string, masterKey: string, extra: Partial<ExecutableTask> = {}): ExecutableTask => ({ key, masterKey, title: key, repo: 'api', stack: 'backend', objective: '', inScope: [], outOfScope: [], contracts: [], scenarios: [`Cenário ${masterKey}`], dependsOn: [], ...extra })

  const masters = [m('M1', { walkingSkeleton: true }), m('M2', { dependsOn: ['M1'] })]
  assert.deepEqual(planErrors(masters, ['api']), [])
  assert.match(planErrors([m('M1'), m('M2')], ['api']).join(), /walking skeleton/)
  assert.match(planErrors([m('M1', { walkingSkeleton: true, dependsOn: ['M2'] }), m('M2', { dependsOn: ['M1'] })], ['api']).join(), /M1 -> M2 -> M1|M1/)
  assert.match(planErrors([m('M1', { walkingSkeleton: true, repos: ['web'] })], ['api']).join(), /web/)
  assert.deepEqual(planErrors([m('M1', { walkingSkeleton: true, repos: ['web'], newRepos: ['web'] })], ['api']), [], 'repo novo declarado vale')

  const tasks = [t('M1.T1', 'M1'), t('M1.T2', 'M1', { dependsOn: ['M1.T1'] }), t('M2.T1', 'M2')]
  assert.deepEqual(splitErrors(tasks, masters, ['api']), [])
  const expanded = expandDependencies(tasks, masters)
  assert.deepEqual(expanded.find(x => x.key === 'M2.T1')?.dependsOn, ['M1.T1', 'M1.T2'], 'tarefa raiz de M2 espera toda M1')
  assert.deepEqual(expanded.find(x => x.key === 'M1.T2')?.dependsOn, ['M1.T1'])

  const lost = [t('M1.T1', 'M1', { scenarios: ['outro'] }), t('M2.T1', 'M2')]
  assert.match(splitErrors(lost, masters, ['api']).join(), /M1 scenario with no task/, 'cenário sem tarefa é pego')
  assert.deepEqual(splitErrors([t('M1.T1', 'M1', { scenarios: ['  cenário   m1 '] }), t('M2.T1', 'M2')], masters, ['api']), [], 'comparação ignora caixa e espaços')
  assert.match(splitErrors([t('M1.T1', 'M1', { stack: 'fullstack' as never }), t('M2.T1', 'M2')], masters, ['api']).join(), /fullstack/)
  assert.match(splitErrors([t('M1.T1', 'M1', { dependsOn: ['M2.T1'] }), t('M2.T1', 'M2')], masters, ['api']).join(), /circular/, 'M1 esperando M2, que espera M1')

  assert.deepEqual(splitErrors([t('M2.T1', 'M2', { dependsOn: ['M1.T3', 'M1'] })], [masters[1]], ['api'], ['M1']), [], 'dependência em master quebrada à parte é aceita')
  assert.match(splitErrors([t('M2.T1', 'M2', { dependsOn: ['M9.T1'] })], [masters[1]], ['api'], ['M1']).join(), /M9/)

  const order = topoOrder(expanded).map(x => x.key)
  assert.ok(order.indexOf('M1.T1') < order.indexOf('M1.T2') && order.indexOf('M1.T2') < order.indexOf('M2.T1'))

  const idea = { phase: 'challenge', doc: { assumptions: 'x', premortem: 'y' }, challenge: [{ round: 1, at: '', attacks: [{ id: 'A1', severity: 'alta', target: '', attack: '', evidence: 'fraca' }] }] } as unknown as Idea
  assert.match(gateBlockers(idea, []).join(), /1 high-severity/)
  idea.challenge![0].attacks[0].decision = 'accept'
  assert.deepEqual(gateBlockers(idea, []), [])
  assert.equal(gateBlockers({ phase: 'explore', doc: {} } as Idea, []).length, 4)
  assert.match(gateBlockers({ phase: 'explore', doc: {} } as Idea, [])[0], /"Real problem" is still empty/, 'the gate names the section as the document shows it')

  console.log('ideation guards selfcheck: ok')
}
