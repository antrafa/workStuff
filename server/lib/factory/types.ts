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

export type SpecializedAgentId = 'architect' | 'implementer' | 'tester' | 'reviewer'

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
}
