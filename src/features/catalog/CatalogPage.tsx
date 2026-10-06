import './catalog.css'
import { BookOpen, FolderOpen, Plus, RotateCw, Store } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Async, Empty, Page, Search, Segmented, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { CreateModal, RootsModal } from './CatalogModals'
import { AgentsBar, ItemCard, SourcesBar } from './CatalogParts'
import { DetailModal } from './DetailModal'
import { ItemsTable } from './ItemsTable'
import { SkillsShModal } from './SkillsShModal'
import { fetchCatalog, type Catalog, type CatalogItem, type Kind, type Status } from './api'
import { KIND_LABEL, KIND_ORDER, STATUS } from './labels'
import { tx } from '@/lib/i18n'
type View = 'lista' | 'cartoes'

export default function CatalogPage() {
  const state = useAsync(fetchCatalog)
  const [query, setQuery] = useState('')
  // Active tab in the URL (?tipo=rule): reloading or sharing the link comes back to the same tab.
  const [params, setParams] = useSearchParams()
  const kind: Kind = KIND_ORDER.includes(params.get('tipo') as Kind) ? (params.get('tipo') as Kind) : 'skill'
  const setKind = (k: Kind) => setParams(p => (p.set('tipo', k), p), { replace: true })
  const view: View = params.get('vista') === 'cartoes' ? 'cartoes' : 'lista'
  const setView = (v: View) => setParams(p => (p.set('vista', v), p), { replace: true })
  const [skillsSh, setSkillsSh] = useState(false)
  const [root, setRoot] = useState('todas')
  const [status, setStatus] = useState<'todos' | Status>('todos')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)
  const [creating, setCreating] = useState(false)

  const patch = (id: string, p: Partial<CatalogItem>) =>
    state.data && state.setData({ ...state.data, items: state.data.items.map(i => (i.id === id ? { ...i, ...p } : i)) })

  const clearFilters = () => (setQuery(''), setRoot('todas'), setStatus('todos'))

  return (
    <Page
      title={tx({ en: 'Catalog', pt: 'Catálogo' })}
      hint={tx({ en: 'Everything that feeds the AI sessions, gathered from the folders you choose: skills, prompts, rules, personas, templates and notes.', pt: 'Tudo o que alimenta as sessões de IA, juntado das pastas que você escolher: skills, prompts, rules, personas, templates e notas.' })}
      actions={
        <>
          <button className="btn" onClick={state.reload} title={tx({ en: 'Scans the folders again', pt: 'Varre as pastas de novo' })}>
            <RotateCw size={14} className={state.loading ? 'spin' : ''} /> {tx({ en: 'Refresh', pt: 'Atualizar' })}
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)} disabled={!state.data?.roots.some(r => !r.missing)} title={tx({ en: 'Creates a new file in one of the folders and opens it in the editor', pt: 'Cria um arquivo novo numa das pastas e abre no editor' })}>
            <Plus size={14} /> {tx({ en: 'New item', pt: 'Novo item' })}
          </button>
        </>
      }
    >
      <Async
        state={state}
        isEmpty={d => d.roots.length === 0}
        skeleton={<SkeletonRows rows={4} height={110} />}
        empty={
          <div className="card">
            <Empty icon={FolderOpen} title={tx({ en: 'No folder in the catalog', pt: 'Nenhuma pasta no catálogo' })} action={<button className="btn btn-primary" onClick={() => setManaging(true)}><FolderOpen size={14} /> {tx({ en: 'Choose folders', pt: 'Escolher pastas' })}</button>}>
              {tx({ en: 'Point to the folders that hold your skills, rules, personas, prompts and templates. The catalog gathers it all in one screen.', pt: 'Aponte as pastas onde ficam suas skills, rules, personas, prompts e templates. O catálogo junta tudo numa tela só.' })}
            </Empty>
          </div>
        }
      >
        {data => (
          <>
            <SourcesBar roots={data.roots} onManage={() => setManaging(true)} />
            <AgentsBar agents={data.agents} />
            <Items
              data={data}
              filters={{ query, kind, root, status, view }}
              setters={{ setQuery, setKind, setRoot, setStatus, setView }}
              onClear={clearFilters}
              onOpen={setDetailId}
              onPatch={patch}
              onSkillsSh={() => setSkillsSh(true)}
            />
          </>
        )}
      </Async>

      {skillsSh && state.data && <SkillsShModal roots={state.data.roots.map(r => r.path)} onInstalled={state.reload} onClose={() => setSkillsSh(false)} />}
      {managing && <RootsModal roots={state.data?.roots ?? []} onSaved={state.reload} onClose={() => setManaging(false)} />}
      {creating && state.data && <CreateModal roots={state.data.roots} onCreated={state.reload} onClose={() => setCreating(false)} />}
      {detailId && state.data?.items.find(i => i.id === detailId) && (
        <DetailModal item={state.data.items.find(i => i.id === detailId)!} onPatch={p => patch(detailId, p)} onClose={() => setDetailId(null)} />
      )}
    </Page>
  )
}

