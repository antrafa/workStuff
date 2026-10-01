import type { AgentId, Kind, Status } from './api'

export const KIND_ORDER: Kind[] = ['skill', 'prompt', 'rule', 'persona', 'template', 'nota']

export const KIND_LABEL: Record<Kind, string> = {
  skill: 'Skills', prompt: 'Prompts', rule: 'Rules', persona: 'Personas', template: 'Templates', nota: 'Notas',
}

export const KIND_SINGULAR: Record<Kind, string> = {
  skill: 'Skill', prompt: 'Prompt', rule: 'Rule', persona: 'Persona', template: 'Template', nota: 'Nota',
}

export const STATUS: Record<Status, { label: string; badge: string }> = {
  ideia: { label: 'ideia', badge: 'badge-info' },
  'em-andamento': { label: 'em andamento', badge: 'badge-warn' },
  finalizado: { label: 'finalizado', badge: 'badge-ok' },
  'precisa-melhoria': { label: 'precisa melhoria', badge: 'badge-crit' },
}

export const AGENT_LABEL: Record<AgentId, string> = {
  claude: 'Claude', codex: 'Codex', gemini: 'Gemini/Antigravity', opencode: 'OpenCode',
}
