// The factory pipeline: which agent runs when, which gate checks it, and what happens on failure.
// Agent proposes, code disposes: agents write and judge, code verifies, commits and decides the verdict.
// HTTP concerns (SSE, state guards) stay in server/routes/factory.ts.

import { defaultFactoryStore as store } from './store.ts'
import { commitWorktree, createWorktree, discardFiles, fetchBase, getWorktreeDiff, headOf, mergeBaseOf, resetWorktree, syncWithBase, uncommittedFiles, withCommitCheckout, type BaseSync } from './worktree.ts'
import { runFactoryAgent } from './runner.ts'
import { checkCriteriaCoverage, computeBlastRadius, docsCiting, gateArtifactsExist, gateDiffNotEmpty, gateNoQualityDegradation, gateTestsPass, nonDocFiles, nonTestFiles, verifyBaseline, type TestsGateResult } from './gates.ts'
import { runSecurityScans, scanFindings } from './scanners.ts'
import { assessDelivery } from './readiness.ts'
import { ExecutionCancelledError, throwIfCancelled } from './executions.ts'
import {
  applyVerifierEnvelope,
  computeVerdict,
  criteriaIds,
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
  formatVerifyPrompt,
  incompleteReview,
  mergeFindings,
  parseBuildEnvelope,
  parseDocsEnvelope,
  parsePlanEnvelope,
  parseReviewEnvelope,
  parseSpecEnvelope,
  withGivenCriteria,
  parseTestEnvelope,
} from './envelopes.ts'
import { taskUsage } from './types.ts'
import type { BuildEnvelope, ExecutionSpan, FactoryTask, PlanEnvelope, ReviewEnvelope, ScanToolResult, SecurityFinding, SpecEnvelope, SpecializedAgentId, TestEnvelope, VerifyBaseline } from './types.ts'
import type { RunResult } from '../ai/runner.ts'
import { say } from '../i18n.ts'

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
  // Re-read so spans and tool calls recorded meanwhile are kept. A task deleted meanwhile stays
  // deleted: saving the in-memory copy would bring it back.
  const fresh = await store.getTask(task.id)
  if (!fresh) throw new ExecutionCancelledError()
  const next = { ...fresh, ...patch, updatedAt: now() }
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
    throw new Error(say({ en: `Cost cap reached: US$ ${spent.toFixed(2)} spent of US$ ${task.budgetUsd.toFixed(2)}. Raise the task cap to go on.`, pt: `Teto de custo atingido: US$ ${spent.toFixed(2)} gastos de US$ ${task.budgetUsd.toFixed(2)}. Aumente o teto da tarefa para continuar.` }))
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

const runTests = (ctx: ExecContext, task: FactoryTask, worktreePath: string, name: string) => {
  let baseline: Promise<VerifyBaseline> | undefined
  return codeStep(
    ctx,
    'gate',
    { name, phase: 'qa_security' },
    () => gateTestsPass(worktreePath, { command: task.verifyCommand, smokeCommand: task.smokeCommand, signal: ctx.signal, baseline: () => (baseline ??= baselineOf(ctx, task, worktreePath)) }),
    r => (r.passed ? undefined : r.reason),
    r => ({ command: r.command, steps: r.steps, output: r.output, skipped: r.skipped }),
  )
}

// What the verification printed on the commit the task started from, asked for only when a step
// fails. Kept on the task and run again only when that commit changes (a rebase moves it).
async function baselineOf(ctx: ExecContext, task: FactoryTask, worktreePath: string): Promise<VerifyBaseline> {
  const baseCommit = await mergeBaseOf(worktreePath, task.baseBranch)
  const known = (await reload(task)).verifyBaseline
  if (known?.baseCommit === baseCommit) return known
  ctx.send({ type: 'status', message: say({ en: `Verification failed: running it on ${task.baseBranch} to tell old failures from new ones...`, pt: `A verificação falhou: rodando no ${task.baseBranch} para separar falha antiga de falha nova...` }) })
  const baseline = await codeStep(ctx, 'gate', { name: say({ en: `Verification on ${task.baseBranch} (failures that already existed)`, pt: `Verificação no ${task.baseBranch} (falhas que já existiam)` }), phase: 'qa_security' },
    () => withCommitCheckout(task.source.repoPath, `${worktreePath}.base`, baseCommit, dir =>
      verifyBaseline(dir, baseCommit, { command: task.verifyCommand, smokeCommand: task.smokeCommand, signal: ctx.signal })),
    undefined,
    r => ({ baseCommit: r.baseCommit, steps: r.steps.map(st => `${st.command}: ${st.passed ? 'ok' : `${st.failures.length} linha(s) de falha`}`) }))
  await saveState(task, { verifyBaseline: baseline })
  return baseline
}

