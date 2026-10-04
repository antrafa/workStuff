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

export type SpecializedAgentId = 'analyst' | 'architect' | 'implementer' | 'tester' | 'reviewer' | 'security' | 'documenter'

// Pipeline order: the web app draws lanes and lists agents from this, so a new agent
// shows up everywhere once it is added here and in agents.ts.
export const AGENT_ORDER: SpecializedAgentId[] = ['analyst', 'architect', 'implementer', 'tester', 'reviewer', 'security', 'documenter']

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

export type TestEnvelope = {
  status: 'ok' | 'error'
  testSuitePassed: boolean
  testsRan: string[]
  coverageNotes?: string
  details?: string
}

export type CriterionCheck = {
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

export type QaReport = {
  passed: boolean
  testsRan?: string
  output?: string
  summary: string
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
}

// The verdict is computed in code from findings and criteria, never taken from the agent.
export type SecurityReport = {
  passed: boolean
  findings: SecurityFinding[]
  criteria?: CriterionCheck[]
  summary: string
  // Automatic fix-then-review rounds already spent on blocking findings
  fixRounds?: number
}

export type DiffStat = {
  filesChanged: number
  insertions: number
  deletions: number
  files: string[]
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
  plan?: string
  // Developer answers to the Analyst's questions, fed into the next planning run
  clarifications?: string
  // Shell command that verifies the change (tests, lint, build); autodetected when empty
  verifyCommand?: string
  provider: 'claude' | 'codex' | 'agy'
  model?: string
  effort?: string
  diffStat?: DiffStat
  diffContent?: string
  qaReport?: QaReport
  securityReport?: SecurityReport
  prUrl?: string
  createdAt: string
  updatedAt: string
  error?: string
  spans?: ExecutionSpan[]
  handoffs?: TaskHandoffs
}
