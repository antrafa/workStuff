import { ChevronDown, ChevronRight, ExternalLink, ShieldCheck } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Empty, Search, Segmented } from '@/ui'
import { SEVERITIES, SEVERITY_BADGE, bySeverity, worst, type Dependency } from './api'

type View = 'falhas' | 'desatualizadas' | 'todas'

export function DependencyTable({ dependencies }: { dependencies: Dependency[] }) {
  const withAdvisories = dependencies.filter(d => d.advisories.length).length
  const outdated = dependencies.filter(d => (d.majorsBehind ?? 0) > 0).length
  const [view, setView] = useState<View>(withAdvisories ? 'falhas' : 'todas')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const rows = dependencies
    .filter(d => (view === 'falhas' ? d.advisories.length > 0 : view === 'desatualizadas' ? (d.majorsBehind ?? 0) > 0 : true))
    .filter(d => d.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => worst(a) - worst(b) || b.advisories.length - a.advisories.length || a.name.localeCompare(b.name))

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { id: 'falhas', label: `Com falhas (${withAdvisories})` },
            { id: 'desatualizadas', label: `Desatualizadas (${outdated})` },
            { id: 'todas', label: `Todas (${dependencies.length})` },
          ]}
        />
        <div className="spacer" />
        <Search value={query} onChange={setQuery} placeholder="Filtrar por nome" />
      </div>
      {rows.length === 0 ? (
        <Empty icon={ShieldCheck} title={view === 'falhas' ? 'Nenhuma falha conhecida' : 'Nada aqui'}>
          {view === 'falhas' ? 'Nenhuma dependência com versão exata tem falha registrada na OSV.' : 'Nenhuma dependência neste filtro.'}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dependência</th>
                <th>Versão</th>
                <th>Última</th>
                <th>Falhas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(d => {
                const key = `${d.file}|${d.name}`
                const expanded = open === key
                return (
                  <Fragment key={key}>
                    <tr className={d.advisories.length ? 'vu-row' : ''} onClick={() => d.advisories.length && setOpen(expanded ? null : key)}>
                      <td>
                        <div className="row" style={{ ['--gap' as string]: '6px' }}>
                          {d.advisories.length > 0 && (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                          <span className="mono">{d.name}</span>
                          {d.dev && <span className="badge">{d.ecosystem === 'Maven' ? 'test' : 'dev'}</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 11.5 }}>{d.ecosystem} · {d.file}</div>
                      </td>
                      <td className="mono">
                        {d.version ?? <span className="muted" title="Sem versão exata: não consultada">{d.declared}</span>}
                      </td>
                      <td className="mono">
                        {d.latest ?? <span className="muted" title="Não está no registry público (privado ou fora do ar)">—</span>}
                        {(d.majorsBehind ?? 0) > 0 && <span className="badge badge-warn" style={{ marginLeft: 6 }}>{d.majorsBehind} major</span>}
                      </td>
                      <td><SeverityCounts dependency={d} /></td>
                    </tr>
                    {expanded && (
                      <tr className="vu-detail">
                        <td colSpan={4}>
                          <div className="stack" style={{ ['--gap' as string]: '8px' }}>
                            {[...d.advisories].sort(bySeverity).map(a => (
                              <div key={a.id} className="vu-advisory">
                                <span className={`badge ${SEVERITY_BADGE[a.severity]}`}>{a.severity}</span>
                                <div className="spacer">
                                  <div>{a.summary || 'sem resumo'}</div>
                                  <div className="muted mono" style={{ fontSize: 11.5 }}>
                                    {[a.id, ...a.aliases.slice(0, 2)].join(' · ')}
                                    {a.fixedIn.length > 0 && <> · corrigido em {a.fixedIn.slice(0, 4).join(', ')}</>}
                                  </div>
                                </div>
                                <a className="btn btn-ghost btn-sm btn-icon" href={a.url} target="_blank" rel="noreferrer" title="Abrir na OSV"><ExternalLink size={13} /></a>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function SeverityCounts({ dependency }: { dependency: Dependency }) {
  if (!dependency.version) return <span className="muted">não consultada</span>
  if (!dependency.advisories.length) return <span className="muted">nenhuma</span>
  return (
    <div className="row" style={{ ['--gap' as string]: '4px' }}>
      {SEVERITIES.map(s => {
        const n = dependency.advisories.filter(a => a.severity === s).length
        return n ? <span key={s} className={`badge ${SEVERITY_BADGE[s]}`}>{n} {s}</span> : null
      })}
    </div>
  )
}
