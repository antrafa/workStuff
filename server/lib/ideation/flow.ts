// Ideation flow: each operation reads the idea, runs its agents (read-only, in the project folder)
// and saves the result. One operation per idea at a time.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runFactoryAgent } from '../factory/runner.ts'
import { createTaskRecord } from '../factory/newTask.ts'
import { defaultFactoryStore } from '../factory/store.ts'
import { ProjectError } from '../factory/projects.ts'
import type { FactoryProjectView, FactoryTask } from '../factory/types.ts'
import { readSettings } from '../settingsStore.ts'
import { say } from '../i18n.ts'
import { IDEATION_AGENTS } from './agents.ts'
import {
  formatBluePrompt,
  formatFacilitatorPrompt,
  formatPlannerPrompt,
  formatRedPrompt,
  formatSplitterPrompt,
  mergeBlue,
  parseFacilitator,
  parseMasters,
  parseRed,
  parseTasks,
  proseOf,
} from './envelopes.ts'
import { expandDependencies, gateBlockers, planErrors, splitErrors, topoOrder } from './guards.ts'
import { defaultIdeaStore as store } from './store.ts'
import { PHASE_ORDER, type AttackDecision, type ExecutableTask, type Idea, type IdeaPhase, type IdeaRun, type IdeationAgentId, type MasterTask } from './types.ts'

export type FlowContext = { signal: AbortSignal; send: (event: object) => void }

const MAX_ATTEMPTS = 3
const MAX_CHALLENGE_ROUNDS = 2
const now = () => new Date().toISOString()

// ── Execution registry ───────────────────────────────────────────────────────

const running = new Map<string, AbortController>()

export const isRunning = (ideaId: string) => running.has(ideaId)

export function beginRun(ideaId: string): AbortSignal {
  if (running.has(ideaId)) throw new ProjectError(say({ en: 'this idea is already running an agent', pt: 'esta ideia já está rodando um agente' }), 409)
  const controller = new AbortController()
  running.set(ideaId, controller)
  return controller.signal
}

export function endRun(ideaId: string): void {
  running.delete(ideaId)
}

export function stopRun(ideaId: string): boolean {
  running.get(ideaId)?.abort()
  return running.has(ideaId)
}

// ── Agent call ───────────────────────────────────────────────────────────────

type AgentOutput = { text: string; run: IdeaRun }

async function callAgent(ctx: FlowContext, project: FactoryProjectView, agentId: IdeationAgentId, prompt: string, label?: string): Promise<AgentOutput> {
  if (project.missing) throw new ProjectError(say({ en: 'the project folder no longer exists', pt: 'a pasta do projeto não existe mais' }))
  ctx.send({ type: 'status', agentId, message: label ?? IDEATION_AGENTS[agentId].name })
  const result = await runFactoryAgent({
    agent: IDEATION_AGENTS[agentId],
    prompt,
    cwd: project.rootPath,
    readOnly: true,
    provider: project.provider,
    model: project.model,
    signal: ctx.signal,
    onEvent: event => ctx.send({ ...event, agentId }),
  })
  if (result.stopped || ctx.signal.aborted) throw new ProjectError(say({ en: 'stopped by you', pt: 'parado por você' }), 409)
  return { text: result.text, run: { agent: agentId, at: now(), durationMs: result.durationMs, model: result.model, usage: result.usage ?? undefined } }
}

// Re-read before saving: the developer may have answered a gate or edited the plan meanwhile.
function persist(idea: Idea, patch: (fresh: Idea) => Partial<Idea>, runs: IdeaRun[] = []): Idea {
  const fresh = store.get(idea.projectId, idea.id)
  return store.save({ ...fresh, ...patch(fresh), runs: [...(fresh.runs ?? []), ...runs] })
}

const repoNames = (project: FactoryProjectView) => project.repos.map(r => r.name)

export function viewOf(idea: Idea, project: FactoryProjectView) {
  return { ...idea, executing: isRunning(idea.id), gate: gateBlockers(idea, repoNames(project)) }
}

