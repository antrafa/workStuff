import { useState } from 'react'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import { tx } from '@/lib/i18n'
import type { IdeaPhase, IdeaView, IdeationAgentId } from '../../../../server/lib/ideation/types.ts'

export const ideasPath = (projectId: string, ideaId?: string) => `/factory/projects/${projectId}/ideas${ideaId ? `/${ideaId}` : ''}`

export const IDEA_AGENT_UI: Record<IdeationAgentId | 'user' | 'system', { name: string; color: string }> = {
  user: { name: tx({ en: 'You', pt: 'Você' }), color: 'var(--ink-2)' },
  system: { name: tx({ en: 'Panel', pt: 'Painel' }), color: 'var(--line-hi)' },
  facilitator: { name: tx({ en: 'Facilitator', pt: 'Facilitador' }), color: 'var(--fx-facilitator)' },
  red: { name: 'Red team', color: 'var(--fx-redteam)' },
  blue: { name: 'Blue team', color: 'var(--fx-blueteam)' },
  planner: { name: 'Planner', color: 'var(--fx-planner)' },
  splitter: { name: 'Splitter', color: 'var(--fx-splitter)' },
}

export const PHASE_UI: Record<IdeaPhase, { label: string; hint: string }> = {
  explore: { label: tx({ en: 'Explore', pt: 'Explorar' }), hint: tx({ en: 'The real problem, who has it and what they do today', pt: 'O problema real, quem o tem e o que faz hoje' }) },
  challenge: { label: tx({ en: 'Challenge', pt: 'Desafiar' }), hint: tx({ en: 'Red team attacks, blue team defends, you decide each attack', pt: 'Red team ataca, blue team defende, você decide cada ataque' }) },
  refine: { label: tx({ en: 'Refine', pt: 'Refinar' }), hint: tx({ en: 'Three options, the smallest version that tests the riskiest assumption, go/pivot/stop', pt: 'Três opções, a menor versão que testa a premissa mais arriscada, go/pivot/stop' }) },
  plan: { label: tx({ en: 'Plan', pt: 'Plano' }), hint: tx({ en: 'Master tasks, the walking skeleton first', pt: 'Tarefas master, o walking skeleton primeiro' }) },
  split: { label: 'Split', hint: tx({ en: 'Each master into tasks of one repository and one stack', pt: 'Cada master em tarefas de um repositório e uma stack' }) },
  dispatched: { label: tx({ en: 'In the factory', pt: 'Na fábrica' }), hint: tx({ en: 'The tasks are on the board', pt: 'As tarefas estão no quadro' }) },
  dropped: { label: tx({ en: 'Dropped', pt: 'Encerrada' }), hint: tx({ en: 'The idea stopped here; you can reopen it', pt: 'A ideia parou aqui; dá para reabrir' }) },
}

type StreamEvent = { type: string; text?: string; message?: string; agentId?: IdeationAgentId; idea?: IdeaView; errors?: string[] }

// One agent operation on an idea: the live text and status while it runs, then the saved idea.
export function useIdeaRun(projectId: string, ideaId: string, onIdea: (idea: IdeaView) => void) {
  const [running, setRunning] = useState(false)
  const [live, setLive] = useState<{ agentId?: IdeationAgentId; text: string; status: string }>({ text: '', status: '' })
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const run = async (action: string, body: object = {}) => {
    setRunning(true)
    setError(null)
    setErrors([])
    setLive({ text: '', status: tx({ en: 'starting...', pt: 'iniciando...' }) })
    try {
      await streamPost<StreamEvent>(`${ideasPath(projectId, ideaId)}/${action}`, e => {
        if (e.type === 'status') setLive(l => ({ ...l, agentId: e.agentId, status: e.message ?? '', text: e.agentId !== l.agentId ? '' : l.text }))
        else if (e.type === 'text' && e.text) setLive(l => ({ ...l, agentId: e.agentId ?? l.agentId, text: l.text + e.text }))
        else if (e.type === 'tool') setLive(l => ({ ...l, status: tx({ en: `reading the project (${(e as { tool?: string }).tool})...`, pt: `lendo o projeto (${(e as { tool?: string }).tool})...` }) }))
        else if (e.type === 'error') setError(e.message ?? tx({ en: 'the agent failed', pt: 'o agente falhou' }))
        else if (e.type === 'done' && e.idea) {
          onIdea(e.idea)
          setErrors(e.errors ?? [])
        }
      }, undefined, body)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const stop = () => api.post(`${ideasPath(projectId, ideaId)}/stop`).catch(() => {})

  return { run, stop, running, live, error, setError, errors }
}
