import { Check, Loader2, Plus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/ui'
import { setAgent, type AgentId, type AgentState, type CatalogItem } from './api'
import { AGENT_LABEL } from './labels'

type Props = { item: CatalogItem; onChange: (agent: AgentId, state: AgentState) => void }

// Um chip por agente. Clique ativa (off/stale) ou desativa (on); "gerenciado fora" não é tocado.
export function AgentChips({ item, onChange }: Props) {
  const [busy, setBusy] = useState<AgentId | null>(null)
  const toast = useToast()
  const agents = Object.entries(item.agents) as [AgentId, AgentState][]
  if (agents.every(([, s]) => s.state === 'unsupported')) return null

  const toggle = async (agent: AgentId, s: AgentState) => {
    const on = s.state !== 'on'
    setBusy(agent)
    try {
      onChange(agent, await setAgent(item.id, agent, on))
      toast(`${item.slug} ${on ? 'ativado' : 'desativado'} em ${AGENT_LABEL[agent]}`)
    } catch (e) {
      toast(`Não ${on ? 'ativou' : 'desativou'}: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="row" style={{ ['--gap' as string]: '6px' }} onClick={e => e.stopPropagation()}>
      {agents.map(([a, s]) => {
        if (s.state === 'unsupported') return null
        const label = AGENT_LABEL[a].toLowerCase()
        if (s.state === 'elsewhere') {
          return (
            <button key={a} className="agent-chip is-elsewhere" disabled title={`Gerenciado fora do workStuff: ${s.reason}`}>
              {label} · gerenciado fora
            </button>
          )
        }
        const cls = s.state === 'on' ? 'is-on' : s.state === 'stale' ? 'is-stale' : ''
        const title =
          s.state === 'on' ? `Ativo em ${AGENT_LABEL[a]}. Clique para desativar`
            : s.state === 'stale' ? `Desatualizado em ${AGENT_LABEL[a]}: ${s.reason}. Clique para reativar`
            : `Ativar em ${AGENT_LABEL[a]}`
        const icon = busy === a ? <Loader2 size={11} className="spin" /> : s.state === 'on' ? <Check size={11} /> : s.state === 'stale' ? <TriangleAlert size={11} /> : <Plus size={11} />
        return (
          <button key={a} className={`agent-chip ${cls}`} disabled={busy !== null} onClick={() => toggle(a, s)} title={title}>
            {icon} {label}{s.state === 'stale' && ' — reativar'}
          </button>
        )
      })}
    </div>
  )
}