const commit = (ctx: ExecContext, worktreePath: string, message: string) =>
  codeStep(ctx, 'code', { name: `Commit: ${message.slice(0, 60)}`, phase: 'qa_security' }, () => commitWorktree(worktreePath, message))

// ── Build with gates and correction loop ─────────────────────────────────────

type GateOutcome = { failure?: string; fatal: boolean; tests: TestsGateResult }

async function checkBuildGates(ctx: ExecContext, task: FactoryTask, worktreePath: string, build: BuildEnvelope): Promise<GateOutcome> {
  const diff = await codeStep(ctx, 'gate', { name: say({ en: 'Gate: something changed', pt: 'Portão: há alterações' }), phase: 'qa_security' }, () => gateDiffNotEmpty(worktreePath, task.baseBranch), r => r.reason)
  const skippedTests: TestsGateResult = { passed: false, skipped: true, output: '', exitCode: -1, durationMs: 0 }
  if (!diff.passed) return { failure: diff.reason, fatal: true, tests: skippedTests }

  if (build.changedFiles.length > 0) {
    const artifacts = await codeStep(
      ctx, 'gate', { name: say({ en: 'Gate: declared files exist', pt: 'Portão: arquivos declarados existem' }), phase: 'qa_security' },
      async () => gateArtifactsExist(worktreePath, build.changedFiles, diff.filesChanged),
      r => r.reason,
    )
    if (!artifacts.passed) return { failure: artifacts.reason, fatal: true, tests: skippedTests }
  }

  const quality = await codeStep(
    ctx, 'gate', { name: say({ en: 'Gate: quality floor (no suppressions)', pt: 'Portão: piso de qualidade (sem supressões)' }), phase: 'qa_security' },
    () => gateNoQualityDegradation(worktreePath, task.baseBranch),
    r => r.reason,
  )
  if (!quality.passed) return { failure: quality.reason, fatal: true, tests: skippedTests }

  const tests = await runTests(ctx, task, worktreePath, say({ en: 'Gate: project verification', pt: 'Portão: verificação do projeto' }))
  // A suite that could not run (no command, no bwrap) is reported to the human, not "fixed" by the agent
  if (tests.passed || tests.skipped) return { fatal: false, tests }
  return { failure: `Comando: ${tests.command}\n${tests.output}`, fatal: false, tests }
}

// Session-level correction: a failed gate re-prompts the same CLI session (Claude) with exactly
// what failed, instead of starting over. Exhausted attempts: a broken diff aborts the run;
// failing tests go on to the review rounds, which hand them back to the Implementer.
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
    ctx.send({ type: 'status', message: attempt === 1 ? `Implementer: ${name.toLowerCase()}...` : say({ en: `Implementer: fix ${attempt - 1} of ${MAX_BUILD_ATTEMPTS - 1} after a failed gate...`, pt: `Implementer: correção ${attempt - 1} de ${MAX_BUILD_ATTEMPTS - 1} após portão reprovado...` }) })
    const { result, envelope: build }: { result: RunResult; envelope: BuildEnvelope } = await agentStep(
      ctx, task, 'implementer',
      { name: attempt === 1 ? name : say({ en: `Fix ${attempt - 1} (failed gate)`, pt: `Correção ${attempt - 1} (portão reprovado)` }), phase: 'building' },
      { prompt, cwd: worktreePath, resumeSessionId: sessionId },
      text => parseBuildEnvelope(text),
    )
    if (build.status === 'error') throw new Error(say({ en: `The Implementer stopped on a blocker: ${build.summary}`, pt: `O Implementer parou com um bloqueio: ${build.summary}` }))

    const gates = await checkBuildGates(ctx, task, worktreePath, build)
    if (!gates.failure) return { build, tests: gates.tests }
    if (attempt >= MAX_BUILD_ATTEMPTS) {
      if (gates.fatal) throw new Error(say({ en: `Acceptance gate failed after ${attempt} attempts: ${gates.failure}`, pt: `Portão de aceitação falhou após ${attempt} tentativas: ${gates.failure}` }))
      return { build, tests: gates.tests }
    }
    sessionId = result.sessionId
    prompt = formatCorrectionPrompt(task, gates.failure, Boolean(sessionId), plan)
  }
}

