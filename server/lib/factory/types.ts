// Tipos de dados da Fábrica de Software e Agentes Especializados.

export type FactoryTaskState =
  | 'intake'            // Tarefa criada ou importada, aguardando início
  | 'planning'          // Analyst especifica e Architect planeja (modo leitura)
  | 'waiting_clarification' // Analyst encontrou dúvidas que só o desenvolvedor responde
  | 'waiting_approval'  // Plano pronto, aguardando desenvolvedor aprovar
  | 'building'          // Agente Implementer codificando na worktree
  | 'qa_security'       // Agente Tester rodando testes e Reviewer auditando
  | 'review'            // Código pronto para inspeção humana no painel
  | 'done'              // MR/PR aberto ou código mesclado com sucesso
  | 'canceled'          // Descartada pelo desenvolvedor
  | 'error'             // Erro durante a execução

// States that only make sense while a process is executing. Plain value in this
// types file so the web app can import it without pulling server code.
export const RUNNING_STATES: FactoryTaskState[] = ['planning', 'building', 'qa_security']

export type SpecializedAgentId = 'analyst' | 'architect' | 'implementer' | 'tester' | 'documenter' | 'reviewer' | 'security' | 'verifier'

// Pipeline order: the web app draws lanes and lists agents from this, so a new agent
// shows up everywhere once it is added here and in agents.ts.
export const AGENT_ORDER: SpecializedAgentId[] = ['analyst', 'architect', 'implementer', 'tester', 'documenter', 'reviewer', 'security', 'verifier']

// Tokens and cost the CLI reported for one agent run (only what the provider tells us).
export type AgentUsage = {
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
}

export type ExecutionSpanKind = 'code' | 'agent' | 'gate'

export type ToolCallSpan = {
  id?: string
  tool: string
  input?: unknown
  output?: string
  isError?: boolean
  startedAt?: string
  durationMs?: number
}

export type ExecutionSpan = {
  id: string
  name: string
  phase: FactoryTaskState | string
  kind: ExecutionSpanKind
  agentId?: SpecializedAgentId
  startedAt: string
  finishedAt?: string
  durationMs?: number
  status: 'running' | 'success' | 'failed'
  toolCalls?: ToolCallSpan[]
  error?: string
  details?: Record<string, unknown>
  envelope?: unknown
  usage?: AgentUsage
  // Model the agent ran with (task model or its per-agent override)
  model?: string
}

// Analyst -> Architect: what "done" means, before anyone plans how.
export type SpecEnvelope = {
  status: 'ok' | 'error'
  summary: string
  acceptanceCriteria: string[]
  outOfScope: string[]
  // Questions only the developer can answer; any of them stops the pipeline for a human.
  openQuestions: string[]
}

export type PlanEnvelope = {
  status: 'ok' | 'error'
  plan: string
  targetFiles: string[]
  risks: string[]
  testScenarios: string[]
}

export type BuildEnvelope = {
  status: 'ok' | 'error'
  changedFiles: string[]
  commitMessage: string
  summary: string
}

// Which tests the Tester says cover one acceptance criterion (CA1, CA2...), or why none can.
export type CriterionTests = {
  id: string
  tests: string[]
  untestable?: string
}

export type TestEnvelope = {
  status: 'ok' | 'error'
  testSuitePassed: boolean
  testsRan: string[]
  criteriaTests: CriterionTests[]
  coverageNotes?: string
  details?: string
}

// The Tester's claim checked in code: every test file it names exists.
export type CriterionCoverage = {
  id: string
  status: 'tested' | 'untestable' | 'missing'
  tests: string[]
  note?: string
}

export type CriterionCheck = {
  // CA1, CA2...: matched against the spec, so a rephrased or dropped criterion is caught
  id?: string
  criterion: string
  met: boolean
  evidence: string
}

export type ReviewEnvelope = {
  status: 'ok' | 'error'
  findings: SecurityFinding[]
  criteria: CriterionCheck[]
  mrDescription: string
  summary: string
}

export type DocsEnvelope = {
  status: 'ok' | 'error'
  changedFiles: string[]
  mrDescription: string
}

export type TaskHandoffs = {
  spec?: SpecEnvelope
  plan?: PlanEnvelope
  build?: BuildEnvelope
  test?: TestEnvelope
  review?: ReviewEnvelope
  security?: ReviewEnvelope
  docs?: DocsEnvelope
}

export type VerifyStep = {
  command: string
  passed: boolean
  exitCode: number
  durationMs: number
}

