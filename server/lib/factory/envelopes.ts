// Envelopes estruturados de Handoff entre agentes e fases.
// Inspirado em contratos tipados do Super Simple Software Factory.
// Autoteste: node server/lib/factory/envelopes.ts --selfcheck

import assert from 'node:assert/strict'
import type {
  BuildEnvelope,
  CriterionCheck,
  DocsEnvelope,
  FactoryTask,
  PlanEnvelope,
  ReviewEnvelope,
  ScanToolResult,
  SecurityFinding,
  SpecEnvelope,
  SpecializedAgentId,
  TestEnvelope,
} from './types.ts'
import { say } from '../i18n.ts'

const FENCE = /```(?:json)?\s*([\s\S]*?)\s*```/g

// The envelope is the LAST parseable fenced block: the prose before it may carry
// its own code samples (a plan with a ```ts snippet, for instance).
export function extractJsonFromMarkdown(text: string): any | null {
  const blocks = [...text.matchAll(FENCE)].reverse()
  for (const m of blocks) {
    try {
      return JSON.parse(m[1])
    } catch {
      // not the envelope, try the previous block
    }
  }
  try {
    return JSON.parse(text.trim())
  } catch {
    return null
  }
}

// The prose the agent wrote around the envelope (the envelope block removed).
function proseWithoutEnvelope(text: string): string {
  const last = [...text.matchAll(FENCE)].findLast(m => {
    try {
      JSON.parse(m[1])
      return true
    } catch {
      return false
    }
  })
  if (!last || last.index === undefined) return text.trim()
  return (text.slice(0, last.index) + text.slice(last.index + last[0].length)).trim()
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])
const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback)
const statusOf = (p: any): 'ok' | 'error' => (p?.status === 'error' ? 'error' : 'ok')

function envelopeInstruction(example: object): string {
  return ['Ao final da resposta, inclua um bloco JSON estrito no formato:', '```json', JSON.stringify(example, null, 2), '```'].join('\n')
}

const bullets = (title: string, items: string[]) => (items.length ? `${title}:\n${items.map(i => `- ${i}`).join('\n')}` : '')

function demandBlock(task: FactoryTask): string {
  return [
    `Título: ${task.title}`,
    `Descrição:\n${task.description || 'Sem descrição adicional.'}`,
    task.clarifications ? `Respostas do desenvolvedor às dúvidas anteriores:\n${task.clarifications}` : '',
    task.source.issueUrl ? `Issue original: ${task.source.issueUrl}` : '',
  ].filter(Boolean).join('\n\n')
}

// CA1, CA2...: every agent and gate names a criterion by its id, so a reviewer that rephrases or
// skips one is caught by matching ids instead of counting.
export const criteriaIds = (spec?: SpecEnvelope) => (spec?.acceptanceCriteria ?? []).map((_, i) => `CA${i + 1}`)

function specBlock(spec?: SpecEnvelope): string {
  if (!spec) return ''
  const ids = criteriaIds(spec)
  return [bullets('Critérios de aceite', spec.acceptanceCriteria.map((c, i) => `${ids[i]}: ${c}`)), bullets('Fora do escopo', spec.outOfScope)].filter(Boolean).join('\n\n')
}

// 0. Envelope de Especificação (Analyst -> Architect)
export function parseSpecEnvelope(text: string): SpecEnvelope {
  const parsed = extractJsonFromMarkdown(text)
  if (!parsed || typeof parsed !== 'object') {
    // No contract: keep the prose as the spec and do not stop the pipeline on a guess
    return { status: 'ok', summary: text.trim(), acceptanceCriteria: [], outOfScope: [], openQuestions: [] }
  }
  return {
    status: statusOf(parsed),
    summary: str(parsed.summary, proseWithoutEnvelope(text)),
    acceptanceCriteria: strings(parsed.acceptanceCriteria),
    outOfScope: strings(parsed.outOfScope),
    openQuestions: strings(parsed.openQuestions),
  }
}

