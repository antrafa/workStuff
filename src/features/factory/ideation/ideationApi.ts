import { useState } from 'react'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import { tx } from '@/lib/i18n'
import type { IdeaPhase, IdeaView, IdeationAgentId } from '../../../../server/lib/ideation/types.ts'

export const ideasPath = (projectId: string, ideaId?: string) => `/factory/projects/${projectId}/ideas${ideaId ? `/${ideaId}` : ''}`

// role: what the agent does, shown when you hover its name in the conversation
export const IDEA_AGENT_UI: Record<IdeationAgentId | 'user' | 'system', { name: string; role: string; color: string }> = {
  user: { name: tx({ en: 'You', pt: 'Você' }), role: '', color: 'var(--ink-2)' },
  system: { name: tx({ en: 'Panel', pt: 'Painel' }), role: tx({ en: 'What the panel recorded', pt: 'O que o painel registrou' }), color: 'var(--line-hi)' },
  facilitator: { name: tx({ en: 'Facilitator', pt: 'Facilitador' }), role: tx({ en: 'Leads the conversation: asks what is still open and fills in the document', pt: 'Conduz a conversa: pergunta o que ainda está em aberto e preenche o documento' }), color: 'var(--fx-facilitator)' },
  red: { name: 'Red team', role: tx({ en: 'The devil\'s advocate: looks for where the idea fails', pt: 'O advogado do diabo: procura onde a ideia falha' }), color: 'var(--fx-redteam)' },
  blue: { name: 'Blue team', role: tx({ en: 'The defender: answers each criticism, honestly', pt: 'O defensor: responde a cada crítica, com honestidade' }), color: 'var(--fx-blueteam)' },
  planner: { name: 'Planner', role: tx({ en: 'Splits the work into large steps, in order', pt: 'Divide o trabalho em etapas grandes, em ordem' }), color: 'var(--fx-planner)' },
  splitter: { name: 'Splitter', role: tx({ en: 'Breaks each step into small tasks for the factory', pt: 'Quebra cada etapa em tarefas pequenas para a fábrica' }), color: 'var(--fx-splitter)' },
}

