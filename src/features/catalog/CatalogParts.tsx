import { FolderCog, TriangleAlert } from 'lucide-react'
import { AgentChips } from './AgentChips'
import type { AgentId, AgentState, Catalog, CatalogItem } from './api'
import { AGENT_LABEL, STATUS } from './labels'
import { tx } from '@/lib/i18n'

export function SourcesBar({ roots, onManage }: { roots: Catalog['roots']; onManage: () => void }) {
  return (
    <div className="card sources-bar">
      <span className="eyebrow">{tx({ en: 'Folders', pt: 'Pastas' })}</span>
      {roots.map(r => (
        <span key={r.path} className={`source ${r.missing ? 'is-missing' : ''}`} title={r.missing ? tx({ en: `${r.path} no longer exists: move it back or remove it from the catalog`, pt: `${r.path} não existe mais: mova de volta ou tire do catálogo` }) : r.path}>
          <span className="mono">{r.label}</span>
          {r.missing ? <span className="badge badge-crit">{tx({ en: 'folder gone', pt: 'pasta sumiu' })}</span> : <span className="badge">{r.count}</span>}
        </span>
      ))}
      <div className="spacer" />
      <button className="btn btn-sm" onClick={onManage} title={tx({ en: 'Add or remove catalog folders', pt: 'Adicionar ou tirar pastas do catálogo' })}>
        <FolderCog size={13} /> {tx({ en: 'Manage folders', pt: 'Gerenciar pastas' })}
      </button>
    </div>
  )
}

export function AgentsBar({ agents }: { agents: Catalog['agents'] }) {
  return (
    <div className="card sources-bar">
      <span className="eyebrow">{tx({ en: 'Agents', pt: 'Agentes' })}</span>
      {agents.map(a => (
        <span
          key={a.id}
          className="source"
          title={tx({
            en: `Instructions: ${a.instructionsFile} (${a.instructionsMode === 'reference' ? '@ reference, the agent imports the file' : 'pointer, the agent reads the path on demand'})${a.instructionsExists ? '' : ' · does not exist yet, created on the first activation'}\nSkills: ${a.skillsDir}`,
            pt: `Instruções: ${a.instructionsFile} (${a.instructionsMode === 'reference' ? 'referência @, o agente importa o arquivo' : 'ponteiro, o agente lê o caminho sob demanda'})${a.instructionsExists ? '' : ' · ainda não existe, será criado na primeira ativação'}\nSkills: ${a.skillsDir}`,
          })}
        >
          <span className={`dot ${a.instructionsExists ? 'dot-ok' : ''}`} />
          <b>{AGENT_LABEL[a.id]}</b>
          <span className="badge">{a.instructionsMode === 'reference' ? tx({ en: '@ reference', pt: 'referência @' }) : tx({ en: 'pointer', pt: 'ponteiro' })}</span>
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
        {item.relPath} · {tx({ en: `${item.lines} lines`, pt: `${item.lines} linhas` })}
      </span>
      <span className="muted" style={{ fontSize: 12 }}>{item.rootLabel}</span>
      {item.duplicates.length > 0 && (
        <span className="badge badge-warn dup" title={tx({ en: `Same type and name in: ${item.duplicates.join(', ')}. Only one copy can take each agent's skills folder.`, pt: `Mesmo tipo e nome em: ${item.duplicates.join(', ')}. Só uma cópia pode ocupar a pasta de skills de cada agente.` })}>
          <TriangleAlert size={11} /> {tx({ en: 'also in', pt: 'também em' })} {item.duplicates.length === 1 ? item.duplicates[0] : tx({ en: `${item.duplicates.length} folders`, pt: `${item.duplicates.length} pastas` })}
        </span>
      )}
      <p className="catalog-desc" title={item.description}>{item.description || <span className="muted">{tx({ en: 'no description', pt: 'sem descrição' })}</span>}</p>
      <AgentChips item={item} onChange={onAgent} />
    </article>
  )
}