function refusePhase(idea: Idea, allowed: IdeaPhase[]): void {
  if (allowed.includes(idea.phase)) return
  throw new ProjectError(say({ en: `not available with the idea in phase "${idea.phase}"`, pt: `não disponível com a ideia na fase "${idea.phase}"` }), 409)
}

// ── Conversation ─────────────────────────────────────────────────────────────

export async function converse(ctx: FlowContext, project: FactoryProjectView, idea: Idea, message: string): Promise<Idea> {
  refusePhase(idea, ['explore', 'challenge', 'refine', 'plan', 'split'])
  const withMessage = message ? persist(idea, f => ({ turns: [...f.turns, { role: 'user', text: message, at: now() }] })) : idea
  const { text, run } = await callAgent(ctx, project, 'facilitator', formatFacilitatorPrompt(withMessage, message, project.repos))
  const env = parseFacilitator(text)
  return persist(withMessage, f => ({
    doc: { ...f.doc, ...env.doc },
    recommendation: env.recommendation ?? f.recommendation,
    turns: [...f.turns, { role: 'facilitator', text: env.reply, questions: env.questions.length ? env.questions : undefined, at: now() }],
  }), [run])
}

// ── Red team × blue team ─────────────────────────────────────────────────────

export async function challenge(ctx: FlowContext, project: FactoryProjectView, idea: Idea): Promise<Idea> {
  refusePhase(idea, ['challenge'])
  const rounds = idea.challenge ?? []
  if (rounds.length >= MAX_CHALLENGE_ROUNDS) {
    throw new ProjectError(say({ en: `the challenge runs at most ${MAX_CHALLENGE_ROUNDS} rounds`, pt: `o desafio roda no máximo ${MAX_CHALLENGE_ROUNDS} rodadas` }), 409)
  }
  const pending = rounds.flatMap(r => r.attacks).filter(a => !a.decision)
  if (pending.length) {
    throw new ProjectError(say({ en: 'decide every attack of the last round before a new one', pt: 'decida todos os ataques da rodada anterior antes de uma nova' }), 409)
  }
  const red = await callAgent(ctx, project, 'red', formatRedPrompt(idea, project.repos), say({ en: 'Red team: attacking the idea...', pt: 'Red team: atacando a ideia...' }))
  const redEnv = parseRed(red.text)
  if (!redEnv.attacks.length) throw new ProjectError(say({ en: 'the red team returned no attack in the expected format; run it again', pt: 'o red team não devolveu ataque no formato esperado; rode de novo' }), 502)
  const blue = await callAgent(ctx, project, 'blue', formatBluePrompt(idea, redEnv.attacks, project.repos), say({ en: 'Blue team: answering each attack...', pt: 'Blue team: respondendo a cada ataque...' }))
  const attacks = mergeBlue(redEnv.attacks, blue.text)
  return persist(idea, f => ({
    challenge: [...(f.challenge ?? []), { round: (f.challenge?.length ?? 0) + 1, attacks, at: now() }],
    doc: { ...f.doc, ...(redEnv.assumptions && { assumptions: redEnv.assumptions }), ...(redEnv.premortem && { premortem: redEnv.premortem }) },
    turns: [...f.turns, { role: 'red', text: proseOf(red.text), at: now() }, { role: 'blue', text: proseOf(blue.text), at: now() }],
  }), [red.run, blue.run])
}

export type DecisionInput = { round: number; id: string; decision: AttackDecision; note?: string }

// The challenge decisions section is rebuilt from scratch each time, so changing a decision never
// leaves the old one behind.
function decisionsSection(idea: Idea): string {
  const lines = (idea.challenge ?? []).flatMap(r =>
    r.attacks.filter(a => a.decision && a.decision !== 'discard').map(a => {
      const note = a.note ? ` — ${a.note}` : ''
      if (a.decision === 'mitigate') return `- **Mitigar** (${a.id}, rodada ${r.round}): ${a.mitigation || a.attack}${note}`
      if (a.decision === 'accept') return `- **Risco aceito** (${a.id}, rodada ${r.round}): ${a.attack}${note}`
      return `- **Derrubou a ideia** (${a.id}, rodada ${r.round}): ${a.attack}${note}`
    }),
  )
  return lines.join('\n')
}