// ── Tester ───────────────────────────────────────────────────────────────────

// What the QA side knows so far. The Tester runs after the build and again after every change to
// the code (fix round, adjustment), so the final tests always describe the final code.
type QaState = {
  tests: TestsGateResult
  testEnv?: TestEnvelope
  testerSummary?: string
  // Non-test files the Tester changed across its runs
  testerTouched: string[]
}

async function testStep(ctx: ExecContext, task: FactoryTask, worktreePath: string, qa: QaState, plan?: PlanEnvelope, spec?: SpecEnvelope, changedSince?: string): Promise<QaState> {
  ctx.send({ type: 'status', message: say({ en: 'Tester: covering the acceptance criteria with tests...', pt: 'Tester: cobrindo os critérios de aceite com testes...' }) })
  const { result, envelope } = await agentStep(ctx, task, 'tester',
    { name: changedSince ? say({ en: 'Tests after the change', pt: 'Testes depois da mudança' }) : say({ en: 'Tests and coverage', pt: 'Testes e cobertura' }), phase: 'qa_security' },
    { prompt: formatTestPrompt(task, qa.tests, plan, spec, changedSince), cwd: worktreePath }, t => parseTestEnvelope(t, qa.tests.passed))

  // Tests the Tester wrote are part of the delivery; the code, not the agent's report, decides if they pass
  const changed = await uncommittedFiles(worktreePath)
  let tests = qa.tests
  if (changed.length > 0) {
    await commit(ctx, worktreePath, `test: cover "${task.title.slice(0, 50)}"`)
    tests = await runTests(ctx, task, worktreePath, say({ en: 'Gate: verification with the new tests', pt: 'Portão: verificação com os testes novos' }))
  }
  const testerTouched = [...new Set([...qa.testerTouched, ...nonTestFiles(changed)])]
  return { tests, testEnv: envelope, testerSummary: envelope.details || result.text, testerTouched }
}

// ── Review squad ─────────────────────────────────────────────────────────────

type ReviewOutcome = { review: ReviewEnvelope; security: ReviewEnvelope; tools: ScanToolResult[]; findings: SecurityFinding[]; passed: boolean; fixRounds: number; qa: QaState }

// The security tools run first (their output is evidence for the Security agent), then Reviewer and
// Security in parallel. allSettled: when one fails, the other is still awaited, so
// nothing keeps writing after the run is marked failed. Each reviewer re-checks only its own earlier
// findings: handed the merged list, Security repeated the Reviewer's. Security runs every round:
// a fix for a Reviewer finding can open a hole as easily as any other change.
async function reviewSquad(
  ctx: ExecContext, task: FactoryTask, worktreePath: string, round: number,
  previous: SecurityFinding[], tests: TestsGateResult, spec?: SpecEnvelope,
) {
  const { diff, stat } = await getWorktreeDiff(worktreePath, task.baseBranch)
  const suffix = round > 0 ? ` (rodada ${round + 1})` : ''
  const own = (agentId: SpecializedAgentId) => previous.filter(f => f.agentId === agentId)

  const tools = await codeStep(ctx, 'gate', { name: say({ en: `Security tools${suffix}`, pt: `Ferramentas de segurança${suffix}` }), phase: 'qa_security' },
    () => runSecurityScans(worktreePath, task.baseBranch, stat.files, ctx.signal),
    r => (r.some(t => t.status === 'failed') ? r.filter(t => t.status === 'failed').map(t => t.tool).join(', ') : undefined),
    r => ({ tools: r.map(t => `${t.tool}: ${t.status}`) }))

  ctx.send({ type: 'status', message: say({ en: `Reviewer and Security: reviewing the diff in parallel${suffix}...`, pt: `Reviewer e Security: revisando o diff em paralelo${suffix}...` }) })
  const settled = await Promise.allSettled([
    agentStep(ctx, task, 'reviewer', { name: say({ en: `Code review${suffix}`, pt: `Revisão de código${suffix}` }), phase: 'qa_security' },
      { prompt: formatReviewPrompt(task, diff, spec, own('reviewer'), tests), cwd: worktreePath }, t => parseReviewEnvelope(t, 'reviewer')),
    agentStep(ctx, task, 'security', { name: say({ en: `Security audit${suffix}`, pt: `Auditoria de segurança${suffix}` }), phase: 'qa_security' },
      { prompt: formatSecurityPrompt(task, diff, own('security'), tools), cwd: worktreePath }, t => parseReviewEnvelope(t, 'security')),
  ])
  const rejected = settled.find(s => s.status === 'rejected')
  if (rejected) throw rejected.reason
  const [review, security] = settled.map(s => (s as PromiseFulfilledResult<{ envelope: ReviewEnvelope }>).value.envelope)
  return { review, security: { ...security, findings: [...scanFindings(tools), ...security.findings] }, tools }
}

