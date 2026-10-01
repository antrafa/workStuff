import { FolderCog, TriangleAlert } from 'lucide-react'
import { AgentChips } from './AgentChips'
import type { AgentId, AgentState, Catalog, CatalogItem } from './api'
import { AGENT_LABEL, STATUS } from './labels'

export function SourcesBar({ roots, onManage }: { roots: Catalog['roots']; onManage: () => void }) {
  return (
    <div className="card sources-bar">
      <span className="eyebrow">Pastas</span>
      {roots.map(r => (
        <span key={r.path} className={`source ${r.missing ? 'is-missing' : ''}`} title={r.missing ? `${r.path} não existe mais: mova de volta ou tire do catálogo` : r.path}>
          <span className="mono">{r.label}</span>
          {r.missing ? <span className="badge badge-crit">pasta sumiu</span> : <span className="badge">{r.count}</span>}
        </span>
      ))}
      <div className="spacer" />
      <button className="btn btn-sm" onClick={onManage} title="Adicionar ou tirar pastas do catálogo">
        <FolderCog size={13} /> Gerenciar pastas
      </button>
    </div>
  )
}

export function AgentsBar({ agents }: { agents: Catalog['agents'] }) {
  return (
    <div className="card sources-bar">
      <span className="eyebrow">Agentes</span>
      {agents.map(a => (
        <span
          key={a.id}
          className="source"
          title={`Instruções: ${a.instructionsFile} (${a.instructionsMode === 'reference' ? 'referência @, o agente importa o arquivo' : 'ponteiro, o agente lê o caminho sob demanda'})${a.instructionsExists ? '' : ' · ainda não existe, será criado na primeira ativação'}\nSkills: ${a.skillsDir}`}
        >
          <span className={`dot ${a.instructionsExists ? 'dot-ok' : ''}`} />
          <b>{AGENT_LABEL[a.id]}</b>
          <span className="badge">{a.instructionsMode === 'reference' ? 'referência @' : 'ponteiro'}</span>
        </span>
      ))}
    </div>
  )
}

type CardProps = { item: CatalogItem; onOpen: () => void; onAgent: (agent: AgentId, state: AgentState) => void }

export function ItemCard({ item, onOpen, onAgent }: CardProps) {
  const status = STATUS[item.status]
  return (
    <article className="card interactive catalog-card" onClick={onOpen}>
      <div className="row">
        <b className="spacer">{item.title}</b>
        <span className={`badge ${status.badge}`}>{status.label}</span>
      </div>
      <span className="mono muted" style={{ fontSize: 11.5 }} title={item.pathLabel}>
        {item.relPath} · {item.lines} linhas
      </span>
      <span className="muted" style={{ fontSize: 12 }}>{item.rootLabel}</span>
      {item.duplicates.length > 0 && (
        <span className="badge badge-warn dup" title={`Mesmo tipo e nome em: ${item.duplicates.join(', ')}. Só uma cópia pode ocupar a pasta de skills de cada agente.`}>
          <TriangleAlert size={11} /> também em {item.duplicates.length === 1 ? item.duplicates[0] : `${item.duplicates.length} pastas`}
        </span>
      )}
      <p className="catalog-desc" title={item.description}>{item.description || <span className="muted">sem descrição</span>}</p>
      <AgentChips item={item} onChange={onAgent} />
    </article>
  )
}