export function formatSpecPrompt(task: FactoryTask): string {
  return [
    'Especifique a seguinte demanda antes do planejamento técnico:',
    demandBlock(task),
    envelopeInstruction({
      status: 'ok',
      summary: 'O problema em duas frases, como o usuário o vive',
      acceptanceCriteria: ['Dado ..., quando ..., então ...'],
      outOfScope: ['O que não será feito'],
      openQuestions: [],
    }),
  ].join('\n\n')
}

// 1. Envelope de Planejamento (Architect -> Implementer)
// `plan` keeps the full markdown the Architect wrote: the JSON `plan` field is only a
// summary, and handing the summary to the Implementer throws the real plan away.
export function parsePlanEnvelope(text: string): PlanEnvelope {
  const parsed = extractJsonFromMarkdown(text)
  if (parsed && typeof parsed === 'object') {
    const prose = proseWithoutEnvelope(text)
    return {
      status: statusOf(parsed),
      plan: prose || str(parsed.plan, text),
      targetFiles: strings(parsed.targetFiles),
      risks: strings(parsed.risks),
      testScenarios: strings(parsed.testScenarios),
    }
  }

  // Fallback heurístico a partir do markdown livre
  const targetFiles: string[] = []
  for (const m of text.matchAll(/(?:arquivo|file|path):\s*`?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)`?/gi)) {
    if (!targetFiles.includes(m[1])) targetFiles.push(m[1])
  }
  return { status: 'ok', plan: text, targetFiles, risks: [], testScenarios: [] }
}

export function formatPlanPrompt(task: FactoryTask, spec?: SpecEnvelope): string {
  return [
    'Analise o repositório e elabore um plano técnico para a seguinte demanda:',
    demandBlock(task),
    specBlock(spec),
    `Branch base: ${task.baseBranch}`,
    'Você deve produzir um plano estruturado com visão geral, passos de implementação, arquivos-alvo, riscos e cenários de teste.',
    envelopeInstruction({ status: 'ok', plan: 'Resumo dos passos', targetFiles: ['src/exemplo.ts'], risks: ['Risco 1'], testScenarios: ['Cenário 1'] }),
  ].filter(Boolean).join('\n\n')
}

// 2. Envelope de Construção (Implementer -> Gates/Tester)
export function parseBuildEnvelope(text: string, changedFilesFallback: string[] = []): BuildEnvelope {
  const parsed = extractJsonFromMarkdown(text)
  const fallbackMessage = 'feat: implementacao da demanda'
  if (parsed && typeof parsed === 'object') {
    return {
      status: statusOf(parsed),
      changedFiles: Array.isArray(parsed.changedFiles) ? strings(parsed.changedFiles) : changedFilesFallback,
      commitMessage: str(parsed.commitMessage, fallbackMessage),
      summary: str(parsed.summary, text.slice(0, 1000)),
    }
  }
  return { status: 'ok', changedFiles: changedFilesFallback, commitMessage: fallbackMessage, summary: text.slice(0, 1000) }
}

const BUILD_EXAMPLE = (task: FactoryTask) => ({
  status: 'ok',
  changedFiles: ['src/exemplo.ts'],
  commitMessage: `feat: ${task.title}`,
  summary: 'Resumo das alterações realizadas',
})

export function formatBuildPrompt(task: FactoryTask, planEnv: PlanEnvelope, spec?: SpecEnvelope): string {
  return [
    'Implemente o código na worktree atual seguindo o plano técnico aprovado:',
    `Título: ${task.title}`,
    specBlock(spec),
    `Plano:\n${planEnv.plan}`,
    planEnv.targetFiles.length > 0 ? `Arquivos alvo previstos: ${planEnv.targetFiles.join(', ')}` : '',
    bullets('Riscos levantados pelo Architect', planEnv.risks),
    'Ao concluir, certifique-se de que os arquivos foram salvos.',
    envelopeInstruction(BUILD_EXAMPLE(task)),
  ].filter(Boolean).join('\n\n')
}

