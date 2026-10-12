// Ideation data types. Plain values only: the web app imports this file.

export type IdeaPhase = 'explore' | 'challenge' | 'refine' | 'plan' | 'split' | 'dispatched' | 'dropped'

// The phases a developer walks through, in order; 'dropped' is an exit, not a step.
export const PHASE_ORDER: IdeaPhase[] = ['explore', 'challenge', 'refine', 'plan', 'split', 'dispatched']

export type IdeationAgentId = 'facilitator' | 'red' | 'blue' | 'planner' | 'splitter'

// Sections of the living document, in reading order. The agents update them by key; the code
// renders idea.md from them.
export const DOC_SECTIONS = [
  ['original', 'Ideia original', 'Original idea'],
  ['problem', 'Problema real', 'Real problem'],
  ['audience', 'Público', 'Audience'],
  ['job', 'Job to be done', 'Job to be done'],
  ['evidence', 'Evidência atual', 'Current evidence'],
  ['workaround', 'Contorno atual', 'Current workaround'],
  ['assumptions', 'Premissas e riscos', 'Assumptions and risks'],
  ['premortem', 'Pre-mortem', 'Pre-mortem'],
  ['mitigations', 'Decisões do desafio', 'Challenge decisions'],
  ['options', 'Opções de solução', 'Solution options'],
  ['refined', 'Versão refinada', 'Refined version'],
  ['outOfV1', 'Fora da v1', 'Out of v1'],
  ['nextTests', 'Próximos testes', 'Next tests'],
  ['recommendation', 'Recomendação', 'Recommendation'],
  ['decisions', 'Log de decisões', 'Decision log'],
] as const

export type DocSection = (typeof DOC_SECTIONS)[number][0]
export const DOC_KEYS: DocSection[] = DOC_SECTIONS.map(s => s[0])

// What each phase must have filled (or marked "hipótese — verificar") before its gate opens.
export const PHASE_REQUIRED: Partial<Record<IdeaPhase, DocSection[]>> = {
  explore: ['problem', 'audience', 'job', 'workaround'],
  challenge: ['assumptions', 'premortem'],
  refine: ['refined', 'outOfV1', 'recommendation'],
}

export type Question = { question: string; recommendation: string }

export type IdeaTurn = {
  role: 'user' | IdeationAgentId | 'system'
  text: string
  questions?: Question[]
  at: string
}

export type Severity = 'alta' | 'media' | 'baixa'
export type Evidence = 'forte' | 'fraca' | 'nenhuma'
export type AttackDecision = 'accept' | 'mitigate' | 'discard' | 'kill'

export type ChallengeAttack = {
  id: string
  target: string
  attack: string
  severity: Severity
  evidence: Evidence
  // Blue's answer to this attack
  stance?: 'defende' | 'mitiga' | 'concede'
  argument?: string
  mitigation?: string
  decision?: AttackDecision
  note?: string
}

export type ChallengeRound = { round: number; attacks: ChallengeAttack[]; at: string }

export type MasterTask = {
  key: string
  title: string
  objective: string
  inScope: string[]
  outOfScope: string[]
  repos: string[]
  // Repositories this master creates inside the project folder (a new project starts empty)
  newRepos?: string[]
  scenarios: string[]
  dependsOn: string[]
  walkingSkeleton: boolean
}

export const STACKS = ['backend', 'frontend', 'mobile', 'infra', 'docs'] as const
export type Stack = (typeof STACKS)[number]

export type ExecutableTask = {
  key: string
  masterKey: string
  title: string
  repo: string
  stack: Stack
  objective: string
  inScope: string[]
  outOfScope: string[]
  contracts: string[]
  scenarios: string[]
  // Keys of other executable tasks, or of a master (meaning every task of that master)
  dependsOn: string[]
  verifyHint?: string
}

export type IdeaRun = {
  agent: IdeationAgentId
  at: string
  durationMs: number
  model?: string
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number }
}

export type Idea = {
  id: string
  projectId: string
  title: string
  phase: IdeaPhase
  // Set when a later phase was reopened: what was built on top may be stale
  stale?: IdeaPhase[]
  doc: Partial<Record<DocSection, string>>
  turns: IdeaTurn[]
  challenge?: ChallengeRound[]
  masters?: MasterTask[]
  tasks?: ExecutableTask[]
  // Executable task key -> FactoryTask id
  dispatched?: Record<string, string>
  recommendation?: 'go' | 'pivot' | 'stop'
  droppedReason?: string
  runs?: IdeaRun[]
  createdAt: string
  updatedAt: string
}

// Not persisted: filled by the API
export type IdeaView = Idea & { executing: boolean; gate: string[] }
