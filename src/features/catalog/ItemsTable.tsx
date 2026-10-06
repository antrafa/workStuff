import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { AgentChip } from './AgentChips'
import { setAgent, type AgentId, type AgentState, type AgentTarget, type CatalogItem } from './api'
import { AGENT_LABEL } from './labels'
import { tx } from '@/lib/i18n'

type Props = {
  items: CatalogItem[]
  agents: AgentTarget[]
  onOpen: (id: string) => void
  onAgent: (id: string, agent: AgentId, state: AgentState) => void
}

// Bulk activation only touches what is missing or outdated; active and "managed elsewhere" stay as they are.
const needsActivation = (item: CatalogItem, agent: AgentId) => ['off', 'stale'].includes(item.agents[agent].state)

export function ItemsTable({ items, agents, onOpen, onAgent }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const usedAgents = agents.filter(a => items.some(i => i.agents[a.id].state !== 'unsupported'))
  const allSelected = items.length > 0 && items.every(i => selected.includes(i.id))
  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))

  return (
    <>
      <div className="card table-wrap">
        <table className="table catalog-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : items.map(i => i.id))} title={tx({ en: 'Select all visible', pt: 'Selecionar todos os visíveis' })} />
              </th>
              <th>{tx({ en: 'Name', pt: 'Nome' })}</th>
              <th>{tx({ en: 'Source', pt: 'Origem' })}</th>
              {usedAgents.map(a => <th key={a.id}>{AGENT_LABEL[a.id]}</th>)}
              <th>{tx({ en: 'Updated', pt: 'Atualizado' })}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id} className={`clickable ${selected.includes(i.id) ? 'is-selected' : ''}`} onClick={() => onOpen(i.id)}>
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} aria-label={tx({ en: `Select ${i.slug}`, pt: `Selecionar ${i.slug}` })} />
                </td>
                <td>
                  <div className="mono catalog-slug">{i.slug}</div>
                  <div className="muted catalog-sub" title={i.description}>{i.description || tx({ en: 'no description', pt: 'sem descrição' })}</div>
                </td>
                <td className="mono muted catalog-origin" title={i.pathLabel}>…/{i.rootLabel.split('/').slice(-2).join('/')}</td>
                {usedAgents.map(a => (
                  <td key={a.id}><AgentChip item={i} agent={a.id} onChange={(agent, st) => onAgent(i.id, agent, st)} /></td>
                ))}
                <td className="mono muted" style={{ fontSize: 12 }}>{relTime(i.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected.length > 0 && (
        <BulkBar
          items={items.filter(i => selected.includes(i.id))}
          agents={usedAgents}
          onAgent={onAgent}
          onClear={() => setSelected([])}
        />
      )}
    </>
  )
}

type BulkProps = { items: CatalogItem[]; agents: AgentTarget[]; onAgent: Props['onAgent']; onClear: () => void }

function BulkBar({ items, agents, onAgent, onClear }: BulkProps) {
  const [agent, setAgentId] = useState<AgentId>(agents.find(a => items.some(i => needsActivation(i, a.id)))?.id ?? agents[0]?.id)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const target = agents.find(a => a.id === agent)
  const pending = items.filter(i => needsActivation(i, agent))
  const skills = pending.filter(i => i.kind === 'skill')

  // What will happen, in the server's own terms: a skill becomes a link in the agent's folder; the rest becomes a reference.
  const preview = !target || pending.length === 0
    ? tx({ en: 'nothing to do: the selected ones are already active in this agent (or managed elsewhere)', pt: 'nada a fazer: as selecionadas já estão ativas neste agente (ou gerenciadas fora)' })
    : [
        skills.length > 0 && `ln -s {${skills.map(s => s.slug).join(',')}} → ${target.skillsDir}/`,
        pending.length > skills.length && tx({ en: `+ ${pending.length - skills.length} reference(s) in ${target.instructionsFile}`, pt: `+ ${pending.length - skills.length} referência(s) em ${target.instructionsFile}` }),
      ].filter(Boolean).join('  ')

  const run = async () => {
    setBusy(true)
    let failed = 0
    for (const i of pending) {
      try {
        onAgent(i.id, agent, await setAgent(i.id, agent, true))
      } catch {
        failed += 1
      }
    }
    setBusy(false)
    toast(failed ? tx({ en: `${pending.length - failed} activated, ${failed} failed in ${AGENT_LABEL[agent]}`, pt: `${pending.length - failed} ativadas, ${failed} falharam em ${AGENT_LABEL[agent]}` }) : tx({ en: `${pending.length} activated in ${AGENT_LABEL[agent]}`, pt: `${pending.length} ativadas em ${AGENT_LABEL[agent]}` }))
    if (!failed) onClear()
  }

  return (
    <div className="bulk-bar">
      <b>{tx({ en: `${items.length} selected`, pt: `${items.length} selecionada${items.length > 1 ? 's' : ''}` })}</b>
      <select className="select" value={agent} onChange={e => setAgentId(e.target.value as AgentId)} title={tx({ en: 'Agent to activate in', pt: 'Agente onde ativar' })}>
        {agents.map(a => <option key={a.id} value={a.id}>{AGENT_LABEL[a.id]}</option>)}
      </select>
      <code className="mono bulk-preview" title={target ? pending.map(i => i.kind === 'skill' ? `ln -s ${i.path} ${target.skillsDir}/${i.slug}` : `${i.slug} → ${target.instructionsFile}`).join('\n') : ''}>{preview}</code>
      <button className="btn btn-ghost" onClick={onClear}>{tx({ en: 'Clear', pt: 'Limpar' })}</button>
      <button className="btn btn-primary" disabled={busy || pending.length === 0} onClick={run}>
        {busy && <Loader2 size={14} className="spin" />} {tx({ en: `Activate ${pending.length || ''} in ${AGENT_LABEL[agent]}`, pt: `Ativar ${pending.length || ''} no ${AGENT_LABEL[agent]}` })}
      </button>
    </div>
  )
}
