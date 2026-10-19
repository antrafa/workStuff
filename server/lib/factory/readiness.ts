// Whether a reviewed task can be merged, decided in code from its reports. Blockers are known to be
// wrong or unverified: the finish refuses them unless the developer writes why. Attention items are
// not known to be wrong but need a human eye: they only stop the automatic MR.
// Autoteste: node server/lib/factory/readiness.ts --selfcheck

import assert from 'node:assert/strict'
import { computeVerdict } from './envelopes.ts'
import type { FactoryTask, Readiness } from './types.ts'
import { say } from '../i18n.ts'

// Above this many changed lines a person reads the diff anyway
const LARGE_DIFF = 400

// Paths where a plausible-looking change can still break production, the build or access control.
// ponytail: path heuristic ("auth" also matches "author"); a per-repo list if it gets noisy.
const SENSITIVE = /(^|\/)(\.gitlab-ci\.yml|\.github\/|Jenkinsfile|Dockerfile|docker-compose[^/]*|helm\/|charts\/|k8s\/|terraform\/|migrations?\/|db\/migrate\/)|\.tf$|(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|pom\.xml|build\.gradle(\.kts)?|requirements[^/]*\.txt|pyproject\.toml|go\.(mod|sum))$|auth|secur|crypt|passw|secret|token|permission/i

export function assessDelivery(task: FactoryTask): Readiness {
  const blockers: string[] = []
  const attention: string[] = []
  const qa = task.qaReport
  const review = task.securityReport

  if (!qa?.testsRan) {
    blockers.push(say({ en: 'Nothing was verified: the project has no verification command. Set one on the task.', pt: 'Nada foi verificado: o projeto não tem comando de verificação. Informe um na tarefa.' }))
  } else if (!qa.passed) {
    const failed = qa.steps?.find(s => !s.passed)?.command ?? qa.testsRan
    blockers.push(say({ en: `The verification did not pass: ${failed}.`, pt: `A verificação não passou: ${failed}.` }))
  }
  const tolerated = qa?.passed ? (qa.steps ?? []).filter(s => s.preexisting).map(s => s.command) : []
  if (tolerated.length) {
    attention.push(say({ en: `The verification passed over failures that already existed on ${task.baseBranch}: ${tolerated.join(', ')}.`, pt: `A verificação passou por cima de falhas que já existiam no ${task.baseBranch}: ${tolerated.join(', ')}.` }))
  }
  if (qa?.qualityFloor) blockers.push(qa.qualityFloor)
  if (qa?.baseSync?.status === 'conflict') {
    blockers.push(say({ en: `The branch conflicts with the current ${task.baseBranch}; request an adjustment to resolve it.`, pt: `A branch conflita com o ${task.baseBranch} atual; peça um ajuste para resolver.` }))
  }

  if (!review) {
    blockers.push(say({ en: 'The automatic review did not run.', pt: 'A revisão automática não rodou.' }))
  } else {
    const verdict = computeVerdict(review.findings, review.criteria)
    if (verdict.blocking.length) blockers.push(say({ en: `${verdict.blocking.length} blocking review finding(s).`, pt: `${verdict.blocking.length} achado(s) bloqueante(s) da revisão.` }))
    if (verdict.unmet.length) {
      const ids = verdict.unmet.map(c => c.id ?? c.criterion.slice(0, 40)).join(', ')
      blockers.push(say({ en: `Acceptance criteria not met: ${ids}.`, pt: `Critérios de aceite não atendidos: ${ids}.` }))
    }
    const refuted = review.findings.filter(f => f.refuted).length
    if (refuted) attention.push(say({ en: `${refuted} finding(s) refuted by the Verifier: confirm the refutation.`, pt: `${refuted} achado(s) refutado(s) pelo Verifier: confirme a refutação.` }))
    const medium = review.findings.filter(f => !f.refuted && f.severity === 'medium').length
    if (medium) attention.push(say({ en: `${medium} medium finding(s).`, pt: `${medium} achado(s) de severidade média.` }))
    for (const t of review.tools ?? []) {
      if (t.status === 'missing') attention.push(say({ en: `${t.tool} is not installed, so it did not run (install: ${t.install}).`, pt: `${t.tool} não está instalado e não rodou (instalação: ${t.install}).` }))
      if (t.status === 'error') attention.push(say({ en: `${t.tool} did not finish; see its output in the review tab.`, pt: `${t.tool} não concluiu; veja a saída na aba de revisão.` }))
    }
  }

  for (const c of qa?.criteria ?? []) {
    if (c.status === 'missing') attention.push(say({ en: `${c.id} has no automated test${c.note ? ` (${c.note})` : ''}.`, pt: `${c.id} não tem teste automatizado${c.note ? ` (${c.note})` : ''}.` }))
    if (c.status === 'untestable') attention.push(say({ en: `${c.id} is not tested automatically: ${c.note}.`, pt: `${c.id} não é testado automaticamente: ${c.note}.` }))
  }
  if (qa?.testerTouched?.length) {
    attention.push(say({ en: `The Tester changed non-test files: ${qa.testerTouched.join(', ')}.`, pt: `O Tester alterou arquivos que não são de teste: ${qa.testerTouched.join(', ')}.` }))
  }

  const stat = task.diffStat
  if (stat && stat.insertions + stat.deletions > LARGE_DIFF) {
    attention.push(say({ en: `Large change: ${stat.insertions + stat.deletions} lines.`, pt: `Mudança grande: ${stat.insertions + stat.deletions} linhas.` }))
  }
  const sensitive = (stat?.files ?? []).filter(f => SENSITIVE.test(f))
  if (sensitive.length) attention.push(say({ en: `Touches sensitive paths: ${sensitive.join(', ')}.`, pt: `Mexe em caminhos sensíveis: ${sensitive.join(', ')}.` }))

  for (const item of task.blastRadius?.files ?? []) {
    if (item.dependents.length >= 3 && item.testFiles.length === 0) {
      const examples = item.dependents.slice(0, 3).join(', ')
      const more = item.dependents.length > 3 ? ` (+${item.dependents.length - 3})` : ''
      attention.push(say({
        en: `High blast radius: "${item.file}" is imported by ${item.dependents.length} files outside diff (${examples}${more}), with no test callers.`,
        pt: `Alto raio de impacto: "${item.file}" é importado por ${item.dependents.length} arquivos fora do diff (${examples}${more}), sem testes chamadores.`,
      }))
    }
  }

  return { blockers, attention }
}