// Correction after a failed gate. With a resumed session the agent still has the task in
// context and gets only what failed; a fresh session needs the task restated.
export function formatCorrectionPrompt(task: FactoryTask, failure: string, resumed: boolean, planEnv?: PlanEnvelope): string {
  return [
    'A esteira verificou o seu trabalho e ele NÃO passou no portão abaixo. Corrija exatamente o que está descrito.',
    `Falha:\n\`\`\`\n${failure.slice(-8000)}\n\`\`\``,
    resumed ? '' : `Demanda: ${task.title}`,
    !resumed && planEnv ? `Plano aprovado:\n${planEnv.plan}` : '',
    envelopeInstruction(BUILD_EXAMPLE(task)),
  ].filter(Boolean).join('\n\n')
}

export function formatAdjustPrompt(task: FactoryTask, feedback: string, spec?: SpecEnvelope): string {
  // Each CLI run starts with no memory: restate the task and plan, or the Implementer edits blind
  return [
    `Demanda: ${task.title}`,
    specBlock(spec),
    task.plan ? `Plano aprovado:\n${task.plan}` : '',
    'A implementação já está commitada na worktree atual. O desenvolvedor revisou e pediu os seguintes ajustes:',
    `"${feedback}"`,
    'Altere os arquivos necessários na pasta atual e certifique-se de que a implementação atende ao pedido.',
    envelopeInstruction(BUILD_EXAMPLE(task)),
  ].filter(Boolean).join('\n\n')
}

// 3. Envelope de Testes (Tester -> Reviewer)
export function parseTestEnvelope(text: string, deterministicPassed = true): TestEnvelope {
  const parsed = extractJsonFromMarkdown(text)
  if (parsed && typeof parsed === 'object') {
    return {
      status: statusOf(parsed),
      testSuitePassed: typeof parsed.testSuitePassed === 'boolean' ? parsed.testSuitePassed : deterministicPassed,
      testsRan: strings(parsed.testsRan),
      criteriaTests: Array.isArray(parsed.criteriaTests)
        ? parsed.criteriaTests.map((c: any) => ({ id: String(c?.id ?? ''), tests: strings(c?.tests), untestable: typeof c?.untestable === 'string' && c.untestable.trim() ? c.untestable : undefined }))
        : [],
      coverageNotes: typeof parsed.coverageNotes === 'string' ? parsed.coverageNotes : undefined,
      details: str(parsed.details, text),
    }
  }
  const looksFailed = ['failed', 'falhou', 'failing', 'erro'].some(w => text.toLowerCase().includes(w))
  return { status: 'ok', testSuitePassed: deterministicPassed && !looksFailed, testsRan: [], criteriaTests: [], details: text }
}

export function formatTestPrompt(
  task: FactoryTask,
  testGateResult: { command?: string; output: string; passed: boolean },
  planEnv?: PlanEnvelope,
  spec?: SpecEnvelope,
  // After a fix round: the code changed since the tests were written
  changedSince?: string,
): string {
  return [
    'Avalie as alterações da worktree e os resultados da suíte determinística de testes:',
    `Demanda: ${task.title}`,
    changedSince ? `O código mudou depois da sua última rodada de testes (${changedSince}). Cubra o comportamento novo ou alterado e confira se os testes existentes ainda provam cada critério.` : '',
    specBlock(spec),
    bullets('Cenários de teste previstos pelo Architect', planEnv?.testScenarios ?? []),
    testGateResult.command ? `Comando executado: ${testGateResult.command}` : 'Nenhum comando de verificação detectado.',
    `Saída dos testes:\n\`\`\`\n${testGateResult.output.slice(-4000)}\n\`\`\``,
    'Escreva os testes que faltam para os cenários e critérios acima e avalie a cobertura.',
    envelopeInstruction({
      status: 'ok',
      testSuitePassed: testGateResult.passed,
      testsRan: ['teste unitário de exemplo'],
      criteriaTests: (criteriaIds(spec).length ? criteriaIds(spec) : ['CA1']).map(id => ({ id, tests: ['caminho/do/arquivo.test.ts'] })),
      coverageNotes: 'Cenários cobertos e os que ficaram sem teste.',
      details: 'Parecer técnico detalhado sobre os testes.',
    }),
  ].filter(Boolean).join('\n\n')
}