// The Verifier tries to refute each finding that would block. Only those that resist keep blocking;
// the refuted ones stay on display with the reason, for the human to confirm.
async function verifyFindings(ctx: ExecContext, task: FactoryTask, worktreePath: string, findings: SecurityFinding[], round: number, spec?: SpecEnvelope): Promise<SecurityFinding[]> {
  const contested = computeVerdict(findings).blocking
  if (contested.length === 0) return findings
  ctx.send({ type: 'status', message: say({ en: `Verifier: trying to refute ${contested.length} blocking finding(s)...`, pt: `Verifier: tentando refutar ${contested.length} achado(s) bloqueante(s)...` }) })
  const suffix = round > 0 ? ` (rodada ${round + 1})` : ''
  const { envelope: checked } = await agentStep(ctx, task, 'verifier', { name: say({ en: `Finding verification${suffix}`, pt: `Verificação dos achados${suffix}` }), phase: 'qa_security' },
    { prompt: formatVerifyPrompt(task, contested, spec), cwd: worktreePath }, t => applyVerifierEnvelope(t, contested))
  return findings.map(f => checked[contested.indexOf(f)] ?? f)
}

// A review the code cannot trust becomes a blocking finding for the human, never a pass.
const incompleteFinding = (description: string): SecurityFinding => ({ severity: 'high', confidence: 100, description })

// Failing verification is fixed in the same rounds as the findings: after 3 build attempts it is
// the most likely thing still wrong, and the next round's tests must describe the fixed code.
async function reviewAndFix(ctx: ExecContext, task: FactoryTask, worktreePath: string, qa: QaState, spec?: SpecEnvelope, plan?: PlanEnvelope): Promise<ReviewOutcome> {
  let previous: SecurityFinding[] = []
  for (let round = 0; ; round++) {
    const { review, security, tools } = await reviewSquad(ctx, task, worktreePath, round, previous, qa.tests, spec)
    let findings = mergeFindings(review.findings, security.findings)
    const outcome = (passed: boolean, extra: SecurityFinding[] = []) =>
      ({ review, security, tools, findings: [...extra, ...findings], passed, fixRounds: round, qa })

    const incomplete = incompleteReview(review, security, criteriaIds(spec))
    if (incomplete.length) return outcome(false, incomplete.map(incompleteFinding))
    findings = await verifyFindings(ctx, task, worktreePath, findings, round, spec)
    const verdict = computeVerdict(findings, review.criteria)
    const testsFail = !qa.tests.passed && !qa.tests.skipped
    if ((verdict.passed && !testsFail) || round >= MAX_FIX_ROUNDS) return outcome(verdict.passed)

    const failure = testsFail ? `${qa.tests.command}\n${qa.tests.output}` : undefined
    const fixed = await implementWithGates(ctx, task, worktreePath, formatFixFindingsPrompt(task, verdict.blocking, verdict.unmet, plan, failure), say({ en: `Fixing the review findings (round ${round + 1})`, pt: `Correção dos achados da revisão (rodada ${round + 1})` }), plan)
    // The diff gate compares with the base, so a fix that changed nothing still passes it; reviewing
    // the same code again would only buy the same findings.
    if ((await uncommittedFiles(worktreePath)).length === 0) {
      const stuck = say({ en: `The automatic fix of round ${round + 1} changed no file; what is left is for you to decide.`, pt: `A correção automática da rodada ${round + 1} não alterou nenhum arquivo; o que sobrou fica para você decidir.` })
      return outcome(verdict.passed, verdict.passed ? [] : [incompleteFinding(stuck)])
    }
    await commit(ctx, worktreePath, `fix: address automatic review findings (round ${round + 1})`)
    qa = await testStep(ctx, task, worktreePath, { ...qa, tests: fixed.tests }, plan, spec, say({ en: `fix round ${round + 1}`, pt: `rodada ${round + 1} de correção` }))
    previous = findings
  }
}

