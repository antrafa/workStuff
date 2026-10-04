// Tipos de dados da Fábrica de Software e Agentes Especializados.

export type FactoryTaskState =
  | 'intake'            // Tarefa criada ou importada, aguardando início
  | 'planning'          // Agente Architect elaborando plano (modo leitura)
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

export type SpecializedAgentId = 'architect' | 'implementer' | 'tester' | 'reviewer'

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

export type ReviewEnvelope = {
  status: 'ok' | 'error'
  securityPassed: boolean
  findings: SecurityFinding[]
  mrDescription: string
  summary: string
}

export type TaskHandoffs = {
  plan?: PlanEnvelope
  build?: BuildEnvelope
  test?: TestEnvelope
  review?: ReviewEnvelope
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
}

export type SecurityReport = {
  passed: boolean
  findings: SecurityFinding[]
  summary: string
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