// 4. Envelope de Revisão (Reviewer/Security -> Human Review)
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const

function parseFinding(f: any, agentId: SpecializedAgentId): SecurityFinding {
  const confidence = Number(f?.confidence)
  return {
    severity: SEVERITIES.includes(f?.severity) ? f.severity : 'low',
    description: String(f?.description ?? f),
    file: f?.file ? String(f.file) : undefined,
    line: typeof f?.line === 'number' ? f.line : undefined,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : undefined,
    agentId,
  }
}

// No envelope means no review: "zero findings" read from prose would pass the verdict unchecked.
export function parseReviewEnvelope(text: string, agentId: SpecializedAgentId = 'reviewer'): ReviewEnvelope {
  const parsed = extractJsonFromMarkdown(text)
  if (!parsed || typeof parsed !== 'object') {
    return { status: 'error', findings: [], criteria: [], mrDescription: '', summary: text.slice(0, 1000) }
  }
  const criteria: CriterionCheck[] = Array.isArray(parsed.criteria)
    ? parsed.criteria.map((c: any) => ({ id: c?.id ? String(c.id).toUpperCase() : undefined, criterion: String(c?.criterion ?? c), met: c?.met === true, evidence: String(c?.evidence ?? '') }))
    : []
  return {
    status: statusOf(parsed),
    findings: Array.isArray(parsed.findings) ? parsed.findings.map((f: any) => parseFinding(f, agentId)) : [],
    criteria,
    mrDescription: str(parsed.mrDescription, ''),
    summary: str(parsed.summary, proseWithoutEnvelope(text).slice(0, 2000)),
  }
}

const FINDING_EXAMPLE = { severity: 'high', confidence: 85, file: 'src/exemplo.ts', line: 42, description: 'O que está errado, a consequência e a correção' }

// The reviewers only read; the verification is run by the pipeline and its result is evidence for them.
type VerifyResult = { command?: string; exitCode: number; passed: boolean; skipped?: boolean; output: string }
function verifyBlock(tests?: VerifyResult): string {
  if (!tests) return ''
  if (tests.skipped && !tests.command) return 'Verificação automática: nenhum comando de verificação foi detectado no repositório.'
  return [
    `Verificação automática, rodada pela esteira (você não precisa nem consegue rodar comandos): \`${tests.command}\` terminou com código ${tests.exitCode} (${tests.passed ? 'passou' : 'falhou'}).`,
    `Final da saída:\n\`\`\`\n${tests.output.slice(-3000)}\n\`\`\``,
  ].join('\n')
}

// A cut diff must say so, or a review of the first 80k characters comes back clean for the rest.
const MAX_REVIEW_DIFF = 80_000
function diffBlock(diff: string): string {
  if (diff.length <= MAX_REVIEW_DIFF) return `Diff das alterações:\n\`\`\`diff\n${diff}\n\`\`\``
  return `Diff das alterações (truncado: ${MAX_REVIEW_DIFF} de ${diff.length} caracteres; leia o restante dos arquivos alterados com Read):\n\`\`\`diff\n${diff.slice(0, MAX_REVIEW_DIFF)}\n\`\`\``
}

function previousFindingsBlock(previous: SecurityFinding[]): string {
  if (previous.length === 0) return ''
  return `Achados da rodada anterior (confira se foram corrigidos; repita apenas os que continuam):\n${previous.map(findingLine).join('\n')}`
}

