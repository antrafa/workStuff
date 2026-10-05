// The factory pipeline: which agent runs when, which gate checks it, and what happens on failure.
// Agent proposes, code disposes: agents write and judge, code verifies, commits and decides the verdict.
// HTTP concerns (SSE, state guards) stay in server/routes/factory.ts.

import { defaultFactoryStore as store } from './store.ts'
import { commitWorktree, createWorktree, discardFiles, getWorktreeDiff, headOf, resetWorktree, uncommittedFiles } from './worktree.ts'
import { runFactoryAgent } from './runner.ts'
import { gateArtifactsExist, gateDiffNotEmpty, gateTestsPass, nonDocFiles, type TestsGateResult } from './gates.ts'
import { ExecutionCancelledError, throwIfCancelled } from './executions.ts'
import {
  computeVerdict,
  formatAdjustPrompt,
  formatBuildPrompt,
  formatCorrectionPrompt,
  formatDocsPrompt,
  formatFixFindingsPrompt,
  formatPlanPrompt,
  formatReviewPrompt,
  formatSecurityPrompt,
  formatSpecPrompt,
  formatTestPrompt,
  incompleteReview,
  mergeFindings,
  parseBuildEnvelope,
  parseDocsEnvelope,
  parsePlanEnvelope,
  parseReviewEnvelope,
  parseSpecEnvelope,
  parseTestEnvelope,
} from './envelopes.ts'
import { taskUsage } from './types.ts'
import type { BuildEnvelope, ExecutionSpan, FactoryTask, PlanEnvelope, ReviewEnvelope, SecurityFinding, SpecEnvelope, SpecializedAgentId } from './types.ts'
import type { RunResult } from '../ai/runner.ts'

// Pipeline limits: 3 build attempts before giving up, 2 automatic fix-then-review rounds.
const MAX_BUILD_ATTEMPTS = 3
const MAX_FIX_ROUNDS = 2

export type ExecContext = {
  taskId: string
  signal: AbortSignal
  send: (event: object) => void
}

const now = () => new Date().toISOString()
const reload = async (task: FactoryTask) => (await store.getTask(task.id)) ?? task

// Start of a phase: the caller's copy wins (it carries the developer's answers or edited plan).
async function startPhase(task: FactoryTask, patch: Partial<FactoryTask>): Promise<FactoryTask> {
  const next = { ...task, ...patch, error: undefined, updatedAt: now() }
  await store.saveTask(next)
  return next
}

async function saveState(task: FactoryTask, patch: Partial<FactoryTask>): Promise<FactoryTask> {
  // Re-read so spans and tool calls recorded meanwhile are kept
  const next = { ...(await reload(task)), ...patch, updatedAt: now() }
  await store.saveTask(next)
  return next
}

// ── Steps ────────────────────────────────────────────────────────────────────

type SpanMeta = Pick<ExecutionSpan, 'name' | 'phase'>

// One agent run inside its own span. Events are tagged with the agent so two reviewers
// streaming at once stay apart, and tool calls land in this span, not "the running one".
async function agentStep<E>(
  ctx: ExecContext,
  task: FactoryTask,
  agentId: SpecializedAgentId,
  meta: SpanMeta,
  run: { prompt: string; cwd: string; readOnly?: boolean; resumeSessionId?: string | null },
  parse: (text: string) => E,
): Promise<{ result: RunResult; envelope: E }> {
  throwIfCancelled(ctx.signal)
  await assertWithinBudget(task)
  const model = task.agentModels?.[agentId] || task.model
  const spanId = await store.startSpan(ctx.taskId, { ...meta, kind: 'agent', agentId, model })
  const result = await runFactoryAgent({
    ...run,
    agentId,
    provider: task.provider,
    model,
    effort: task.effort,
    signal: ctx.signal,
    onEvent: event => {
      const tagged = { ...event, agentId }
      ctx.send(tagged)
      store.appendSessionEvent(ctx.taskId, tagged).catch(() => {})
      if (event.type === 'tool') {
        store.recordToolCall(ctx.taskId, { id: event.id, tool: event.tool, input: event.input, startedAt: now() }, spanId).catch(() => {})
      } else if (event.type === 'tool-result') {
        store.completeToolCall(ctx.taskId, event.id, { output: event.content, isError: event.isError }).catch(() => {})
      }
    },
  })
  // spawnCli resolves with stopped=true instead of rejecting
  if (result.stopped || ctx.signal.aborted) throw new ExecutionCancelledError()
  const envelope = parse(result.text)
  await store.finishSpan(ctx.taskId, spanId, { status: 'success', envelope, usage: result.usage ?? undefined })
  return { result, envelope }
}