// ── Documenter ───────────────────────────────────────────────────────────────

// Runs before the review, so the review reads what it wrote. Skipped when no documentation names a
// changed file: in the one real task it changed nothing and cost 7%. The MR description then falls
// back to the Reviewer's draft.
async function document(ctx: ExecContext, task: FactoryTask, worktreePath: string, buildSummary: string, spec?: SpecEnvelope) {
  const { stat } = await getWorktreeDiff(worktreePath, task.baseBranch)
  const citing = await codeStep(ctx, 'code', { name: say({ en: 'Documentation citing the changed files', pt: 'Documentação que cita os arquivos alterados' }), phase: 'qa_security' },
    () => docsCiting(worktreePath, stat.files), undefined, docs => ({ docs }))
  if (citing.length === 0) return undefined
  ctx.send({ type: 'status', message: say({ en: 'Documenter: updating the affected documentation and the MR description...', pt: 'Documenter: atualizando a documentação afetada e a descrição do MR...' }) })
  const { envelope: docs } = await agentStep(ctx, task, 'documenter', { name: say({ en: 'Documentation and MR description', pt: 'Documentação e descrição do MR' }), phase: 'qa_security' },
    { prompt: formatDocsPrompt(task, stat.files, buildSummary, spec), cwd: worktreePath }, parseDocsEnvelope)

  // The Documenter may only touch docs: anything else it changed is thrown away by code
  await codeStep(ctx, 'gate', { name: say({ en: 'Gate: Documenter only changes docs', pt: 'Portão: Documenter só altera documentação' }), phase: 'qa_security' },
    async () => {
      const outside = nonDocFiles(await uncommittedFiles(worktreePath))
      await discardFiles(worktreePath, outside)
      return outside
    },
    outside => (outside.length ? say({ en: `Changes outside the documentation discarded: ${outside.join(', ')}`, pt: `Alterações fora da documentação descartadas: ${outside.join(', ')}` }) : undefined),
  )
  await commit(ctx, worktreePath, `docs: update documentation for "${task.title.slice(0, 50)}"`)
  return docs
}

// ── Base sync ────────────────────────────────────────────────────────────────

// The last verification runs on top of the newest base, so a merge carries code verified on what
// it lands on. Only a rebase that moved the branch needs the verification again.
async function syncAndVerify(ctx: ExecContext, task: FactoryTask, worktreePath: string, tests: TestsGateResult): Promise<{ tests: TestsGateResult; sync: BaseSync }> {
  const sync = await codeStep(ctx, 'code', { name: say({ en: `Sync with ${task.baseBranch}`, pt: `Sincronização com ${task.baseBranch}` }), phase: 'qa_security' },
    () => syncWithBase(worktreePath, task.baseBranch), r => (r.status === 'conflict' ? r.detail : undefined), r => ({ status: r.status, baseHead: r.baseHead }))
  if (sync.status !== 'rebased') return { tests, sync }
  return { tests: await runTests(ctx, task, worktreePath, say({ en: 'Gate: verification on the current base', pt: 'Portão: verificação sobre a base atual' })), sync }
}

