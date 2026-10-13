import '@/features/repos/repos.css'
import { ChevronRight, Folder, FolderGit2, Home } from 'lucide-react'
import { useState } from 'react'
import { Async, Empty, Modal, Search, Segmented, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { browse, pathFromInput, type Source } from '@/features/repos/api'
import { addWatch, type Watch } from './api'
import { tx } from '@/lib/i18n'

type Mode = 'browse' | 'address'
type Props = { sources: Source[]; watches: Watch[]; onClose: () => void; onAdded: () => void }

// A pasted URL names its host: pick the connection on that host, so the user does not have to.
const sourceForUrl = (sources: Source[], raw: string) => {
  const m = raw.trim().match(/^https?:\/\/[^/]+/)
  return m ? sources.find(s => s.url.replace(/\/+$/, '') === m[0]) : undefined
}

export function FollowModal({ sources, watches, onClose, onAdded }: Props) {
  const [mode, setMode] = useState<Mode>('browse')
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '')
  const [raw, setRaw] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const source = sources.find(s => s.id === sourceId)
  const fullPath = pathFromInput(raw)
  const example = source?.provider === 'github'
    ? tx({ en: 'owner/repository or the repository URL', pt: 'dono/repositorio ou a URL do repositório' })
    : tx({ en: `${source?.basePath || 'group'}/project or the project URL`, pt: `${source?.basePath || 'grupo'}/projeto ou a URL do projeto` })

  const follow = async (path: string) => {
    setSaving(path)
    setError(null)
    try {
      await addWatch(sourceId, path)
      onAdded()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  const typed = (value: string) => {
    setRaw(value)
    const match = sourceForUrl(sources, value)
    if (match) setSourceId(match.id)
  }

  return (
    <Modal
      title={tx({ en: 'Follow project', pt: 'Acompanhar projeto' })}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{tx({ en: 'Cancel', pt: 'Cancelar' })}</button>
          {mode === 'address' && (
            <button className="btn btn-primary" disabled={!sourceId || !fullPath || !!saving} onClick={() => follow(fullPath)}>
              {saving ? tx({ en: 'Checking…', pt: 'Conferindo…' }) : tx({ en: 'Follow', pt: 'Acompanhar' })}
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        <Segmented<Mode> value={mode} onChange={m => (setMode(m), setError(null))} options={[
          { id: 'browse', label: tx({ en: 'Browse groups', pt: 'Navegar pelos grupos' }) },
          { id: 'address', label: tx({ en: 'Paste address', pt: 'Colar endereço' }) },
        ]} />
        <label className="field">
          <span>{tx({ en: 'Connection', pt: 'Conexão' })}</span>
          <select className="select" value={sourceId} onChange={e => setSourceId(e.target.value)}>
            {sources.map(s => <option key={s.id} value={s.id}>{s.label} ({s.url})</option>)}
          </select>
        </label>
        {mode === 'address' ? (
          <label className="field">
            <span>{tx({ en: 'Project', pt: 'Projeto' })}</span>
            <input className="input mono" value={raw} onChange={e => typed(e.target.value)} onKeyDown={e => e.key === 'Enter' && fullPath && follow(fullPath)} placeholder={example} autoFocus />
            <small>
              {raw.trim() && fullPath !== raw.trim()
                ? <>{tx({ en: 'Will follow', pt: 'Vai acompanhar' })} <code className="inline">{fullPath}</code></>
                : tx({ en: "Full path or the project's URL. The panel checks that it exists before saving.", pt: 'Caminho completo ou a URL do projeto. O painel confere que ele existe antes de salvar.' })}
            </small>
          </label>
        ) : (
          source && <Picker key={source.id} source={source} followed={new Set(watches.filter(w => w.sourceId === source.id).map(w => w.fullPath))} saving={saving} onFollow={follow} />
        )}
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
      </div>
    </Modal>
  )
}

type PickerProps = { source: Source; followed: Set<string>; saving: string | null; onFollow: (fullPath: string) => void }

// Group tree of the connection, starting at its base group, as in the Repositories screen.
function Picker({ source, followed, saving, onFollow }: PickerProps) {
  const base = source.basePath
  const [path, setPath] = useState(base)
  const [query, setQuery] = useState('')
  const listing = useAsync(() => browse(source.id, path), [source.id, path])

  const q = query.trim().toLowerCase()
  const match = (x: { name: string; fullPath: string }) => !q || `${x.name} ${x.fullPath}`.toLowerCase().includes(q)
  const groups = (listing.data?.groups ?? []).filter(match)
  const projects = (listing.data?.projects ?? []).filter(p => !p.archived && match(p))
  const rel = path === base ? '' : base ? path.slice(base.length + 1) : path
  const crumbs = rel ? rel.split('/') : []
  const enter = (p: string) => (setPath(p), setQuery(''))

  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <nav className="crumbs repo-crumbs" aria-label={tx({ en: 'Path on the provider', pt: 'Caminho no provedor' })}>
        <button onClick={() => enter(base)}><Home size={13} /> {base ? base.split('/').pop() : tx({ en: 'root', pt: 'raiz' })}</button>
        {crumbs.map((c, i) => (
          <span key={i} className="row" style={{ ['--gap' as string]: '4px' }}>
            <ChevronRight size={12} />
            <button onClick={() => enter([base, ...crumbs.slice(0, i + 1)].filter(Boolean).join('/'))}>{c}</button>
          </span>
        ))}
      </nav>
      <Search value={query} onChange={setQuery} placeholder={tx({ en: 'Filter this group…', pt: 'Filtrar este grupo…' })} />
      <Async
        state={listing}
        isEmpty={d => d.groups.length === 0 && d.projects.length === 0}
        skeleton={<SkeletonRows rows={5} height={36} />}
        empty={<Empty icon={Folder} title={tx({ en: 'Empty group', pt: 'Grupo vazio' })} />}
      >
        {() => (
          <div className="repo-list pl-pick">
            {groups.map(g => (
              <button key={g.fullPath} className="repo-row is-group pl-pick-group" onClick={() => enter(g.fullPath)} title={g.fullPath}>
                <Folder size={15} /> <b className="spacer">{g.name}</b> <ChevronRight size={14} />
              </button>
            ))}
            {projects.map(p => (
              <div key={p.fullPath} className="repo-row" title={p.fullPath}>
                <FolderGit2 size={15} /> <span className="spacer">{p.name}</span>
                {followed.has(p.fullPath)
                  ? <span className="badge badge-ok">{tx({ en: 'followed', pt: 'acompanhado' })}</span>
                  : <button className="btn btn-sm btn-primary" disabled={!!saving} onClick={() => onFollow(p.fullPath)}>
                      {saving === p.fullPath ? tx({ en: 'Checking…', pt: 'Conferindo…' }) : tx({ en: 'Follow', pt: 'Acompanhar' })}
                    </button>}
              </div>
            ))}
            {groups.length + projects.length === 0 && <p className="muted" style={{ fontSize: 12.5, padding: 8 }}>{tx({ en: 'Nothing matches the filter.', pt: 'Nada casa com o filtro.' })}</p>}
          </div>
        )}
      </Async>
    </div>
  )
}
