import { Archive, ChevronRight, Code2, Download, ExternalLink, Folder, FolderGit2, Home, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { Async, ConfirmModal, Empty, Search, SkeletonRows, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { ClonePanel, useClone } from './ClonePanel'
import { browse, inWorkspace, openProject, type Group, type Project, type Source, belowWorkspace } from './api'
import { tx } from '@/lib/i18n'

const LOCAL = {
  cloned: { badge: 'badge-ok', label: tx({ en: 'cloned', pt: 'clonado' }), title: tx({ en: 'a git repository already exists in this folder', pt: 'já existe um repositório git nesta pasta' }) },
  occupied: { badge: 'badge-warn', label: tx({ en: 'folder taken', pt: 'pasta ocupada' }), title: tx({ en: 'the folder exists, has files and is not a git repository: the clone skips this project', pt: 'a pasta existe, tem arquivos e não é repositório git: o clone pula este projeto' }) },
  free: { badge: '', label: tx({ en: 'not cloned', pt: 'não clonado' }), title: tx({ en: 'not in your workspace yet', pt: 'ainda não existe no seu workspace' }) },
}

export function Browser({ source }: { source: Source }) {
  const show = (p: string | null) => inWorkspace(source, p)
  const below = (p: string | null) => belowWorkspace(source, p)
  const [path, setPath] = useState(source.basePath)
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [confirmGroup, setConfirmGroup] = useState<{ fullPath: string; dest: string | null } | null>(null)
  const listing = useAsync(() => browse(source.id, path), [source.id, path])
  const clone = useClone(source, () => listing.reload())
  const toast = useToast()

  const q = query.trim().toLowerCase()
  const match = (x: { name: string; fullPath: string; description: string }) => !q || `${x.name} ${x.fullPath} ${x.description}`.toLowerCase().includes(q)
  const groups = (listing.data?.groups ?? []).filter(match)
  const allProjects = listing.data?.projects ?? []
  const projects = allProjects.filter(p => match(p) && (archived || !p.archived))
  const hiddenArchived = allProjects.filter(p => p.archived && !archived).length

  // Breadcrumb from the base: the browsing root is the base group, not the provider's top.
  const base = source.basePath
  const rel = path === base ? '' : base ? path.slice(base.length + 1) : path
  const crumbs = rel ? rel.split('/') : []

  const open = (fullPath: string) => openProject(source.id, fullPath).catch(e => toast((e as Error).message))
  const startClone = (fullPath: string, kind: 'project' | 'group') => {
    if (clone.run?.running) return toast(tx({ en: 'Wait for the running clone to finish (or stop it) before starting another', pt: 'Espere o clone em andamento terminar (ou pare ele) antes de começar outro' }))
    clone.start({ id: Date.now(), fullPath, kind, includeArchived: archived })
  }
  const canGoUp = path !== base

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <nav className="crumbs repo-crumbs" aria-label={tx({ en: 'Path on the provider', pt: 'Caminho no provedor' })}>
          <button onClick={() => setPath(base)} title={tx({ en: `Base group: ${base || 'root'}`, pt: `Grupo base: ${base || 'raiz'}` })}><Home size={13} /> {base ? base.split('/').pop() : tx({ en: 'root', pt: 'raiz' })}</button>
          {crumbs.map((c, i) => (
            <span key={i} className="row" style={{ ['--gap' as string]: '4px' }}>
              <ChevronRight size={12} />
              <button onClick={() => setPath([base, ...crumbs.slice(0, i + 1)].filter(Boolean).join('/'))}>{c}</button>
            </span>
          ))}
        </nav>
        <div className="spacer" />
        {listing.data?.webUrl && <a className="btn btn-ghost btn-sm" href={listing.data.webUrl} target="_blank" rel="noreferrer" title={tx({ en: 'Opens this group on the provider', pt: 'Abre este grupo no provedor' })}><ExternalLink size={13} /> {tx({ en: 'Open on', pt: 'Abrir no' })} {source.provider === 'gitlab' ? 'GitLab' : 'GitHub'}</a>}
        <button className="btn btn-ghost btn-sm" onClick={listing.reload} title={tx({ en: 'Reads the list and the local state again', pt: 'Lê de novo a lista e o estado local' })}><RotateCw size={13} className={listing.loading ? 'spin' : ''} /> {tx({ en: 'Refresh', pt: 'Atualizar' })}</button>
        {canGoUp && (
          <button className="btn btn-sm" onClick={() => setConfirmGroup({ fullPath: path, dest: listing.data?.dest ?? null })} title={tx({ en: `Clones every project of ${path} into ${show(listing.data?.dest ?? null)}`, pt: `Clona todos os projetos de ${path} para ${show(listing.data?.dest ?? null)}` })}>
            <Download size={13} /> {tx({ en: 'Clone this subgroup', pt: 'Clonar este subgrupo' })}
          </button>
        )}
      </div>

      <div className="card-pad stack">
        <div className="row">
          <Search value={query} onChange={setQuery} placeholder={tx({ en: 'Filter subgroups and projects…', pt: 'Filtrar subgrupos e projetos…' })} width={280} />
          <label className="row" style={{ fontSize: 13, ['--gap' as string]: '6px' }} title={tx({ en: 'Shows archived projects and includes them in the subgroup clone', pt: 'Mostra e inclui no clone de subgrupo os projetos arquivados' })}>
            <button className="switch" role="switch" aria-checked={archived} onClick={() => setArchived(v => !v)} aria-label={tx({ en: 'Include archived', pt: 'Incluir arquivados' })} />
            {tx({ en: 'Include archived', pt: 'Incluir arquivados' })}
          </label>
          <div className="spacer" />
          <span className="muted mono" style={{ fontSize: 12 }}>{tx({ en: 'destination:', pt: 'destino:' })} {show(listing.data?.dest ?? source.workspace)}</span>
        </div>

        <Async
          state={listing}
          isEmpty={d => d.groups.length === 0 && d.projects.length === 0}
          skeleton={<SkeletonRows rows={5} height={46} />}
          empty={<Empty icon={Folder} title={tx({ en: 'Empty group', pt: 'Grupo vazio' })}>{tx({ en: 'This group has no subgroups or projects the token can see.', pt: 'Este grupo não tem subgrupos nem projetos que o token enxergue.' })}</Empty>}
        >
          {() => (
            <div className="repo-list">
              {groups.map(g => <GroupRow key={g.fullPath} g={g} show={show} below={below} onOpen={() => (setPath(g.fullPath), setQuery(''))} onClone={() => setConfirmGroup({ fullPath: g.fullPath, dest: g.dest })} />)}
              {projects.map(p => <ProjectRow key={p.fullPath} p={p} show={show} below={below} onClone={() => startClone(p.fullPath, 'project')} onOpen={() => open(p.fullPath)} />)}
              {groups.length + projects.length === 0 && (
                <Empty icon={FolderGit2} title={tx({ en: 'Nothing matches the filter', pt: 'Nada casa com o filtro' })} action={<button className="btn btn-sm" onClick={() => (setQuery(''), setArchived(true))}>{tx({ en: 'Clear filter and show archived', pt: 'Limpar filtro e mostrar arquivados' })}</button>} />
              )}
              {hiddenArchived > 0 && <div className="muted" style={{ fontSize: 12, padding: '8px 4px' }}><Archive size={12} /> {tx({ en: `${hiddenArchived} archived project(s) hidden. Turn on "Include archived" to see them.`, pt: `${hiddenArchived} projeto(s) arquivado(s) escondido(s). Ligue "Incluir arquivados" para ver.` })}</div>}
            </div>
          )}
        </Async>
      </div>

      {clone.run && <ClonePanel run={clone.run} show={show} onStop={clone.stop} onClose={clone.close} />}
      {confirmGroup && (
        <ConfirmModal
          title={tx({ en: 'Clone the whole subgroup?', pt: 'Clonar o subgrupo inteiro?' })}
          confirmLabel={tx({ en: 'Clone', pt: 'Clonar' })}
          icon={Download}
          onClose={() => setConfirmGroup(null)}
          onConfirm={() => startClone(confirmGroup.fullPath, 'group')}
        >
          {tx({
            en: <>Clones every project of <code className="inline">{confirmGroup.fullPath}</code> and its inner subgroups into{' '}
              <code className="inline">{show(confirmGroup.dest)}</code>, keeping the hierarchy. Already cloned ones are skipped, and folders with files are not touched.</>,
            pt: <>Clona todos os projetos de <code className="inline">{confirmGroup.fullPath}</code> e dos subgrupos internos para{' '}
              <code className="inline">{show(confirmGroup.dest)}</code>, mantendo a hierarquia. Os já clonados são pulados, e pastas com arquivos não são tocadas.</>,
          })}
          {!archived && tx({ en: ' Archived projects are left out.', pt: ' Projetos arquivados ficam de fora.' })}
        </ConfirmModal>
      )}
    </section>
  )
}

function GroupRow({ g, show, below, onOpen, onClone }: { g: Group; show: (p: string | null) => string; below: (p: string | null) => string; onOpen: () => void; onClone: () => void }) {
  const slug = g.fullPath.split('/').pop()!
  return (
    <div className="repo-row is-group" onClick={onOpen} title={tx({ en: `Open ${g.fullPath}`, pt: `Entrar em ${g.fullPath}` })}>
      <Folder size={16} />
      <div className="spacer stack" style={{ ['--gap' as string]: '2px', minWidth: 0 }}>
        <span className="row" style={{ ['--gap' as string]: '6px' }}>
          <b>{g.name}</b>
          {slug.toLowerCase() !== g.name.toLowerCase() && <code className="inline" title={tx({ en: 'The path is what becomes the folder', pt: 'O caminho é o que vira pasta' })}>{slug}</code>}
        </span>
        <span className="muted mono repo-dest" title={show(g.dest)}>→ {below(g.dest)}</span>
      </div>
      <div className="row" onClick={e => e.stopPropagation()} style={{ ['--gap' as string]: '4px' }}>
        <button className="btn btn-sm" onClick={onOpen}>{tx({ en: 'Open', pt: 'Abrir' })}</button>
        <button className="btn btn-sm" onClick={onClone} title={tx({ en: `Clones everything in ${g.fullPath}`, pt: `Clona tudo de ${g.fullPath}` })}><Download size={13} /> {tx({ en: 'Clone subgroup', pt: 'Clonar subgrupo' })}</button>
      </div>
    </div>
  )
}

function ProjectRow({ p, show, below, onClone, onOpen }: { p: Project; show: (p: string | null) => string; below: (p: string | null) => string; onClone: () => void; onOpen: () => void }) {
  const local = p.local ? LOCAL[p.local] : null
  return (
    <div className="repo-row">
      <FolderGit2 size={16} />
      <div className="spacer stack" style={{ ['--gap' as string]: '2px', minWidth: 0 }}>
        <span className="row" style={{ ['--gap' as string]: '6px' }}>
          <a href={p.webUrl} target="_blank" rel="noreferrer" title={tx({ en: 'Opens the project on the provider', pt: 'Abre o projeto no provedor' })}><b>{p.name}</b></a>
          {p.archived && <span className="badge">{tx({ en: 'archived', pt: 'arquivado' })}</span>}
          {local && <span className={`badge ${local.badge}`} title={local.title}>{local.label}</span>}
          {p.lastActivity && <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'activity', pt: 'atividade' })} {relTime(p.lastActivity)}</span>}
        </span>
        {p.description && <span className="muted repo-desc">{p.description}</span>}
        <span className="muted mono repo-dest" title={show(p.dest)}>→ {below(p.dest)}</span>
      </div>
      {p.local === 'cloned' ? (
        <button className="btn btn-sm" onClick={onOpen} title={tx({ en: `Opens ${show(p.dest)} in the editor`, pt: `Abre ${show(p.dest)} no editor` })}><Code2 size={13} /> {tx({ en: 'Open in editor', pt: 'Abrir no editor' })}</button>
      ) : (
        <button className="btn btn-sm" onClick={onClone} disabled={!p.dest || p.local === 'occupied'} title={p.local === 'occupied' ? LOCAL.occupied.title : tx({ en: `Clones into ${show(p.dest)}`, pt: `Clona em ${show(p.dest)}` })}>
          <Download size={13} /> {tx({ en: 'Clone', pt: 'Clonar' })}
        </button>
      )}
    </div>
  )
}