export const canAutoMr = (task: FactoryTask, readiness: Readiness) =>
  Boolean(task.autoMr) && readiness.blockers.length === 0 && readiness.attention.length === 0

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const now = new Date().toISOString()
  const green: FactoryTask = {
    id: 'fac-r', title: 't', description: '', source: { type: 'manual', repoPath: '/tmp' }, state: 'review',
    baseBranch: 'main', branchName: 'factory/fac-r', provider: 'claude', createdAt: now, updatedAt: now, autoMr: true,
    qaReport: { passed: true, testsRan: 'npm test', summary: '', steps: [{ command: 'npm test', passed: true, exitCode: 0, durationMs: 1 }], criteria: [{ id: 'CA1', status: 'tested', tests: ['a.test.ts'] }], baseSync: { status: 'current' } },
    securityReport: { passed: true, summary: '', findings: [{ severity: 'low', description: 'estilo' }], criteria: [{ id: 'CA1', criterion: 'c', met: true, evidence: 'e' }], tools: [{ tool: 'gitleaks', status: 'passed' }] },
    diffStat: { filesChanged: 1, insertions: 10, deletions: 2, files: ['src/nav.ts'] },
  }
  const ok = assessDelivery(green)
  assert.deepEqual(ok, { blockers: [], attention: [] }, 'tudo verde, nada a dizer')
  assert.equal(canAutoMr(green, ok), true)
  assert.equal(canAutoMr({ ...green, autoMr: false }, ok), false, 'MR automático só quando pedido')

  const r = (patch: Partial<FactoryTask>) => assessDelivery({ ...green, ...patch })
  assert.equal(r({ qaReport: { ...green.qaReport!, testsRan: undefined, passed: false } }).blockers.length, 1, 'sem comando bloqueia')
  assert.match(r({ qaReport: { ...green.qaReport!, passed: false, steps: [{ command: 'npm run lint', passed: false, exitCode: 1, durationMs: 1 }] } }).blockers[0], /npm run lint/, 'diz qual etapa falhou')
  assert.equal(r({ qaReport: { ...green.qaReport!, baseSync: { status: 'conflict' } } }).blockers.length, 1, 'conflito com a base bloqueia')
  assert.equal(r({ securityReport: { ...green.securityReport!, findings: [{ severity: 'high', confidence: 90, description: 'x' }] } }).blockers.length, 1)
  const refuted = r({ securityReport: { ...green.securityReport!, findings: [{ severity: 'high', confidence: 90, description: 'x', refuted: 'validado antes' }] } })
  assert.deepEqual([refuted.blockers.length, refuted.attention.length], [0, 1], 'refutado não bloqueia, mas pede um olhar')
  assert.equal(r({ securityReport: { ...green.securityReport!, criteria: [{ id: 'CA1', criterion: 'c', met: false, evidence: '' }] } }).blockers.length, 1)
  assert.equal(r({ securityReport: undefined }).blockers.length, 1, 'sem revisão não há entrega')

  assert.equal(r({ qaReport: { ...green.qaReport!, criteria: [{ id: 'CA1', status: 'missing', tests: [] }] } }).attention.length, 1)
  assert.equal(r({ securityReport: { ...green.securityReport!, tools: [{ tool: 'semgrep', status: 'missing', install: 'pipx install semgrep' }] } }).attention.length, 1)
  assert.equal(r({ diffStat: { filesChanged: 1, insertions: 300, deletions: 200, files: ['a.ts'] } }).attention.length, 1, 'diff grande')
  assert.equal(r({ diffStat: { filesChanged: 2, insertions: 1, deletions: 0, files: ['.gitlab-ci.yml', 'src/auth/login.ts'] } }).attention.length, 1, 'caminho sensível')
  assert.equal(r({ blastRadius: { totalDependents: 4, files: [{ file: 'src/core.ts', dependents: ['a.ts', 'b.ts', 'c.ts', 'd.ts'], testFiles: [] }] } }).attention.length, 1, 'alto raio de impacto sem testes pede atenção')
  assert.equal(r({ qaReport: { ...green.qaReport!, qualityFloor: 'Piso de qualidade violado: a.test.ts:3' } }).blockers.length, 1, 'supressão em qualquer ponto da entrega bloqueia')
  const old = r({ qaReport: { ...green.qaReport!, steps: [{ command: 'npm test', passed: false, exitCode: 1, durationMs: 1, preexisting: true }] } })
  assert.deepEqual([old.blockers.length, old.attention.length], [0, 1], 'falha que já existia na base não bloqueia, mas segura o MR automático')
  assert.match(old.attention[0], /npm test/)
  const touched = r({ qaReport: { ...green.qaReport!, testerTouched: ['src/a.ts'] } })
  assert.equal(canAutoMr(green, touched), false, 'qualquer ponto de atenção segura o MR automático')

  console.log('factory readiness selfcheck: ok')
}
