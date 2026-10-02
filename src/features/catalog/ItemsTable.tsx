import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { AgentChip } from './AgentChips'
import { setAgent, type AgentId, type AgentState, type AgentTarget, type CatalogItem } from './api'
import { AGENT_LABEL } from './labels'

type Props = {
  items: CatalogItem[]
  agents: AgentTarget[]
  onOpen: (id: string) => void
  onAgent: (id: string, agent: AgentId, state: AgentState) => void
}

// Ativar em lote só toca o que está ausente ou desatualizado; ativo e "gerenciado fora" ficam como estão.
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
                <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : items.map(i => i.id))} title="Selecionar todos os visíveis" />
              </th>
              <th>Nome</th>
              <th>Origem</th>
              {usedAgents.map(a => <th key={a.id}>{AGENT_LABEL[a.id]}</th>)}
              <th>Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id} className={`clickable ${selected.includes(i.id) ? 'is-selected' : ''}`} onClick={() => onOpen(i.id)}>
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} aria-label={`Selecionar ${i.slug}`} />
                </td>
                <td>
                  <div className="mono catalog-slug">{i.slug}</div>
                  <div className="muted catalog-sub" title={i.description}>{i.description || 'sem descrição'}</div>
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

  // O que vai acontecer, no mesmo idioma do servidor: skill vira link na pasta do agente; o resto vira referência.
  const preview = !target || pending.length === 0
    ? 'nada a fazer: as selecionadas já estão ativas neste agente (ou gerenciadas fora)'
    : [
        skills.length > 0 && `ln -s {${skills.map(s => s.slug).join(',')}} → ${target.skillsDir}/`,
        pending.length > skills.length && `+ ${pending.length - skills.length} referência(s) em ${target.instructionsFile}`,
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
    toast(failed ? `${pending.length - failed} ativadas, ${failed} falharam em ${AGENT_LABEL[agent]}` : `${pending.length} ativadas em ${AGENT_LABEL[agent]}`)
    if (!failed) onClear()
  }

  return (
    <div className="bulk-bar">
      <b>{items.length} selecionada{items.length > 1 ? 's' : ''}</b>
      <select className="select" value={agent} onChange={e => setAgentId(e.target.value as AgentId)} title="Agente onde ativar">
        {agents.map(a => <option key={a.id} value={a.id}>{AGENT_LABEL[a.id]}</option>)}
      </select>
      <code className="mono bulk-preview" title={target ? pending.map(i => i.kind === 'skill' ? `ln -s ${i.path} ${target.skillsDir}/${i.slug}` : `${i.slug} → ${target.instructionsFile}`).join('\n') : ''}>{preview}</code>
      <button className="btn btn-ghost" onClick={onClear}>Limpar</button>
      <button className="btn btn-primary" disabled={busy || pending.length === 0} onClick={run}>
        {busy && <Loader2 size={14} className="spin" />} Ativar {pending.length || ''} no {AGENT_LABEL[agent]}
      </button>
    </div>
  )
}
