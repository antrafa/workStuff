import { Check, Loader2, Plus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/ui'
import { setAgent, type AgentId, type AgentState, type CatalogItem } from './api'
import { AGENT_LABEL } from './labels'
import { tx } from '@/lib/i18n'

type Props = { item: CatalogItem; onChange: (agent: AgentId, state: AgentState) => void }

// One chip per agent. A click activates (off/stale) or deactivates (on); "managed elsewhere" is left alone.
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

// showName: on a card the chip names the agent; in the table the column already does, so the chip shows only the state.
export function AgentChip({ item, agent, onChange, showName }: ChipProps) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const s = item.agents[agent]
  if (s.state === 'unsupported') return null
  const name = AGENT_LABEL[agent]

  if (s.state === 'elsewhere') {
    return (
      <button className="agent-chip is-elsewhere" disabled title={tx({ en: `Managed outside workStuff: ${s.reason}`, pt: `Gerenciado fora do workStuff: ${s.reason}` })}>
        {showName ? tx({ en: `${name.toLowerCase()} · managed elsewhere`, pt: `${name.toLowerCase()} · gerenciado fora` }) : tx({ en: 'managed elsewhere', pt: 'gerenciado fora' })}
      </button>
    )
  }

  const toggle = async () => {
    const on = s.state !== 'on'
    setBusy(true)
    try {
      onChange(agent, await setAgent(item.id, agent, on))
      toast(on ? tx({ en: `${item.slug} activated in ${name}`, pt: `${item.slug} ativado em ${name}` }) : tx({ en: `${item.slug} deactivated in ${name}`, pt: `${item.slug} desativado em ${name}` }))
    } catch (e) {
      toast(on ? tx({ en: `Not activated: ${(e as Error).message}`, pt: `Não ativou: ${(e as Error).message}` }) : tx({ en: `Not deactivated: ${(e as Error).message}`, pt: `Não desativou: ${(e as Error).message}` }))
    } finally {
      setBusy(false)
    }
  }

  const cls = s.state === 'on' ? 'is-on' : s.state === 'stale' ? 'is-stale' : ''
  const title =
    s.state === 'on' ? tx({ en: `Active in ${name}. Click to deactivate`, pt: `Ativo em ${name}. Clique para desativar` })
      : s.state === 'stale' ? tx({ en: `Outdated in ${name}: ${s.reason}. Click to reactivate`, pt: `Desatualizado em ${name}: ${s.reason}. Clique para reativar` })
      : tx({ en: `Activate in ${name}`, pt: `Ativar em ${name}` })
  const icon = busy ? <Loader2 size={11} className="spin" /> : s.state === 'on' ? <Check size={11} /> : s.state === 'stale' ? <TriangleAlert size={11} /> : <Plus size={11} />
  const label = showName ? name.toLowerCase() : s.state === 'on' ? tx({ en: 'active', pt: 'ativo' }) : s.state === 'stale' ? tx({ en: 'outdated', pt: 'desatualizado' }) : tx({ en: 'missing', pt: 'ausente' })
  return (
    <button className={`agent-chip ${cls}`} disabled={busy} onClick={e => (e.stopPropagation(), toggle())} title={title}>
      {icon} {label}{showName && s.state === 'stale' && tx({ en: ' — reactivate', pt: ' — reativar' })}
    </button>
  )
}
