import type { AgentId, Kind, Status } from './api'
import { tx } from '@/lib/i18n'

export const KIND_ORDER: Kind[] = ['skill', 'prompt', 'rule', 'persona', 'template', 'nota']

export const KIND_LABEL: Record<Kind, string> = {
  skill: 'Skills', prompt: 'Prompts', rule: 'Rules', persona: 'Personas', template: 'Templates', nota: tx({ en: 'Notes', pt: 'Notas' }),
}

export const KIND_SINGULAR: Record<Kind, string> = {
  skill: 'Skill', prompt: 'Prompt', rule: 'Rule', persona: 'Persona', template: 'Template', nota: tx({ en: 'Note', pt: 'Nota' }),
}

export const STATUS: Record<Status, { label: string; badge: string }> = {
  ideia: { label: tx({ en: 'idea', pt: 'ideia' }), badge: 'badge-info' },
  'em-andamento': { label: tx({ en: 'in progress', pt: 'em andamento' }), badge: 'badge-warn' },
  finalizado: { label: tx({ en: 'finished', pt: 'finalizado' }), badge: 'badge-ok' },
  'precisa-melhoria': { label: tx({ en: 'needs work', pt: 'precisa melhoria' }), badge: 'badge-crit' },
}

export const AGENT_LABEL: Record<AgentId, string> = {
  claude: 'Claude', codex: 'Codex', gemini: 'Gemini/Antigravity', opencode: 'OpenCode',
}