export type QaReport = {
  passed: boolean
  testsRan?: string
  output?: string
  summary: string
  steps?: VerifyStep[]
  criteria?: CriterionCoverage[]
  // Non-test files the Tester changed: reviewed, but worth a human look
  testerTouched?: string[]
  // Rebase onto the newest base before the last verification
  baseSync?: { status: 'current' | 'rebased' | 'conflict'; detail?: string }
}

// One security tool run on the diff (gitleaks, semgrep, npm audit). `missing`: not installed on
// this machine, `error`: it could not finish (network, bad config).
export type ScanToolResult = {
  tool: string
  status: 'passed' | 'failed' | 'missing' | 'error' | 'skipped'
  output?: string
  install?: string
}

export type SecurityFinding = {
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  file?: string
  line?: number
  // 0-100, how sure the reviewer is the problem is real (the verdict drops < 75)
  confidence?: number
  // Which reviewer of the squad raised it
  agentId?: SpecializedAgentId
  // Set when the Verifier showed the failure cannot happen: kept for the human, never blocks
  refuted?: string
}

// The verdict is computed in code from findings and criteria, never taken from the agent.
export type SecurityReport = {
  passed: boolean
  findings: SecurityFinding[]
  criteria?: CriterionCheck[]
  summary: string
  // Automatic fix-then-review rounds already spent on blocking findings
  fixRounds?: number
  tools?: ScanToolResult[]
}

// What stands between the task and a merge, recomputed in code from the reports.
// Blockers stop the finish unless the developer writes why; attention items only stop the
// automatic MR, because they need a human eye but are not known to be wrong.
export type Readiness = {
  blockers: string[]
  attention: string[]
}

export type DiffStat = {
  filesChanged: number
  insertions: number
  deletions: number
  files: string[]
}

export type FileBlastRadius = {
  file: string
  dependents: string[]
  testFiles: string[]
}

export type BlastRadiusReport = {
  totalDependents: number
  files: FileBlastRadius[]
}

export type FactoryTask = {
  id: string
  title: string
  description: string
  source: {
    type: 'gitlab' | 'github' | 'manual'
    repoPath: string
    remoteUrl?: string
    issueIid?: number
    issueUrl?: string
  }
  state: FactoryTaskState
  // Not persisted: filled by the API from the in-memory execution registry
  executing?: boolean
  baseBranch: string
  branchName: string
  worktreePath?: string
  // Worktree commit the last automatic review saw: where an interrupted adjust goes back to
  reviewedHead?: string
  plan?: string
  // Developer answers to the Analyst's questions, fed into the next planning run
  clarifications?: string
  // Shell command that verifies the change (tests, lint, build); autodetected when empty
  verifyCommand?: string
  // Runs after the verification, in the same jail: start the app, hit it, stop it
  smokeCommand?: string
  // Opens the MR by itself when nothing blocks and nothing needs attention
  autoMr?: boolean
  readiness?: Readiness
  // Base commit the last verification ran on: a newer base means rebase and verify again
  verifiedBase?: string
  // Why the developer finished with blockers on, and which ones
  finishOverride?: { reason: string; blockers: string[]; at: string }
  // Model per agent, overriding `model` (e.g. a frontier model to plan, a cheap one to build)
  agentModels?: Partial<Record<SpecializedAgentId, string>>
  // Spending cap for the whole task in USD; checked before each agent run
  budgetUsd?: number
  provider: 'claude' | 'codex' | 'agy'
  model?: string
  effort?: string
  diffStat?: DiffStat
  diffContent?: string
  qaReport?: QaReport
  securityReport?: SecurityReport
  blastRadius?: BlastRadiusReport
  prUrl?: string
  createdAt: string
  updatedAt: string
  error?: string
  spans?: ExecutionSpan[]
  handoffs?: TaskHandoffs
}

// Tokens and cost of every agent run of a task (only what the providers reported).
// Shared by the budget check on the server and the cost shown in the web app.
export function taskUsage(task: Pick<FactoryTask, 'spans'>): { costUsd: number | null; tokens: number } {
  let costUsd = 0
  let tokens = 0
  let priced = false
  for (const s of task.spans ?? []) {
    if (s.usage?.costUsd !== undefined) (costUsd += s.usage.costUsd), (priced = true)
    tokens += (s.usage?.inputTokens ?? 0) + (s.usage?.outputTokens ?? 0)
  }
  return { costUsd: priced ? costUsd : null, tokens }
}