// Checked before each agent run, from the spans stored so far (retries and earlier runs included).
// ponytail: the CLI reports cost only when a run ends, so one run can overshoot the cap; a mid-run
// stop needs streamed usage. Providers that report no cost (agy) are never capped.
async function assertWithinBudget(task: FactoryTask): Promise<void> {
  if (!task.budgetUsd) return
  const spent = taskUsage(await reload(task)).costUsd ?? 0
  if (spent >= task.budgetUsd) {
    throw new Error(`Teto de custo atingido: US$ ${spent.toFixed(2)} gastos de US$ ${task.budgetUsd.toFixed(2)}. Aumente o teto da tarefa para continuar.`)
  }
}

// A deterministic step (git, gates) in its own span; `fails` turns a result into a failed span.
async function codeStep<T>(
  ctx: ExecContext,
  kind: 'code' | 'gate',
  meta: SpanMeta,
  work: () => Promise<T>,
  fails: (r: T) => string | undefined = () => undefined,
  details?: (r: T) => Record<string, unknown>,
): Promise<T> {
  throwIfCancelled(ctx.signal)
  const spanId = await store.startSpan(ctx.taskId, { ...meta, kind })
  const result = await work()
  const error = fails(result)
  await store.finishSpan(ctx.taskId, spanId, { status: error ? 'failed' : 'success', error, details: details?.(result) })
  return result
}

const runTests = (ctx: ExecContext, task: FactoryTask, worktreePath: string, name: string) =>
  codeStep(
    ctx,
    'gate',
    { name, phase: 'qa_security' },
    () => gateTestsPass(worktreePath, { command: task.verifyCommand, signal: ctx.signal }),
    r => (r.passed ? undefined : r.reason),
    r => ({ command: r.command, output: r.output, skipped: r.skipped }),
  )

const commit = (ctx: ExecContext, worktreePath: string, message: string) =>
  codeStep(ctx, 'code', { name: `Commit: ${message.slice(0, 60)}`, phase: 'qa_security' }, () => commitWorktree(worktreePath, message))

// ── Build with gates and correction loop ─────────────────────────────────────

type GateOutcome = { failure?: string; fatal: boolean; tests: TestsGateResult }

async function checkBuildGates(ctx: ExecContext, task: FactoryTask, worktreePath: string, build: BuildEnvelope): Promise<GateOutcome> {
  const diff = await codeStep(ctx, 'gate', { name: 'Portão: há alterações', phase: 'qa_security' }, () => gateDiffNotEmpty(worktreePath, task.baseBranch), r => r.reason)
  const skippedTests: TestsGateResult = { passed: false, skipped: true, output: '', exitCode: -1, durationMs: 0 }
  if (!diff.passed) return { failure: diff.reason, fatal: true, tests: skippedTests }

  if (build.changedFiles.length > 0) {
    const artifacts = await codeStep(
      ctx, 'gate', { name: 'Portão: arquivos declarados existem', phase: 'qa_security' },
      async () => gateArtifactsExist(worktreePath, build.changedFiles, diff.filesChanged),
      r => r.reason,
    )
    if (!artifacts.passed) return { failure: artifacts.reason, fatal: true, tests: skippedTests }
  }

  const tests = await runTests(ctx, task, worktreePath, 'Portão: verificação do projeto')
  // A suite that could not run (no bwrap) is reported to the human, not "fixed" by the agent
  if (tests.passed || tests.skipped) return { fatal: false, tests }
  return { failure: `Comando: ${tests.command}\n${tests.output}`, fatal: false, tests }
}