// hint: what the phase is for, in one line; guide: what you do now, in order
export const PHASE_UI: Record<IdeaPhase, { label: string; hint: string; guide: string }> = {
  explore: {
    label: tx({ en: 'Explore', pt: 'Explorar' }),
    hint: tx({ en: 'Understand the real problem: who has it and how they get by today', pt: 'Entender o problema de verdade: quem sofre com ele e como se vira hoje' }),
    guide: tx({ en: 'Click Start. The facilitator rewrites your idea as a problem and asks up to three questions, each with the answer it recommends. Answer in your own words or click "Use this answer", then Send. Repeat until the box below turns green, then approve.', pt: 'Clique em Começar. O facilitador reescreve a sua ideia como um problema e faz até três perguntas, cada uma com a resposta que ele recomenda. Responda com as suas palavras ou clique em "Usar esta resposta" e depois em Enviar. Repita até a caixa abaixo ficar verde e então aprove.' }),
  },
  challenge: {
    label: tx({ en: 'Challenge', pt: 'Desafiar' }),
    hint: tx({ en: 'Put the idea through criticism before spending time on it', pt: 'Pôr a ideia à prova antes de gastar tempo com ela' }),
    guide: tx({ en: 'Click "Run the challenge". The red team lists what can go wrong and the blue team answers each point. For each attack, choose what to do with it; the high-severity ones need a decision before you go on.', pt: 'Clique em "Rodar o desafio". O red team lista o que pode dar errado e o blue team responde a cada ponto. Para cada ataque, escolha o que fazer com ele; os de gravidade alta precisam de decisão antes de seguir.' }),
  },
  refine: {
    label: tx({ en: 'Refine', pt: 'Refinar' }),
    hint: tx({ en: 'Choose the smallest version that already shows whether the idea is worth it', pt: 'Escolher a menor versão que já mostra se a ideia vale a pena' }),
    guide: tx({ en: 'Keep talking to the facilitator. It proposes three ways to go (one without software), brings in what you decided in the challenge and ends by recommending to go on (go), change course (pivot) or stop.', pt: 'Continue a conversa com o facilitador. Ele propõe três caminhos (um deles sem software), leva em conta o que você decidiu no desafio e termina recomendando seguir (go), mudar o rumo (pivot) ou parar (stop).' }),
  },
  plan: {
    label: tx({ en: 'Plan', pt: 'Plano' }),
    hint: tx({ en: 'The large steps of the work, in order', pt: 'As etapas grandes do trabalho, em ordem' }),
    guide: tx({ en: 'Click "Generate the plan". The Planner splits the work into large steps (master tasks), starting with the simplest version that already works end to end. To change something, write it in the instructions and generate again.', pt: 'Clique em "Gerar o plano". O Planner divide o trabalho em etapas grandes (tarefas master), começando pela versão mais simples que já funciona de ponta a ponta. Para mudar algo, escreva nas instruções e gere de novo.' }),
  },
  split: {
    label: tx({ en: 'Break down', pt: 'Quebrar' }),
    hint: tx({ en: 'Each step into small tasks the factory can do', pt: 'Cada etapa em tarefas pequenas que a fábrica consegue fazer' }),
    guide: tx({ en: 'Click "Break the steps into tasks". Each task touches a single repository and a single technology, small enough to review at once. When the box below turns green, "Send to the factory" puts them on the board, in order.', pt: 'Clique em "Quebrar as etapas em tarefas". Cada tarefa mexe num só repositório e numa só tecnologia, pequena o bastante para revisar de uma vez. Quando a caixa abaixo ficar verde, "Enviar à fábrica" põe as tarefas no quadro, na ordem certa.' }),
  },
  dispatched: { label: tx({ en: 'In the factory', pt: 'Na fábrica' }), hint: tx({ en: 'The tasks are on the board', pt: 'As tarefas estão no quadro' }), guide: tx({ en: 'Follow the tasks on the Board tab. A task that waits for another only starts after it.', pt: 'Acompanhe as tarefas na aba Quadro. Uma tarefa que espera outra só começa depois dela.' }) },
  dropped: { label: tx({ en: 'Dropped', pt: 'Encerrada' }), hint: tx({ en: 'The idea stopped here; you can reopen it', pt: 'A ideia parou aqui; dá para reabrir' }), guide: tx({ en: 'The idea stopped here. "Reopen" takes it back to Challenge (or to Refine, if it was never challenged), with everything kept.', pt: 'A ideia parou aqui. "Reabrir" volta para Desafiar (ou para Refinar, se ela não passou pelo desafio), com tudo guardado.' }) },
}

// What the agents write comes in Portuguese; these turn it into the interface language
export const SEVERITY_UI = {
  alta: tx({ en: 'high severity', pt: 'gravidade alta' }),
  media: tx({ en: 'medium severity', pt: 'gravidade média' }),
  baixa: tx({ en: 'low severity', pt: 'gravidade baixa' }),
} as const
export const EVIDENCE_UI = {
  forte: tx({ en: 'strong evidence', pt: 'evidência forte' }),
  fraca: tx({ en: 'weak evidence', pt: 'evidência fraca' }),
  nenhuma: tx({ en: 'no evidence', pt: 'sem evidência' }),
} as const
export const STANCE_UI = {
  defende: tx({ en: 'Defends: the criticism does not hold', pt: 'Defende: a crítica não se sustenta' }),
  mitiga: tx({ en: 'Mitigates: the risk is real, and there is a cheap way to reduce it', pt: 'Mitiga: o risco existe, e há um jeito barato de reduzir' }),
  concede: tx({ en: 'Concedes: the criticism holds and there is no cheap fix', pt: 'Concorda: a crítica procede e não há saída barata' }),
} as const

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
