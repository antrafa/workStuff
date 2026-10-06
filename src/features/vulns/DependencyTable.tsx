import { ChevronDown, ChevronRight, ExternalLink, ShieldCheck } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Empty, Search, Segmented } from '@/ui'
import { SEVERITIES, SEVERITY_BADGE, SEVERITY_LABEL, bySeverity, worst, type Dependency } from './api'
import { tx } from '@/lib/i18n'

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
            { id: 'falhas', label: tx({ en: `With flaws (${withAdvisories})`, pt: `Com falhas (${withAdvisories})` }) },
            { id: 'desatualizadas', label: tx({ en: `Outdated (${outdated})`, pt: `Desatualizadas (${outdated})` }) },
            { id: 'todas', label: tx({ en: `All (${dependencies.length})`, pt: `Todas (${dependencies.length})` }) },
          ]}
        />
        <div className="spacer" />
        <Search value={query} onChange={setQuery} placeholder={tx({ en: 'Filter by name', pt: 'Filtrar por nome' })} />
      </div>
      {rows.length === 0 ? (
        <Empty icon={ShieldCheck} title={view === 'falhas' ? tx({ en: 'No known flaw', pt: 'Nenhuma falha conhecida' }) : tx({ en: 'Nothing here', pt: 'Nada aqui' })}>
          {view === 'falhas'
            ? tx({ en: 'No dependency with an exact version has a flaw registered in OSV.', pt: 'Nenhuma dependência com versão exata tem falha registrada na OSV.' })
            : tx({ en: 'No dependency in this filter.', pt: 'Nenhuma dependência neste filtro.' })}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{tx({ en: 'Dependency', pt: 'Dependência' })}</th>
                <th>{tx({ en: 'Version', pt: 'Versão' })}</th>
                <th>{tx({ en: 'Latest', pt: 'Última' })}</th>
                <th>{tx({ en: 'Flaws', pt: 'Falhas' })}</th>
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
                        {d.version ?? <span className="muted" title={tx({ en: 'No exact version: not queried', pt: 'Sem versão exata: não consultada' })}>{d.declared}</span>}
                      </td>
                      <td className="mono">
                        {d.latest ?? <span className="muted" title={tx({ en: 'Not in the public registry (private or down)', pt: 'Não está no registry público (privado ou fora do ar)' })}>—</span>}
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
                                <span className={`badge ${SEVERITY_BADGE[a.severity]}`}>{SEVERITY_LABEL[a.severity]}</span>
                                <div className="spacer">
                                  <div>{a.summary || tx({ en: 'no summary', pt: 'sem resumo' })}</div>
                                  <div className="muted mono" style={{ fontSize: 11.5 }}>
                                    {[a.id, ...a.aliases.slice(0, 2)].join(' · ')}
                                    {a.fixedIn.length > 0 && <> · {tx({ en: 'fixed in', pt: 'corrigido em' })} {a.fixedIn.slice(0, 4).join(', ')}</>}
                                  </div>
                                </div>
                                <a className="btn btn-ghost btn-sm btn-icon" href={a.url} target="_blank" rel="noreferrer" title={tx({ en: 'Open in OSV', pt: 'Abrir na OSV' })}><ExternalLink size={13} /></a>
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
  if (!dependency.version) return <span className="muted">{tx({ en: 'not queried', pt: 'não consultada' })}</span>
  if (!dependency.advisories.length) return <span className="muted">{tx({ en: 'none', pt: 'nenhuma' })}</span>
  return (
    <div className="row" style={{ ['--gap' as string]: '4px' }}>
      {SEVERITIES.map(s => {
        const n = dependency.advisories.filter(a => a.severity === s).length
        return n ? <span key={s} className={`badge ${SEVERITY_BADGE[s]}`}>{n} {SEVERITY_LABEL[s]}</span> : null
      })}
    </div>
  )
}