// SSSF-style correction: a failed gate re-prompts the same CLI session (Claude) with exactly
// what failed, instead of starting over. Exhausted attempts: a broken diff aborts the run;
// failing tests go to the human with the failure on display.
async function implementWithGates(
  ctx: ExecContext,
  task: FactoryTask,
  worktreePath: string,
  firstPrompt: string,
  name: string,
  plan?: PlanEnvelope,
): Promise<{ build: BuildEnvelope; tests: TestsGateResult }> {
  let prompt = firstPrompt
  let sessionId: string | null = null
  for (let attempt = 1; ; attempt++) {
    ctx.send({ type: 'status', message: attempt === 1 ? `Implementer: ${name.toLowerCase()}...` : `Implementer: correção ${attempt - 1} de ${MAX_BUILD_ATTEMPTS - 1} após portão reprovado...` })
    const { result, envelope: build }: { result: RunResult; envelope: BuildEnvelope } = await agentStep(
      ctx, task, 'implementer',
      { name: attempt === 1 ? name : `Correção ${attempt - 1} (portão reprovado)`, phase: 'building' },
      { prompt, cwd: worktreePath, resumeSessionId: sessionId },
      text => parseBuildEnvelope(text),
    )
    if (build.status === 'error') throw new Error(`O Implementer parou com um bloqueio: ${build.summary}`)

    const gates = await checkBuildGates(ctx, task, worktreePath, build)
    if (!gates.failure) return { build, tests: gates.tests }
    if (attempt >= MAX_BUILD_ATTEMPTS) {
      if (gates.fatal) throw new Error(`Portão de aceitação falhou após ${attempt} tentativas: ${gates.failure}`)
      return { build, tests: gates.tests }
    }
    sessionId = result.sessionId
    prompt = formatCorrectionPrompt(task, gates.failure, Boolean(sessionId), plan)
  }
}

// ── Review squad ─────────────────────────────────────────────────────────────

type ReviewOutcome = { review: ReviewEnvelope; security: ReviewEnvelope; findings: SecurityFinding[]; passed: boolean; fixRounds: number; tests?: TestsGateResult }

// Reviewer and Security run in parallel. allSettled: when one fails, the other
// is still awaited, so nothing keeps writing after the run is marked failed.
async function reviewSquad(ctx: ExecContext, task: FactoryTask, worktreePath: string, round: number, previous: SecurityFinding[], tests: TestsGateResult, spec?: SpecEnvelope) {
  const { diff } = await getWorktreeDiff(worktreePath, task.baseBranch)
  const suffix = round > 0 ? ` (rodada ${round + 1})` : ''
  ctx.send({ type: 'status', message: `Reviewer e Security: revisando o diff em paralelo${suffix}...` })
  const settled = await Promise.allSettled([
    agentStep(ctx, task, 'reviewer', { name: `Revisão de código${suffix}`, phase: 'qa_security' },
      { prompt: formatReviewPrompt(task, diff, spec, previous, tests), cwd: worktreePath }, t => parseReviewEnvelope(t, 'reviewer')),
    agentStep(ctx, task, 'security', { name: `Auditoria de segurança${suffix}`, phase: 'qa_security' },
      { prompt: formatSecurityPrompt(task, diff, previous), cwd: worktreePath }, t => parseReviewEnvelope(t, 'security')),
  ])
  const rejected = settled.find(s => s.status === 'rejected')
  if (rejected) throw rejected.reason
  const [review, security] = settled.map(s => (s as PromiseFulfilledResult<{ envelope: ReviewEnvelope }>).value.envelope)
  return { review, security }
}

// A review the code cannot trust becomes a blocking finding for the human, never a pass.
const incompleteFinding = (description: string): SecurityFinding => ({ severity: 'high', confidence: 100, description })

