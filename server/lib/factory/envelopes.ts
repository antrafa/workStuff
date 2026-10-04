// Envelopes estruturados de Handoff entre agentes e fases.
// Inspirado em contratos tipados do Super Simple Software Factory.
// Autoteste: node server/lib/factory/envelopes.ts --selfcheck

import assert from 'node:assert/strict'
import type {
  PlanEnvelope,
  BuildEnvelope,
  TestEnvelope,
  ReviewEnvelope,
  FactoryTask,
  SecurityFinding,
} from './types.ts'

// Extrai bloco JSON em markdown se presente
export function extractJsonFromMarkdown(text: string): any | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (match) {
    try {
      return JSON.parse(match[1])
    } catch {
      // tenta parse normal abaixo
    }
  }
  try {
    return JSON.parse(text.trim())
  } catch {
    return null
  }
}

// 1. Envelope de Planejamento (Architect -> Implementer)
export function parsePlanEnvelope(text: string): PlanEnvelope {
  const parsed = extractJsonFromMarkdown(text)
  if (parsed && typeof parsed === 'object') {
    return {
      status: parsed.status === 'error' ? 'error' : 'ok',
      plan: typeof parsed.plan === 'string' ? parsed.plan : text,
      targetFiles: Array.isArray(parsed.targetFiles) ? parsed.targetFiles.map(String) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
      testScenarios: Array.isArray(parsed.testScenarios) ? parsed.testScenarios.map(String) : [],
    }
  }

  // Fallback heurístico a partir do markdown livre
  const targetFiles: string[] = []
  const risks: string[] = []
  const testScenarios: string[] = []

  const fileMatches = text.matchAll(/(?:arquivo|file|path):\s*`?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)`?/gi)
  for (const m of fileMatches) {
    if (!targetFiles.includes(m[1])) targetFiles.push(m[1])
  }

  return {
    status: 'ok',
    plan: text,
    targetFiles,
    risks,
    testScenarios,
  }
}

// 2. Envelope de Construção (Implementer -> Gates/Tester)
export function parseBuildEnvelope(text: string, changedFilesFallback: string[] = []): BuildEnvelope {
  const parsed = extractJsonFromMarkdown(text)
  if (parsed && typeof parsed === 'object') {
    return {
      status: parsed.status === 'error' ? 'error' : 'ok',
      changedFiles: Array.isArray(parsed.changedFiles) ? parsed.changedFiles.map(String) : changedFilesFallback,
      commitMessage: typeof parsed.commitMessage === 'string' ? parsed.commitMessage : 'feat: implementacao da demanda',
      summary: typeof parsed.summary === 'string' ? parsed.summary : text.slice(0, 1000),
    }
  }

  return {
    status: 'ok',
    changedFiles: changedFilesFallback,
    commitMessage: 'feat: implementacao da demanda',
    summary: text.slice(0, 1000),
  }
}

// 3. Envelope de Testes (Tester -> Reviewer)
export function parseTestEnvelope(text: string, deterministicPassed = true): TestEnvelope {
  const parsed = extractJsonFromMarkdown(text)
  if (parsed && typeof parsed === 'object') {
    return {
      status: parsed.status === 'error' ? 'error' : 'ok',
      testSuitePassed: typeof parsed.testSuitePassed === 'boolean' ? parsed.testSuitePassed : deterministicPassed,
      testsRan: Array.isArray(parsed.testsRan) ? parsed.testsRan.map(String) : [],
      coverageNotes: typeof parsed.coverageNotes === 'string' ? parsed.coverageNotes : undefined,
      details: typeof parsed.details === 'string' ? parsed.details : text,
    }
  }

  const failedWords = ['failed', 'falhou', 'failing', 'erro']
  const looksFailed = failedWords.some(w => text.toLowerCase().includes(w))

  return {
    status: 'ok',
    testSuitePassed: deterministicPassed && !looksFailed,
    testsRan: [],
    details: text,
  }
}