export function decide(idea: Idea, decisions: DecisionInput[]): Idea {
  refusePhase(idea, ['challenge'])
  const challengeRounds = (idea.challenge ?? []).map(r => ({
    ...r,
    attacks: r.attacks.map(a => {
      const d = decisions.find(x => x.round === r.round && x.id === a.id)
      return d ? { ...a, decision: d.decision, note: d.note?.trim() || undefined } : a
    }),
  }))
  const next: Idea = { ...idea, challenge: challengeRounds }
  const killer = challengeRounds.flatMap(r => r.attacks).find(a => a.decision === 'kill')
  return store.save({
    ...next,
    doc: { ...next.doc, mitigations: decisionsSection(next) },
    ...(killer && { phase: 'dropped' as const, droppedReason: killer.attack }),
  })
}

// ── Phase gates ──────────────────────────────────────────────────────────────

export function advance(idea: Idea, project: FactoryProjectView): Idea {
  refusePhase(idea, ['explore', 'challenge', 'refine', 'plan'])
  const blockers = gateBlockers(idea, repoNames(project))
  if (blockers.length) throw new ProjectError(blockers.join('; '), 409)
  const system = (text: string) => ({ role: 'system' as const, text, at: now() })
  if (idea.phase === 'refine' && idea.recommendation === 'pivot') {
    return store.save({ ...idea, phase: 'explore', recommendation: undefined, turns: [...idea.turns, system('Pivot: de volta a Explorar, com o documento preservado.')] })
  }
  if (idea.phase === 'refine' && idea.recommendation === 'stop') {
    return store.save({ ...idea, phase: 'dropped', droppedReason: idea.doc.recommendation, turns: [...idea.turns, system('Stop: ideia encerrada.')] })
  }
  const next = PHASE_ORDER[PHASE_ORDER.indexOf(idea.phase) + 1]
  return store.save({ ...idea, phase: next, stale: idea.stale?.filter(p => p !== next), turns: [...idea.turns, system(`Fase ${idea.phase} aprovada.`)] })
}

// Phase names for what the panel records in the conversation (the screen's own labels are in the web app)
const PHASE_NAME: Record<IdeaPhase, { en: string; pt: string }> = {
  explore: { en: 'Explore', pt: 'Explorar' },
  challenge: { en: 'Challenge', pt: 'Desafiar' },
  refine: { en: 'Refine', pt: 'Refinar' },
  plan: { en: 'Plan', pt: 'Plano' },
  split: { en: 'Break down', pt: 'Quebrar' },
  dispatched: { en: 'In the factory', pt: 'Na fábrica' },
  dropped: { en: 'Dropped', pt: 'Encerrada' },
}

// Reopens the previous phase. What was built on top stays, marked stale, until it is redone.
export function back(idea: Idea): Idea {
  refusePhase(idea, ['challenge', 'refine', 'plan', 'split', 'dropped'])
  const prev: IdeaPhase = idea.phase === 'dropped' ? (idea.challenge?.length ? 'challenge' : 'refine') : PHASE_ORDER[PHASE_ORDER.indexOf(idea.phase) - 1]
  const later = PHASE_ORDER.slice(PHASE_ORDER.indexOf(prev) + 1, PHASE_ORDER.indexOf('dispatched'))
  return store.save({
    ...idea,
    phase: prev,
    droppedReason: undefined,
    stale: [...new Set([...(idea.stale ?? []), ...later])],
    turns: [...idea.turns, { role: 'system', text: say({ en: `Back to ${PHASE_NAME[prev].en}.`, pt: `De volta a ${PHASE_NAME[prev].pt}.` }), at: now() }],
  })
}