async function reviewAndFix(ctx: ExecContext, task: FactoryTask, worktreePath: string, tests: TestsGateResult, spec?: SpecEnvelope, plan?: PlanEnvelope): Promise<ReviewOutcome> {
  let previous: SecurityFinding[] = []
  let latestTests = tests
  for (let round = 0; ; round++) {
    const { review, security } = await reviewSquad(ctx, task, worktreePath, round, previous, latestTests, spec)
    const findings = mergeFindings(review.findings, security.findings)
    const outcome = (passed: boolean, extra: SecurityFinding[] = []) =>
      ({ review, security, findings: [...extra, ...findings], passed, fixRounds: round, tests: round > 0 ? latestTests : undefined })

    const incomplete = incompleteReview(review, security, spec?.acceptanceCriteria)
    if (incomplete.length) return outcome(false, incomplete.map(incompleteFinding))
    const verdict = computeVerdict(findings, review.criteria)
    if (verdict.passed || round >= MAX_FIX_ROUNDS) return outcome(verdict.passed)

    const fixed = await implementWithGates(ctx, task, worktreePath, formatFixFindingsPrompt(task, verdict.blocking, verdict.unmet, plan), `Correção dos achados da revisão (rodada ${round + 1})`, plan)
    // The diff gate compares with the base, so a fix that changed nothing still passes it; reviewing
    // the same code again would only buy the same findings.
    if ((await uncommittedFiles(worktreePath)).length === 0) {
      return outcome(false, [incompleteFinding(`A correção automática da rodada ${round + 1} não alterou nenhum arquivo; os achados abaixo continuam para você decidir.`)])
    }
    latestTests = fixed.tests
    await commit(ctx, worktreePath, `fix: corrige achados da revisão automática (rodada ${round + 1})`)
    previous = findings
  }
}

// ── Documenter ───────────────────────────────────────────────────────────────

async function document(ctx: ExecContext, task: FactoryTask, worktreePath: string, review: ReviewEnvelope, spec?: SpecEnvelope) {
  ctx.send({ type: 'status', message: 'Documenter: atualizando a documentação afetada e a descrição do MR...' })
  const { stat } = await getWorktreeDiff(worktreePath, task.baseBranch)
  const { envelope: docs } = await agentStep(ctx, task, 'documenter', { name: 'Documentação e descrição do MR', phase: 'qa_security' },
    { prompt: formatDocsPrompt(task, stat.files, review, spec), cwd: worktreePath }, parseDocsEnvelope)

  // The Documenter may only touch docs: anything else it changed is thrown away by code
  await codeStep(ctx, 'gate', { name: 'Portão: Documenter só altera documentação', phase: 'qa_security' },
    async () => {
      const outside = nonDocFiles(await uncommittedFiles(worktreePath))
      await discardFiles(worktreePath, outside)
      return outside
    },
    outside => (outside.length ? `Alterações fora da documentação descartadas: ${outside.join(', ')}` : undefined),
  )
  await commit(ctx, worktreePath, `docs: atualiza documentação de "${task.title.slice(0, 50)}"`)
  return docs
}

// ── Phases called by the routes ──────────────────────────────────────────────

// Analyst then Architect. Open questions stop here: guessing a business rule costs a whole build.
export async function planTask(ctx: ExecContext, task: FactoryTask): Promise<FactoryTask> {
  const base = await startPhase(task, { state: 'planning' })
  ctx.send({ type: 'status', message: 'Analyst: especificando critérios de aceite...' })
  const { envelope: spec } = await agentStep(ctx, base, 'analyst', { name: 'Especificação e critérios de aceite', phase: 'planning' },
    { prompt: formatSpecPrompt(base), cwd: base.source.repoPath }, parseSpecEnvelope)

  if (spec.openQuestions.length > 0) {
    return saveState(base, { state: 'waiting_clarification', handoffs: { ...base.handoffs, spec } })
  }

  ctx.send({ type: 'status', message: 'Architect: elaborando o plano técnico...' })
  const { envelope: plan } = await agentStep(ctx, base, 'architect', { name: 'Planejamento arquitetural', phase: 'planning' },
    { prompt: formatPlanPrompt(base, spec), cwd: base.source.repoPath }, parsePlanEnvelope)
  return saveState(base, { state: 'waiting_approval', plan: plan.plan, handoffs: { ...base.handoffs, spec, plan } })
}