// Called before a finish: a base that moved since the last verification means rebase and verify again.
export async function reverifyOnNewBase(ctx: ExecContext, task: FactoryTask): Promise<FactoryTask> {
  const worktreePath = task.worktreePath
  if (!worktreePath || !task.qaReport) return task
  const baseHead = await fetchBase(worktreePath, task.baseBranch).catch(() => task.verifiedBase)
  if (!baseHead || baseHead === task.verifiedBase) return task
  ctx.send({ type: 'status', message: say({ en: `${task.baseBranch} moved since the verification: rebasing and verifying again...`, pt: `${task.baseBranch} andou desde a verificação: fazendo rebase e verificando de novo...` }) })
  const lastRun: TestsGateResult = { passed: task.qaReport.passed, command: task.qaReport.testsRan, steps: task.qaReport.steps, output: task.qaReport.output ?? '', exitCode: 0, durationMs: 0 }
  const { tests, sync } = await syncAndVerify(ctx, task, worktreePath, lastRun)
  const { diff, stat } = await getWorktreeDiff(worktreePath, task.baseBranch)
  const blastRadius = await computeBlastRadius(worktreePath, stat.files).catch(() => task.blastRadius)
  const patch: Partial<FactoryTask> = {
    diffContent: diff,
    diffStat: stat,
    blastRadius,
    qaReport: { ...task.qaReport, ...qaRun(tests), qualityFloor: await qualityFloor(worktreePath, task.baseBranch), baseSync: { status: sync.status, detail: sync.detail } },
    reviewedHead: await headOf(worktreePath),
    verifiedBase: sync.baseHead,
  }
  return saveState(task, { ...patch, readiness: assessDelivery({ ...task, ...patch }) })
}

// ── Phases called by the routes ──────────────────────────────────────────────

// Analyst then Architect. Open questions stop here: guessing a business rule costs a whole build.
export async function planTask(ctx: ExecContext, task: FactoryTask): Promise<FactoryTask> {
  const base = await startPhase(task, { state: 'planning' })
  ctx.send({ type: 'status', message: say({ en: 'Analyst: writing the acceptance criteria...', pt: 'Analyst: especificando critérios de aceite...' }) })
  const { envelope: spec } = await agentStep(ctx, base, 'analyst', { name: say({ en: 'Specification and acceptance criteria', pt: 'Especificação e critérios de aceite' }), phase: 'planning' },
    { prompt: formatSpecPrompt(base), cwd: base.source.repoPath }, text => withGivenCriteria(parseSpecEnvelope(text), base.givenCriteria))

  if (spec.openQuestions.length > 0) {
    return saveState(base, { state: 'waiting_clarification', handoffs: { ...base.handoffs, spec } })
  }

  ctx.send({ type: 'status', message: say({ en: 'Architect: drafting the technical plan...', pt: 'Architect: elaborando o plano técnico...' }) })
  const { envelope: plan } = await agentStep(ctx, base, 'architect', { name: say({ en: 'Architectural planning', pt: 'Planejamento arquitetural' }), phase: 'planning' },
    { prompt: formatPlanPrompt(base, spec), cwd: base.source.repoPath }, parsePlanEnvelope)
  return saveState(base, { state: 'waiting_approval', plan: plan.plan, handoffs: { ...base.handoffs, spec, plan } })
}

export async function buildTask(ctx: ExecContext, task: FactoryTask): Promise<FactoryTask> {
  ctx.send({ type: 'status', message: say({ en: 'Creating the isolated Git worktree...', pt: 'Criando a Git Worktree isolada...' }) })
  await startPhase(task, { state: 'building' })
  const { worktreePath, branchName } = await codeStep(ctx, 'code', { name: say({ en: 'Git worktree creation', pt: 'Criação da Git Worktree' }), phase: 'building' },
    () => createWorktree(task.source.repoPath, task.id, task.baseBranch))
  let current = await saveState(task, { worktreePath, branchName })

  const spec = current.handoffs?.spec
  const plan = current.handoffs?.plan ?? parsePlanEnvelope(current.plan || current.description)
  const built = await implementWithGates(ctx, current, worktreePath, formatBuildPrompt(current, plan, spec), say({ en: 'Implementing the solution', pt: 'Implementação da solução' }), plan)
  await commit(ctx, worktreePath, built.build.commitMessage || `feat: ${task.title}`)

  current = await saveState(current, { state: 'qa_security' })
  const qa = await testStep(ctx, current, worktreePath, { tests: built.tests, testerTouched: [] }, plan, spec)
  const docs = await document(ctx, current, worktreePath, built.build.summary, spec)
  const outcome = await reviewAndFix(ctx, current, worktreePath, qa, spec, plan)
  const { tests, sync } = await syncAndVerify(ctx, current, worktreePath, outcome.qa.tests)

  return finishReview(current, worktreePath, outcome, { ...outcome.qa, tests }, sync, outcome.qa.testerSummary ?? '', { spec, plan, build: built.build, test: outcome.qa.testEnv, docs })
}