// ── Plan and split ───────────────────────────────────────────────────────────

// Runs an agent until the guard passes, feeding each refusal back; returns the last attempt either
// way, so the developer sees what came out and why it was refused.
async function untilValid<T>(attempt: (errors: string[]) => Promise<{ value: T; errors: string[]; run: IdeaRun }>): Promise<{ value: T; errors: string[]; runs: IdeaRun[] }> {
  const runs: IdeaRun[] = []
  let errors: string[] = []
  let value: T | undefined
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const out = await attempt(errors)
    runs.push(out.run)
    value = out.value
    errors = out.errors
    if (!errors.length) break
  }
  return { value: value as T, errors, runs }
}

export async function plan(ctx: FlowContext, project: FactoryProjectView, idea: Idea, instructions: string): Promise<{ idea: Idea; errors: string[] }> {
  refusePhase(idea, ['plan'])
  const result = await untilValid(async previous => {
    const { text, run } = await callAgent(ctx, project, 'planner', formatPlannerPrompt(idea, project.repos, instructions, previous), say({ en: 'Planner: drafting the master tasks...', pt: 'Planner: montando as tarefas master...' }))
    const masters = parseMasters(text)
    return { value: { masters, prose: proseOf(text) }, errors: planErrors(masters, repoNames(project)), run }
  })
  const saved = persist(idea, f => ({
    masters: result.value.masters,
    // The split was made from the old plan
    tasks: undefined,
    stale: f.stale?.filter(p => p !== 'plan'),
    turns: [...f.turns, ...(instructions ? [{ role: 'user' as const, text: say({ en: `Instructions for the plan: ${instructions}`, pt: `Instruções para o plano: ${instructions}` }), at: now() }] : []), { role: 'planner', text: result.value.prose, at: now() }],
  }), result.runs)
  return { idea: saved, errors: result.errors }
}

export function setMasters(idea: Idea, masters: MasterTask[]): Idea {
  refusePhase(idea, ['plan'])
  return store.save({ ...idea, masters, tasks: undefined })
}

// Splits every master (or one), in parallel: a master's tasks may depend on another master as a
// whole, which is how they can be written without waiting for each other.
export async function split(ctx: FlowContext, project: FactoryProjectView, idea: Idea, instructions: string, onlyMaster?: string): Promise<{ idea: Idea; errors: string[] }> {
  refusePhase(idea, ['split'])
  const masters = idea.masters ?? []
  const targets = onlyMaster ? masters.filter(m => m.key === onlyMaster) : masters
  if (!targets.length) throw new ProjectError(say({ en: 'no master to split', pt: 'nenhuma master para quebrar' }))
  const others = (m: MasterTask) => masters.filter(x => x.key !== m.key).map(x => x.key)

  const results = await Promise.all(targets.map(m => untilValid(async previous => {
    const { text, run } = await callAgent(ctx, project, 'splitter', formatSplitterPrompt(idea, m, project.repos, instructions, previous), say({ en: `Splitter: breaking ${m.key} down...`, pt: `Splitter: quebrando ${m.key}...` }))
    const tasks = parseTasks(text, m.key)
    return { value: tasks, errors: splitErrors(tasks, [m], repoNames(project), others(m)), run }
  })))

  const fresh = store.get(idea.projectId, idea.id)
  const kept = (fresh.tasks ?? []).filter(t => !targets.some(m => m.key === t.masterKey))
  const tasks = [...kept, ...results.flatMap(r => r.value)]
  const saved = persist(idea, f => ({
    tasks,
    stale: f.stale?.filter(p => p !== 'split'),
    turns: [...f.turns, { role: 'splitter', text: say({ en: `${tasks.length} task(s) in ${masters.length} step(s).`, pt: `${tasks.length} tarefa(s) em ${masters.length} etapa(s).` }), at: now() }],
  }), results.flatMap(r => r.runs))
  return { idea: saved, errors: splitErrors(tasks, masters, repoNames(project)) }
}