export function formatReviewPrompt(task: FactoryTask, diff: string, spec?: SpecEnvelope, previous: SecurityFinding[] = [], tests?: VerifyResult): string {
  return [
    `Revise as alterações da branch contra a base ${task.baseBranch}.`,
    `Demanda: ${task.title}`,
    specBlock(spec),
    verifyBlock(tests),
    previousFindingsBlock(previous),
    diffBlock(diff),
    envelopeInstruction({
      status: 'ok',
      findings: [FINDING_EXAMPLE],
      criteria: (spec?.acceptanceCriteria.length ? spec.acceptanceCriteria : ['Critério da demanda']).map((c, i) => ({ id: `CA${i + 1}`, criterion: c, met: true, evidence: 'arquivo:linha ou teste que comprova' })),
      mrDescription: '## O que mudou\n\n## Por quê\n\n## Como validar',
      summary: 'Parecer da revisão em poucas frases',
    }),
  ].filter(Boolean).join('\n\n')
}

function toolsBlock(tools: ScanToolResult[]): string {
  const ran = tools.filter(t => t.status === 'passed' || t.status === 'failed' || t.status === 'error')
  if (ran.length === 0) return ''
  return ['Ferramentas de segurança rodadas pela esteira sobre esta branch (evidência: confirme, descarte falso positivo ou aponte o que elas não cobrem):',
    ...ran.map(t => `- ${t.tool}: ${t.status === 'passed' ? 'nada encontrado' : t.status === 'failed' ? 'encontrou problemas' : 'não concluiu'}${t.output && t.status !== 'passed' ? `\n\`\`\`\n${t.output.slice(-3000)}\n\`\`\`` : ''}`),
  ].join('\n')
}

export function formatSecurityPrompt(task: FactoryTask, diff: string, previous: SecurityFinding[] = [], tools: ScanToolResult[] = []): string {
  return [
    `Audite a segurança das alterações da branch contra a base ${task.baseBranch}.`,
    `Demanda: ${task.title}`,
    toolsBlock(tools),
    previousFindingsBlock(previous),
    diffBlock(diff),
    envelopeInstruction({ status: 'ok', findings: [FINDING_EXAMPLE], summary: 'Parecer de segurança em poucas frases' }),
  ].filter(Boolean).join('\n\n')
}

// Verdict in code (agent proposes, code disposes): a finding blocks when it is high or critical
// and the reviewer is sure enough; an unmet acceptance criterion always blocks.
// A finding the Verifier refuted stays on display but never blocks.
const MIN_CONFIDENCE = 75
export function computeVerdict(findings: SecurityFinding[], criteria: CriterionCheck[] = []) {
  const blocking = findings.filter(f => !f.refuted && (f.severity === 'critical' || f.severity === 'high') && (f.confidence ?? MIN_CONFIDENCE) >= MIN_CONFIDENCE)
  const unmet = criteria.filter(c => !c.met)
  return { passed: blocking.length === 0 && unmet.length === 0, blocking, unmet }
}

// Why a review cannot be trusted, if it cannot: a reviewer with no envelope or a declared error,
// or a criterion id of the spec missing from the check (one left out would pass unchecked).
// Ids, not text: reviewers rephrase criteria. The Implementer cannot fix this, so it goes to the human.
export function incompleteReview(review: ReviewEnvelope, security: ReviewEnvelope, expectedIds: string[] = []): string[] {
  const reasons: string[] = []
  if (review.status === 'error') reasons.push(say({ en: `The Reviewer did not finish the review (no envelope or an error): ${review.summary.slice(0, 300)}`, pt: `O Reviewer não concluiu a revisão (sem envelope ou com erro): ${review.summary.slice(0, 300)}` }))
  if (security.status === 'error') reasons.push(say({ en: `Security did not finish the audit (no envelope or an error): ${security.summary.slice(0, 300)}`, pt: `O Security não concluiu a auditoria (sem envelope ou com erro): ${security.summary.slice(0, 300)}` }))
  const checked = new Set(review.criteria.map(c => c.id))
  const missing = expectedIds.filter(id => !checked.has(id))
  if (review.status !== 'error' && missing.length) {
    reasons.push(say({ en: `The Reviewer did not check ${missing.join(', ')} of the acceptance criteria; they were not verified.`, pt: `O Reviewer não avaliou ${missing.join(', ')} dos critérios de aceite; eles não foram verificados.` }))
  }
  return reasons
}

// The Verifier answers per finding, by its number in the prompt. A finding it did not answer, or a
// run with no envelope, keeps blocking: only an explicit "holds: false" with a reason refutes.
export function formatVerifyPrompt(task: FactoryTask, findings: SecurityFinding[], spec?: SpecEnvelope): string {
  return [
    `Tente refutar cada achado abaixo, levantado na revisão das alterações da branch contra a base ${task.baseBranch}.`,
    `Demanda: ${task.title}`,
    specBlock(spec),
    `Achados:\n${findings.map((f, i) => `${i + 1}. ${findingLine(f).slice(2)}`).join('\n')}`,
    envelopeInstruction({ verdicts: findings.map((_, i) => ({ index: i + 1, holds: true, reason: 'O caminho concreto que leva à falha, ou por que ele não existe' })) }),
  ].filter(Boolean).join('\n\n')
}

export function applyVerifierEnvelope(text: string, findings: SecurityFinding[]): SecurityFinding[] {
  const parsed = extractJsonFromMarkdown(text)
  const verdicts: any[] = Array.isArray(parsed?.verdicts) ? parsed.verdicts : []
  return findings.map((f, i) => {
    const v = verdicts.find(x => Number(x?.index) === i + 1)
    const reason = typeof v?.reason === 'string' ? v.reason.trim() : ''
    return v?.holds === false && reason ? { ...f, refuted: reason } : f
  })
}

// Worst first; the same file:line reported by both reviewers stays once (the more severe).
export function mergeFindings(...lists: SecurityFinding[][]): SecurityFinding[] {
  const rank = (f: SecurityFinding) => SEVERITIES.indexOf(f.severity)
  const sorted = lists.flat().sort((a, b) => rank(b) - rank(a) || (b.confidence ?? 0) - (a.confidence ?? 0))
  const seen = new Set<string>()
  return sorted.filter(f => {
    if (!f.file || f.line === undefined) return true
    const key = `${f.file}:${f.line}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const findingLine = (f: SecurityFinding) => `- [${f.severity}] ${f.file ? `${f.file}${f.line !== undefined ? `:${f.line}` : ''} ` : ''}${f.description}`

export function formatFixFindingsPrompt(task: FactoryTask, blocking: SecurityFinding[], unmet: CriterionCheck[], planEnv?: PlanEnvelope, failingTests?: string): string {
  return [
    'A revisão automática encontrou problemas que bloqueiam a entrega. Corrija-os na worktree atual sem mudar o que já está certo.',
    `Demanda: ${task.title}`,
    planEnv ? `Plano aprovado:\n${planEnv.plan}` : '',
    failingTests ? `A verificação do projeto está falhando:\n\`\`\`\n${failingTests.slice(-6000)}\n\`\`\`` : '',
    bullets('Achados bloqueantes', blocking.map(f => findingLine(f).slice(2))),
    bullets('Critérios de aceite não atendidos', unmet.map(c => `${c.id ? `${c.id}: ` : ''}${c.criterion} (${c.evidence})`)),
    envelopeInstruction(BUILD_EXAMPLE(task)),
  ].filter(Boolean).join('\n\n')
}

// 5. Envelope de Documentação (Documenter -> MR)
export function parseDocsEnvelope(text: string): DocsEnvelope {
  const parsed = extractJsonFromMarkdown(text)
  if (!parsed || typeof parsed !== 'object') return { status: 'ok', changedFiles: [], mrDescription: proseWithoutEnvelope(text) }
  return { status: statusOf(parsed), changedFiles: strings(parsed.changedFiles), mrDescription: str(parsed.mrDescription, proseWithoutEnvelope(text)) }
}

export function formatDocsPrompt(task: FactoryTask, files: string[], buildSummary?: string, spec?: SpecEnvelope): string {
  return [
    'A implementação abaixo está pronta e testada; a revisão vem depois e lê também a documentação. Atualize a documentação que ela tornou desatualizada e escreva a descrição final do MR.',
    `Demanda: ${task.title}`,
    spec?.summary ? `Problema: ${spec.summary}` : '',
    specBlock(spec),
    bullets('Arquivos alterados', files),
    buildSummary ? `Resumo do Implementer:\n${buildSummary}` : '',
    task.source.issueIid ? `A descrição deve terminar com "Closes #${task.source.issueIid}".` : '',
    envelopeInstruction({ status: 'ok', changedFiles: ['README.md'], mrDescription: '## O que mudou\n\n## Por quê\n\n## Como validar\n\n## Fora do escopo' }),
  ].filter(Boolean).join('\n\n')
}

// Autoteste
if (import.meta.main && process.argv.includes('--selfcheck')) {
  const planEnv = parsePlanEnvelope('```json\n{"status":"ok","plan":"passo 1","targetFiles":["a.ts"],"risks":["r1"],"testScenarios":["s1"]}\n```')
  assert.deepEqual(planEnv.targetFiles, ['a.ts'])
  assert.deepEqual(planEnv.risks, ['r1'])

  // Plan with a code sample before the envelope: envelope found, full prose kept as the plan
  const richEnv = parsePlanEnvelope('## Plano\n\n1. Criar helper\n\n```ts\nexport const x = 1\n```\n\n```json\n{"status":"ok","plan":"resumo","targetFiles":["b.ts"]}\n```')
  assert.deepEqual(richEnv.targetFiles, ['b.ts'], 'envelope é o último bloco')
  assert.ok(richEnv.plan.includes('1. Criar helper') && richEnv.plan.includes('export const x'), 'plano completo preservado')
  assert.ok(!richEnv.plan.includes('targetFiles'), 'envelope fora do texto do plano')

  const spec = parseSpecEnvelope('Análise.\n```json\n{"summary":"s","acceptanceCriteria":["Dado a, quando b, então c"],"openQuestions":["Qual limite?"]}\n```')
  assert.deepEqual(spec.openQuestions, ['Qual limite?'])
  assert.equal(parseSpecEnvelope('texto livre sem contrato').openQuestions.length, 0, 'sem contrato não para a esteira')

  const buildEnv = parseBuildEnvelope('```json\n{"status":"error","changedFiles":["a.ts"],"commitMessage":"feat: x","summary":"bloqueado"}\n```')
  assert.equal(buildEnv.status, 'error', 'bloqueio do Implementer preservado')
  assert.equal(buildEnv.commitMessage, 'feat: x')

  assert.equal(parseTestEnvelope('tudo passou com sucesso!', true).testSuitePassed, true)

  const review = parseReviewEnvelope('```json\n{"findings":[{"severity":"high","confidence":90,"file":"a.ts","line":3,"description":"x"},{"severity":"bogus","description":"y"}],"criteria":[{"criterion":"c1","met":false,"evidence":"falta"}]}\n```', 'security')
  assert.equal(review.findings[0].agentId, 'security')
  assert.equal(review.findings[1].severity, 'low', 'severidade inválida vira low')

  // Verdict computed in code
  assert.equal(computeVerdict([]).passed, true)
  assert.equal(computeVerdict(review.findings).passed, false, 'high com confiança alta bloqueia')
  assert.equal(computeVerdict([{ severity: 'critical', description: 'talvez', confidence: 40 }]).passed, true, 'confiança baixa não bloqueia')
  assert.equal(computeVerdict([], review.criteria).unmet.length, 1, 'critério não atendido bloqueia')

  const prose = parseReviewEnvelope('Revisei e está tudo certo.')
  assert.equal(prose.status, 'error', 'revisão sem envelope não é uma revisão aprovada')
  const okEnv = parseReviewEnvelope('```json\n{"findings":[],"criteria":[{"id":"ca1","criterion":"reescrito","met":true},{"criterion":"inventado","met":true}]}\n```')
  assert.deepEqual(incompleteReview(okEnv, okEnv, ['CA1']), [], 'id casa mesmo com o texto reescrito')
  assert.equal(incompleteReview(prose, okEnv).length, 1, 'Reviewer sem envelope torna a revisão incompleta')
  assert.match(incompleteReview(okEnv, okEnv, ['CA1', 'CA2'])[0], /did not check CA2/, 'critério trocado por outro não passa calado')

  // Verifier: só "holds: false" com motivo refuta; achado refutado não bloqueia
  const blockers: SecurityFinding[] = [{ severity: 'high', confidence: 90, description: 'a' }, { severity: 'critical', confidence: 95, description: 'b' }, { severity: 'high', confidence: 90, description: 'c' }]
  const checked = applyVerifierEnvelope('```json\n{"verdicts":[{"index":1,"holds":false,"reason":"validado em x.ts:10"},{"index":2,"holds":false,"reason":""}]}\n```', blockers)
  assert.deepEqual(checked.map(f => Boolean(f.refuted)), [true, false, false], 'sem motivo ou sem resposta, o achado continua')
  assert.equal(computeVerdict(checked).blocking.length, 2)
  assert.equal(applyVerifierEnvelope('sem envelope', blockers).some(f => f.refuted), false, 'Verifier sem envelope não refuta nada')

  const tested = parseTestEnvelope('```json\n{"testSuitePassed":true,"criteriaTests":[{"id":"CA1","tests":["a.test.ts"]},{"id":"CA2","tests":[],"untestable":"texto"}]}\n```')
  assert.deepEqual(tested.criteriaTests.map(c => c.untestable ?? c.tests[0]), ['a.test.ts', 'texto'])

  const merged = mergeFindings(
    [{ severity: 'medium', description: 'a', file: 'x.ts', line: 1 }, { severity: 'low', description: 'b' }],
    [{ severity: 'critical', description: 'c', file: 'x.ts', line: 1 }],
  )
  assert.deepEqual(merged.map(f => f.description), ['c', 'b'], 'mais grave primeiro, mesmo file:line uma vez')

  const task: FactoryTask = {
    id: 'fac-1', title: 'Tarefa', description: 'Desc', source: { type: 'manual', repoPath: '/tmp', issueIid: 7 },
    state: 'qa_security', baseBranch: 'main', branchName: 'factory/fac-1', provider: 'claude',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  assert.ok(formatTestPrompt(task, { command: 'npm test', output: 'ok', passed: true }, planEnv).includes('s1'), 'Tester recebe os cenários do plano')
  assert.ok(formatReviewPrompt(task, '+x', spec).includes('CA1: Dado a, quando b, então c'), 'Reviewer recebe os critérios numerados')
  assert.ok(formatSecurityPrompt(task, '+x', [], [{ tool: 'semgrep', status: 'failed', output: 'sqli em a.ts' }, { tool: 'gitleaks', status: 'missing' }]).includes('sqli em a.ts'), 'Security lê a saída das ferramentas')
  const withTests = formatReviewPrompt(task, '+x', spec, [], { command: 'npm test', exitCode: 1, passed: false, output: 'FALHOU em a.test' })
  assert.ok(withTests.includes('`npm test` terminou com código 1') && withTests.includes('FALHOU em a.test'), 'Reviewer recebe o resultado da verificação')
  assert.match(formatSecurityPrompt(task, 'x'.repeat(80_001)), /truncado: 80000 de 80001/, 'diff cortado avisa o revisor')
  assert.ok(formatCorrectionPrompt(task, 'boom', true).includes('boom'))
  assert.ok(!formatCorrectionPrompt(task, 'boom', true).includes('Demanda'), 'sessão retomada não repete a demanda')
  assert.ok(formatDocsPrompt(task, ['a.ts']).includes('Closes #7'))

  console.log('factory envelopes selfcheck: ok')
}