// 4. Envelope de Revisão (Reviewer -> Human Review)
export function parseReviewEnvelope(text: string): ReviewEnvelope {
  const parsed = extractJsonFromMarkdown(text)
  if (parsed && typeof parsed === 'object') {
    const findings: SecurityFinding[] = Array.isArray(parsed.findings)
      ? parsed.findings.map((f: any) => ({
          severity: f.severity || 'low',
          description: String(f.description || f),
          file: f.file ? String(f.file) : undefined,
          line: typeof f.line === 'number' ? f.line : undefined,
        }))
      : []

    return {
      status: parsed.status === 'error' ? 'error' : 'ok',
      securityPassed: typeof parsed.securityPassed === 'boolean' ? parsed.securityPassed : findings.length === 0,
      findings,
      mrDescription: typeof parsed.mrDescription === 'string' ? parsed.mrDescription : text,
      summary: typeof parsed.summary === 'string' ? parsed.summary : text.slice(0, 1000),
    }
  }

  const hasCrit = text.toLowerCase().includes('vulnerabilidade crítica') || text.toLowerCase().includes('critical')

  return {
    status: 'ok',
    securityPassed: !hasCrit,
    findings: [],
    mrDescription: text,
    summary: text.slice(0, 1000),
  }
}

// Formatadores de prompt estritos com instrução de envelope JSON
export function formatPlanPrompt(task: FactoryTask): string {
  return [
    `Analise o repositório e elabore um plano técnico para a seguinte demanda:`,
    `Título: ${task.title}`,
    `Descrição:\n${task.description || 'Sem descrição adicional.'}`,
    task.source.issueUrl ? `Issue original: ${task.source.issueUrl}` : '',
    `Branch base: ${task.baseBranch}`,
    `Você deve produzir um plano estruturado com visão geral, passos de implementação, arquivos-alvo, riscos e cenários de teste.`,
    `Ao final da resposta, inclua um bloco JSON estrito no formato:`,
    '```json',
    JSON.stringify(
      {
        status: 'ok',
        plan: 'Resumo dos passos',
        targetFiles: ['src/exemplo.ts'],
        risks: ['Risco 1'],
        testScenarios: ['Cenário 1'],
      },
      null,
      2,
    ),
    '```',
  ].filter(Boolean).join('\n\n')
}

export function formatBuildPrompt(task: FactoryTask, planEnv: PlanEnvelope): string {
  return [
    `Implemente o código na worktree atual seguindo o plano técnico aprovado:`,
    `Título: ${task.title}`,
    `Plano:\n${planEnv.plan}`,
    planEnv.targetFiles.length > 0 ? `Arquivos alvo previstos: ${planEnv.targetFiles.join(', ')}` : '',
    `Ao concluir a codificação, certifique-se de que os arquivos foram salvos e inclua um bloco JSON estrito com o resumo do que foi alterado:`,
    '```json',
    JSON.stringify(
      {
        status: 'ok',
        changedFiles: ['src/exemplo.ts'],
        commitMessage: `feat(${task.id}): ${task.title}`,
        summary: 'Resumo das alterações realizadas',
      },
      null,
      2,
    ),
    '```',
  ].filter(Boolean).join('\n\n')
}

export function formatRepairPrompt(task: FactoryTask, testFailureOutput: string): string {
  return [
    `ATENÇÃO: A suíte determinística de testes falhou após sua implementação!`,
    `Demanda: ${task.title}`,
    `Saída de erro dos testes:\n\`\`\`\n${testFailureOutput.slice(-8000)}\n\`\`\``,
    `Analise a falha e corrija o código imediatamente na worktree para que os testes passem.`,
  ].join('\n\n')
}

export function formatTestPrompt(
  task: FactoryTask,
  testGateResult: { command?: string; output: string; passed: boolean },
): string {
  return [
    `Avalie as alterações da worktree e os resultados da suíte determinística de testes:`,
    `Demanda: ${task.title}`,
    testGateResult.command ? `Comando executado: ${testGateResult.command}` : 'Nenhum script automatizado detectado.',
    `Saída dos testes:\n\`\`\`\n${testGateResult.output.slice(-4000)}\n\`\`\``,
    `Analise a cobertura, os cenários felizes e de borda validados.`,
    `Ao final da resposta, inclua um bloco JSON estrito no formato:`,
    '```json',
    JSON.stringify(
      {
        status: 'ok',
        testSuitePassed: testGateResult.passed,
        testsRan: ['teste unitário de exemplo'],
        coverageNotes: 'Cobertura adequada para cenários principais e de borda.',
        details: 'Parecer técnico detalhado sobre os testes.',
      },
      null,
      2,
    ),
    '```',
  ].filter(Boolean).join('\n\n')
}