export async function buildTask(ctx: ExecContext, task: FactoryTask): Promise<FactoryTask> {
  ctx.send({ type: 'status', message: 'Criando a Git Worktree isolada...' })
  await startPhase(task, { state: 'building' })
  const { worktreePath, branchName } = await codeStep(ctx, 'code', { name: 'Criação da Git Worktree', phase: 'building' },
    () => createWorktree(task.source.repoPath, task.id, task.baseBranch))
  let current = await saveState(task, { worktreePath, branchName })

  const spec = current.handoffs?.spec
  const plan = current.handoffs?.plan ?? parsePlanEnvelope(current.plan || current.description)
  const built = await implementWithGates(ctx, current, worktreePath, formatBuildPrompt(current, plan, spec), 'Implementação da solução', plan)
  await commit(ctx, worktreePath, built.build.commitMessage || `feat: ${task.title}`)

  current = await saveState(current, { state: 'qa_security' })
  ctx.send({ type: 'status', message: 'Tester: cobrindo os cenários de teste...' })
  const { result: testerRun, envelope: testEnv } = await agentStep(ctx, current, 'tester', { name: 'Testes e cobertura', phase: 'qa_security' },
    { prompt: formatTestPrompt(current, built.tests, plan, spec), cwd: worktreePath }, t => parseTestEnvelope(t, built.tests.passed))

  // Tests the Tester wrote are part of the delivery; the code, not the agent's report, decides if they pass
  let tests = built.tests
  if ((await uncommittedFiles(worktreePath)).length > 0) {
    await commit(ctx, worktreePath, `test: cobre "${task.title.slice(0, 50)}"`)
    tests = await runTests(ctx, current, worktreePath, 'Portão: verificação com os testes novos')
  }

  const outcome = await reviewAndFix(ctx, current, worktreePath, tests, spec, plan)
  tests = outcome.tests ?? tests
  const docs = await document(ctx, current, worktreePath, outcome.review, spec)

  return finishReview(current, worktreePath, outcome, tests, testEnv.details || testerRun.text, { spec, plan, build: built.build, test: testEnv, docs })
}

// The developer's feedback goes through the same gates and the same review squad as the first build.
// A failed or stopped adjust puts the worktree back where the last review left it: the task returns
// to 'review' showing that review, and a merge must not carry commits nobody reviewed.
export async function adjustTask(ctx: ExecContext, task: FactoryTask, feedback: string): Promise<FactoryTask> {
  const worktreePath = task.worktreePath!
  const reviewedHead = await headOf(worktreePath)
  try {
    return await adjustReviewedWork(ctx, task, worktreePath, feedback)
  } catch (e) {
    await resetWorktree(worktreePath, reviewedHead)
    throw e
  }
}

async function adjustReviewedWork(ctx: ExecContext, task: FactoryTask, worktreePath: string, feedback: string): Promise<FactoryTask> {
  await startPhase(task, { state: 'building' })
  const spec = task.handoffs?.spec
  const plan = task.handoffs?.plan
  const built = await implementWithGates(ctx, task, worktreePath, formatAdjustPrompt(task, feedback, spec), 'Ajuste pedido pelo desenvolvedor', plan)
  await commit(ctx, worktreePath, built.build.commitMessage || `fix: ajuste conforme revisão de "${task.title.slice(0, 40)}"`)

  const current = await saveState(task, { state: 'qa_security' })
  const outcome = await reviewAndFix(ctx, current, worktreePath, built.tests, spec, plan)
  const tests = outcome.tests ?? built.tests
  const summary = tests.passed ? `Verificação passou após o ajuste "${feedback.slice(0, 120)}".` : `Verificação falhou após o ajuste "${feedback.slice(0, 120)}".`
  return finishReview(current, worktreePath, outcome, tests, summary, { ...current.handoffs, build: built.build })
}

async function finishReview(
  task: FactoryTask,
  worktreePath: string,
  outcome: ReviewOutcome,
  tests: TestsGateResult,
  qaSummary: string,
  handoffs: FactoryTask['handoffs'],
): Promise<FactoryTask> {
  const { diff, stat } = await getWorktreeDiff(worktreePath, task.baseBranch)
  const summary = [outcome.review.summary, outcome.security.summary].filter(Boolean).join('\n\n')
  return saveState(task, {
    state: 'review',
    diffContent: diff,
    diffStat: stat,
    qaReport: {
      // A suite that did not run is not a pass
      passed: tests.passed && !(tests.skipped && tests.command),
      summary: qaSummary,
      output: tests.output,
      testsRan: tests.command,
    },
    securityReport: { passed: outcome.passed, findings: outcome.findings, criteria: outcome.review.criteria, summary, fixRounds: outcome.fixRounds },
    reviewedHead: await headOf(worktreePath),
    handoffs: { ...handoffs, review: outcome.review, security: outcome.security },
  })
}
