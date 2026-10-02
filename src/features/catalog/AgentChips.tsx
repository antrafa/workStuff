import { Check, Loader2, Plus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/ui'
import { setAgent, type AgentId, type AgentState, type CatalogItem } from './api'
import { AGENT_LABEL } from './labels'

type Props = { item: CatalogItem; onChange: (agent: AgentId, state: AgentState) => void }

// Um chip por agente. Clique ativa (off/stale) ou desativa (on); "gerenciado fora" não é tocado.
export function AgentChips({ item, onChange }: Props) {
  const agents = Object.entries(item.agents) as [AgentId, AgentState][]
  if (agents.every(([, s]) => s.state === 'unsupported')) return null
  return (
    <div className="row" style={{ ['--gap' as string]: '6px' }} onClick={e => e.stopPropagation()}>
      {agents.map(([a]) => <AgentChip key={a} item={item} agent={a} onChange={onChange} showName />)}
    </div>
  )
}

type ChipProps = Props & { agent: AgentId; showName?: boolean }

// showName: no cartão o chip diz o agente; na tabela a coluna já diz, o chip diz só o estado.
export function AgentChip({ item, agent, onChange, showName }: ChipProps) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const s = item.agents[agent]
  if (s.state === 'unsupported') return null
  const name = AGENT_LABEL[agent]

  if (s.state === 'elsewhere') {
    return (
      <button className="agent-chip is-elsewhere" disabled title={`Gerenciado fora do workStuff: ${s.reason}`}>
        {showName ? `${name.toLowerCase()} · gerenciado fora` : 'gerenciado fora'}
      </button>
    )
  }

  const toggle = async () => {
    const on = s.state !== 'on'
    setBusy(true)
    try {
      onChange(agent, await setAgent(item.id, agent, on))
      toast(`${item.slug} ${on ? 'ativado' : 'desativado'} em ${name}`)
    } catch (e) {
      toast(`Não ${on ? 'ativou' : 'desativou'}: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const cls = s.state === 'on' ? 'is-on' : s.state === 'stale' ? 'is-stale' : ''
  const title =
    s.state === 'on' ? `Ativo em ${name}. Clique para desativar`
      : s.state === 'stale' ? `Desatualizado em ${name}: ${s.reason}. Clique para reativar`
      : `Ativar em ${name}`
  const icon = busy ? <Loader2 size={11} className="spin" /> : s.state === 'on' ? <Check size={11} /> : s.state === 'stale' ? <TriangleAlert size={11} /> : <Plus size={11} />
  const label = showName ? name.toLowerCase() : s.state === 'on' ? 'ativo' : s.state === 'stale' ? 'desatualizado' : 'ausente'
  return (
    <button className={`agent-chip ${cls}`} disabled={busy} onClick={e => (e.stopPropagation(), toggle())} title={title}>
      {icon} {label}{showName && s.state === 'stale' && ' — reativar'}
    </button>
  )
}