export function setTasks(idea: Idea, tasks: ExecutableTask[]): Idea {
  refusePhase(idea, ['split'])
  return store.save({ ...idea, tasks })
}

// ── Dispatch to the factory ──────────────────────────────────────────────────

function taskDescription(idea: Idea, t: ExecutableTask, master?: MasterTask): string {
  const list = (title: string, items: string[]) => (items.length ? `## ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '')
  return [
    `Tarefa ${t.key} da ideia "${idea.title}"${master ? `, master ${master.key} · ${master.title}` : ''}.`,
    `## Objetivo\n${t.objective}`,
    list('No escopo', t.inScope),
    list('Fora do escopo', t.outOfScope),
    list('Contratos com as tarefas irmãs', t.contracts),
    idea.doc.problem ? `## Contexto: o problema\n${idea.doc.problem}` : '',
    idea.doc.refined ? `## Contexto: a versão refinada\n${idea.doc.refined}` : '',
  ].filter(Boolean).join('\n\n')
}

export type DispatchResult = { idea: Idea; created: FactoryTask[]; skipped: { key: string; reason: string }[] }

// Creates one factory task per executable task, dependencies first. Idempotent: a task already sent is
// not sent again. A task whose repository does not exist yet (created by another task) waits for
// the next dispatch, and so does everything that depends on it.
export async function dispatch(project: FactoryProjectView, idea: Idea): Promise<DispatchResult> {
  refusePhase(idea, ['split', 'dispatched'])
  const masters = idea.masters ?? []
  const errors = splitErrors(idea.tasks ?? [], masters, repoNames(project))
  if (errors.length) throw new ProjectError(errors.join('; '), 409)

  const sent = { ...(idea.dispatched ?? {}) }
  const created: FactoryTask[] = []
  const skipped: DispatchResult['skipped'] = []
  const settings = readSettings()
  for (const t of topoOrder(expandDependencies(idea.tasks ?? [], masters))) {
    if (sent[t.key]) continue
    const repoPath = project.repos.find(r => r.name === t.repo)?.path ?? join(project.rootPath, t.repo)
    const waitingOn = t.dependsOn.filter(d => !sent[d])
    if (waitingOn.length) {
      skipped.push({ key: t.key, reason: say({ en: `waits for ${waitingOn.join(', ')} to be sent`, pt: `espera ${waitingOn.join(', ')} ser enviada` }) })
      continue
    }
    if (!existsSync(join(repoPath, '.git'))) {
      skipped.push({ key: t.key, reason: say({ en: `repository ${t.repo} does not exist yet`, pt: `o repositório ${t.repo} ainda não existe` }) })
      continue
    }
    const task = await createTaskRecord({
      projectId: project.id,
      title: `[${t.key}] ${t.title}`,
      description: taskDescription(idea, t, masters.find(m => m.key === t.masterKey)),
      source: { type: 'idea', repoPath },
      origin: { ideaId: idea.id, masterKey: t.masterKey, taskKey: t.key },
      givenCriteria: t.scenarios,
      dependsOn: t.dependsOn.map(d => sent[d]),
      provider: project.provider ?? settings.provider,
      model: project.model ?? settings.model,
      verifyCommand: t.verifyHint || project.verifyCommand,
    })
    await defaultFactoryStore.saveTask(task)
    sent[t.key] = task.id
    created.push(task)
  }
  const done = (idea.tasks ?? []).every(t => sent[t.key])
  const saved = persist(idea, f => ({
    dispatched: sent,
    phase: done ? 'dispatched' : f.phase,
    turns: [...f.turns, { role: 'system', text: say({ en: `${created.length} task(s) sent to the factory${skipped.length ? `; ${skipped.length} waiting` : ''}.`, pt: `${created.length} tarefa(s) enviada(s) à fábrica${skipped.length ? `; ${skipped.length} aguardando` : ''}.` }), at: now() }],
  }))
  return { idea: saved, created, skipped }
}