type ItemsProps = {
  data: Catalog
  filters: { query: string; kind: Kind; root: string; status: 'todos' | Status; view: View }
  setters: {
    setView: (v: View) => void
    setQuery: (v: string) => void
    setKind: (v: Kind) => void
    setRoot: (v: string) => void
    setStatus: (v: 'todos' | Status) => void
  }
  onClear: () => void
  onOpen: (id: string) => void
  onPatch: (id: string, p: Partial<CatalogItem>) => void
  onSkillsSh: () => void
}

function Items({ data, filters, setters, onClear, onOpen, onPatch, onSkillsSh }: ItemsProps) {
  const q = filters.query.trim().toLowerCase()
  const scoped = data.items.filter(
    i =>
      (filters.root === 'todas' || i.root === filters.root) &&
      (filters.status === 'todos' || i.status === filters.status) &&
      (!q || `${i.title} ${i.slug} ${i.description} ${i.usage ?? ''}`.toLowerCase().includes(q)),
  )
  const visible = scoped.filter(i => i.kind === filters.kind)
  const total = (k: Kind) => data.items.filter(i => i.kind === k).length
  // Skills always shows (it is where skills.sh installs go); the other tabs only when they have items.
  const tabs = KIND_ORDER.filter(k => k === 'skill' || k === filters.kind || total(k) > 0)

  return (
    <>
      <nav className="tabs" role="tablist">
        {tabs.map(k => (
          <button key={k} role="tab" aria-selected={k === filters.kind} onClick={() => setters.setKind(k)}>
            {KIND_LABEL[k]} <span className="mono muted" style={{ fontSize: 11 }}>{total(k)}</span>
          </button>
        ))}
      </nav>
      <div className="row">
        <Search value={filters.query} onChange={setters.setQuery} placeholder={tx({ en: 'Search by name, description or trigger…', pt: 'Buscar por nome, descrição ou gatilho…' })} width={300} />
        <select className="select" value={filters.root} onChange={e => setters.setRoot(e.target.value)} title={tx({ en: 'Filter by folder', pt: 'Filtrar por pasta' })}>
          <option value="todas">{tx({ en: 'all folders', pt: 'todas as pastas' })}</option>
          {data.roots.map(r => <option key={r.path} value={r.path}>{r.label}</option>)}
        </select>
        <select className="select" value={filters.status} onChange={e => setters.setStatus(e.target.value as 'todos' | Status)} title={tx({ en: 'Filter by status', pt: 'Filtrar por status' })}>
          <option value="todos">{tx({ en: 'any status', pt: 'qualquer status' })}</option>
          {(Object.keys(STATUS) as Status[]).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <div className="spacer" />
        <Segmented value={filters.view} onChange={setters.setView} options={[{ id: 'lista', label: tx({ en: 'List', pt: 'Lista' }) }, { id: 'cartoes', label: tx({ en: 'Cards', pt: 'Cartões' }) }]} />
        <span className="mono muted" style={{ fontSize: 12 }}>{visible.length} / {total(filters.kind)} {KIND_LABEL[filters.kind].toLowerCase()}</span>
        {filters.kind === 'skill' && (
          <button className="btn" onClick={onSkillsSh} title={tx({ en: 'Searches and installs skills from the public skills.sh catalog', pt: 'Busca e instala skills do catálogo público skills.sh' })}>
            <Store size={14} /> {tx({ en: 'Search skills.sh', pt: 'Buscar no skills.sh' })}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <Empty
            icon={BookOpen}
            title={total(filters.kind) ? tx({ en: 'Nothing matches the filters', pt: 'Nada casa com os filtros' }) : tx({ en: `No item in ${KIND_LABEL[filters.kind]}`, pt: `Nenhum item em ${KIND_LABEL[filters.kind]}` })}
            action={total(filters.kind) ? <button className="btn btn-sm" onClick={onClear}>{tx({ en: 'Clear filters', pt: 'Limpar filtros' })}</button> : filters.kind === 'skill' ? <button className="btn btn-sm" onClick={onSkillsSh}><Store size={13} /> {tx({ en: 'Search skills.sh', pt: 'Buscar no skills.sh' })}</button> : undefined}
          >
            {total(filters.kind) ? undefined : filters.kind === 'skill' ? tx({ en: 'No folder has a skill (a folder with SKILL.md). Install one from skills.sh or add the folder where they live.', pt: 'Nenhuma pasta tem skill (pasta com SKILL.md). Instale uma do skills.sh ou adicione a pasta onde elas ficam.' }) : tx({ en: 'Create an item or add the folder where they live.', pt: 'Crie um item ou adicione a pasta onde eles ficam.' })}
          </Empty>
        </div>
      ) : filters.view === 'lista' ? (
        <ItemsTable items={visible} agents={data.agents} onOpen={onOpen} onAgent={(id, agent, st) => onPatch(id, { agents: { ...data.items.find(i => i.id === id)!.agents, [agent]: st } })} />
      ) : (
        <div className="grid" style={{ ['--min' as string]: '320px' }}>
          {visible.map(i => (
            <ItemCard
              key={i.id}
              item={i}
              onOpen={() => onOpen(i.id)}
              onAgent={(agent, st) => onPatch(i.id, { agents: { ...i.agents, [agent]: st } })}
            />
          ))}
        </div>
      )}
    </>
  )
}