export function formatReviewPrompt(
  task: FactoryTask,
  diff: string,
): string {
  return [
    `Revise as alterações finais da branch contra a base ${task.baseBranch}:`,
    `Demanda: ${task.title}`,
    `Diff das alterações:\n\`\`\`diff\n${diff.slice(0, 80_000)}\n\`\`\``,
    `Audite criticamente se há vulnerabilidades de segurança (injeções, segredos expostos, etc.), bugs ou regressões.`,
    `Produza a descrição para o Pull/Merge Request e aponte quaisquer achados.`,
    `Ao final da resposta, inclua um bloco JSON estrito no formato:`,
    '```json',
    JSON.stringify(
      {
        status: 'ok',
        securityPassed: true,
        findings: [],
        mrDescription: '## Resumo das Alterações\n\n- Implementação de funcionalidade conforme plano.',
        summary: 'Revisão concluída com sucesso sem vulnerabilidades críticas.',
      },
      null,
      2,
    ),
    '```',
  ].filter(Boolean).join('\n\n')
}

// Autoteste
if (process.argv.includes('--selfcheck')) {
  const samplePlanJson = '```json\n{"status":"ok","plan":"passo 1","targetFiles":["a.ts"],"risks":["r1"],"testScenarios":["s1"]}\n```'
  const planEnv = parsePlanEnvelope(samplePlanJson)
  assert.equal(planEnv.status, 'ok')
  assert.deepEqual(planEnv.targetFiles, ['a.ts'])
  assert.deepEqual(planEnv.risks, ['r1'])

  const sampleBuildJson = '```json\n{"status":"ok","changedFiles":["a.ts"],"commitMessage":"feat: x","summary":"ok"}\n```'
  const buildEnv = parseBuildEnvelope(sampleBuildJson)
  assert.equal(buildEnv.commitMessage, 'feat: x')
  assert.deepEqual(buildEnv.changedFiles, ['a.ts'])

  const testEnv = parseTestEnvelope('tudo passou com sucesso!', true)
  assert.equal(testEnv.testSuitePassed, true)

  const sampleTestJson = '```json\n{"status":"ok","testSuitePassed":true,"testsRan":["unit test 1"],"coverageNotes":"100%","details":"ok"}\n```'
  const parsedTestEnv = parseTestEnvelope(sampleTestJson)
  assert.equal(parsedTestEnv.testSuitePassed, true)
  assert.deepEqual(parsedTestEnv.testsRan, ['unit test 1'])

  const reviewEnv = parseReviewEnvelope('```json\n{"securityPassed":true,"findings":[],"mrDescription":"desc"}\n```')
  assert.equal(reviewEnv.securityPassed, true)

  // Testa formatTestPrompt e formatReviewPrompt
  const dummyTask: FactoryTask = {
    id: 'fac-1',
    title: 'Tarefa de Teste',
    description: 'Desc',
    source: { type: 'manual', repoPath: '/tmp' },
    state: 'qa_security',
    baseBranch: 'main',
    branchName: 'factory/fac-1',
    provider: 'claude',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const testPromptText = formatTestPrompt(dummyTask, { command: 'npm test', output: 'ok', passed: true })
  assert.ok(testPromptText.includes('```json'))
  assert.ok(testPromptText.includes('testSuitePassed'))

  const reviewPromptText = formatReviewPrompt(dummyTask, '+ console.log(1)')
  assert.ok(reviewPromptText.includes('```json'))
  assert.ok(reviewPromptText.includes('mrDescription'))

  console.log('factory envelopes selfcheck: ok')
}