// The developer's feedback goes through the same gates, Tester and review squad as the first build.
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
  const built = await implementWithGates(ctx, task, worktreePath, formatAdjustPrompt(task, feedback, spec), say({ en: 'Adjustment requested by the developer', pt: 'Ajuste pedido pelo desenvolvedor' }), plan)
  await commit(ctx, worktreePath, built.build.commitMessage || `fix: adjust "${task.title.slice(0, 40)}" after review`)

  const current = await saveState(task, { state: 'qa_security' })
  const asked = feedback.slice(0, 120)
  const qa = await testStep(ctx, current, worktreePath, { tests: built.tests, testerTouched: task.qaReport?.testerTouched ?? [] }, plan, spec,
    say({ en: `adjustment "${asked}"`, pt: `ajuste "${asked}"` }))
  const outcome = await reviewAndFix(ctx, current, worktreePath, qa, spec, plan)
  const { tests, sync } = await syncAndVerify(ctx, current, worktreePath, outcome.qa.tests)
  const summary = tests.passed
    ? say({ en: `Verification passed after the adjustment "${asked}".`, pt: `Verificação passou após o ajuste "${asked}".` })
    : say({ en: `Verification failed after the adjustment "${asked}".`, pt: `Verificação falhou após o ajuste "${asked}".` })
  return finishReview(current, worktreePath, outcome, { ...outcome.qa, tests }, sync, `${summary}\n\n${outcome.qa.testerSummary ?? ''}`.trim(),
    { ...current.handoffs, build: built.build, test: outcome.qa.testEnv })
}

// The verification fields of the QA report. A suite that did not run is never a pass.
const qaRun = (tests: TestsGateResult) => ({ passed: tests.passed, output: tests.output, testsRan: tests.command, steps: tests.steps })

// The build gate only sees the Implementer's turn; this one sees everything that ships, Tester included
const qualityFloor = (worktreePath: string, baseBranch: string) =>
  gateNoQualityDegradation(worktreePath, baseBranch).then(r => r.passed ? undefined : r.reason)

async function finishReview(
  task: FactoryTask,
  worktreePath: string,
  outcome: ReviewOutcome,
  qa: QaState,
  sync: BaseSync,
  qaSummary: string,
  handoffs: FactoryTask['handoffs'],
): Promise<FactoryTask> {
  const { diff, stat } = await getWorktreeDiff(worktreePath, task.baseBranch)
  const blastRadius = await computeBlastRadius(worktreePath, stat.files).catch(() => undefined)
  const summary = [outcome.review.summary, outcome.security.summary].filter(Boolean).join('\n\n')
  const ids = criteriaIds(handoffs?.spec)
  const patch: Partial<FactoryTask> = {
    state: 'review',
    diffContent: diff,
    diffStat: stat,
    blastRadius,
    qaReport: {
      ...qaRun(qa.tests),
      summary: qaSummary,
      criteria: ids.length ? checkCriteriaCoverage(worktreePath, ids, qa.testEnv?.criteriaTests ?? []) : undefined,
      testerTouched: qa.testerTouched,
      qualityFloor: await qualityFloor(worktreePath, task.baseBranch),
      baseSync: { status: sync.status, detail: sync.detail },
    },
    securityReport: { passed: outcome.passed, findings: outcome.findings, criteria: outcome.review.criteria, summary, fixRounds: outcome.fixRounds, tools: outcome.tools },
    reviewedHead: await headOf(worktreePath),
    verifiedBase: sync.baseHead,
    handoffs: { ...handoffs, review: outcome.review, security: outcome.security },
  }
  return saveState(task, { ...patch, readiness: assessDelivery({ ...task, ...patch }) })
}
