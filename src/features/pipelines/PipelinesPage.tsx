import './pipelines.css'
import { ChevronDown, ChevronRight, ExternalLink, Plus, RotateCw, Trash2, Workflow } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import { Async, ConfirmModal, Empty, Page, SkeletonRows, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { usePolling } from '@/features/cluster/usePolling'
import { fetchSources } from '@/features/repos/api'
import { FollowModal } from './FollowModal'
import { PipelineDetail } from './PipelineDetail'
import { STATUS, duration, fetchWatches, removeWatch, type Watch } from './api'
import { tx } from '@/lib/i18n'

export default function PipelinesPage() {
  const watches = useAsync(fetchWatches)
  const sources = useAsync(fetchSources)
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Watch | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toast = useToast()
  usePolling(watches.reload, !adding)

  const list = watches.data ?? []
  const noSources = sources.data?.length === 0
  const toggleGroup = (key: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (!next.delete(key)) next.add(key)
    return next
  })

  const remove = async (w: Watch) => {
    try {
      await removeWatch(w.id)
      if (selected === w.id) setSelected(null)
      toast(tx({ en: `${w.fullPath} is no longer followed`, pt: `${w.fullPath} não é mais acompanhado` }))
      watches.reload()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Page
      title="Pipelines"
      hint={tx({
        en: 'Pipeline status of the projects you follow on GitLab CI and GitHub Actions. On a failed job, the AI reads the log and explains the cause.',
        pt: 'Status das esteiras dos projetos que você acompanha no GitLab CI e no GitHub Actions. No job que falhou, a IA lê o log e explica a causa.',
      })}
      actions={
        <>
          <button className="btn" onClick={watches.reload} title={tx({ en: 'Refreshes now; the screen also refreshes on its own every 30s', pt: 'Atualiza agora; a tela também atualiza sozinha a cada 30s' })}>
            <RotateCw size={14} className={watches.loading ? 'spin' : ''} /> {tx({ en: 'Refresh', pt: 'Atualizar' })}
          </button>
          {!noSources && <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={14} /> {tx({ en: 'Follow project', pt: 'Acompanhar projeto' })}</button>}
        </>
      }
    >
      {noSources ? (
        <div className="card">
          <Empty icon={Workflow} title={tx({ en: 'No connection to GitLab or GitHub', pt: 'Nenhuma conexão com GitLab ou GitHub' })} action={<Link className="btn btn-primary" to="/repositorios">{tx({ en: 'Create connection', pt: 'Criar conexão' })}</Link>}>
            {tx({ en: 'Pipelines use the connections and tokens of the Repositories screen.', pt: 'As pipelines usam as conexões e os tokens da tela Repositórios.' })}
          </Empty>
        </div>
      ) : (
        <Async
          state={watches}
          isEmpty={d => d.length === 0}
          skeleton={<SkeletonRows rows={3} height={48} />}
          empty={
            <div className="card">
              <Empty icon={Workflow} title={tx({ en: 'No project followed', pt: 'Nenhum projeto acompanhado' })} action={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={14} /> {tx({ en: 'Follow project', pt: 'Acompanhar projeto' })}</button>}>
                {tx({ en: 'Choose the projects whose pipeline you want to see here.', pt: 'Escolha os projetos cuja esteira você quer ver aqui.' })}
              </Empty>
            </div>
          }
        >
          {data => (
            <section className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{tx({ en: 'Project', pt: 'Projeto' })}</th>
                      <th>{tx({ en: 'Latest pipeline', pt: 'Última pipeline' })}</th>
                      <th>Branch</th>
                      <th>{tx({ en: 'When', pt: 'Quando' })}</th>
                      <th className="num">{tx({ en: 'Duration', pt: 'Duração' })}</th>
                      <th />
                    </tr>
                  </thead>
                  {groupByParent(data).map(g => {
                    const open = expanded.has(g.key)
                    return (
                      <tbody key={g.key}>
                        <tr className="pl-group" onClick={() => toggleGroup(g.key)} aria-expanded={open}>
                          <td colSpan={6}>
                            <span className="row" style={{ ['--gap' as string]: '8px' }}>
                              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span className="pl-group-name">{g.name}</span>
                              <span className="badge">{g.watches.length}</span>
                              <GroupHealth watches={g.watches} />
                              <span className="spacer" />
                              <span className="muted" title={g.parent}>{g.sourceLabel ?? tx({ en: 'connection removed', pt: 'conexão removida' })}</span>
                            </span>
                          </td>
                        </tr>
                        {open && g.watches.map(w => (
                          <Fragment key={w.id}>
                            <WatchRow watch={w} selected={w.id === selected} onSelect={() => setSelected(w.id === selected ? null : w.id)} onRemove={() => setRemoving(w)} />
                            {w.id === selected && !w.error && (
                              <tr className="pl-detail"><td colSpan={6}><PipelineDetail watch={w} /></td></tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    )
                  })}
                </table>
              </div>
            </section>
          )}
        </Async>
      )}

      {adding && <FollowModal sources={sources.data ?? []} watches={list} onClose={() => setAdding(false)} onAdded={() => (setAdding(false), watches.reload())} />}
      {removing && (
        <ConfirmModal title={tx({ en: 'Stop following', pt: 'Parar de acompanhar' })} confirmLabel={tx({ en: 'Stop following', pt: 'Parar de acompanhar' })} icon={Trash2} onConfirm={() => remove(removing)} onClose={() => setRemoving(null)}>
          <p>{tx({
            en: `${removing.fullPath} leaves this list. Nothing changes on ${removing.provider === 'github' ? 'GitHub' : 'GitLab'}.`,
            pt: `${removing.fullPath} sai desta lista. Nada muda no ${removing.provider === 'github' ? 'GitHub' : 'GitLab'}.`,
          })}</p>
        </ConfirmModal>
      )}
    </Page>
  )
}

type RowProps = { watch: Watch; selected: boolean; onSelect: () => void; onRemove: () => void }

function WatchRow({ watch: w, selected, onSelect, onRemove }: RowProps) {
  const p = w.latest
  return (
    <tr className={`pl-row${selected ? ' pl-selected' : ''}`} onClick={w.error ? undefined : onSelect}>
      <td>
        <div className="mono" title={w.fullPath}>{w.fullPath.split('/').pop()}</div>
      </td>
      {w.error ? (
        <td colSpan={4}><span className="badge badge-crit">{tx({ en: 'error', pt: 'erro' })}</span> <span className="muted" style={{ fontSize: 12.5 }}>{w.error}</span></td>
      ) : p ? (
        <>
          <td><span className={`badge ${STATUS[p.status].badge}`}>{STATUS[p.status].label}</span></td>
          <td className="mono">{p.ref}</td>
          <td className="muted">{relTime(p.createdAt)}</td>
          <td className="num mono">{duration(p.durationSec)}</td>
        </>
      ) : (
        <td colSpan={4} className="muted">{tx({ en: 'no pipeline yet', pt: 'nenhuma pipeline ainda' })}</td>
      )}
      <td className="num" onClick={e => e.stopPropagation()}>
        <div className="row" style={{ ['--gap' as string]: '4px', justifyContent: 'flex-end' }}>
          {p && <a className="btn btn-ghost btn-sm btn-icon" href={p.webUrl} target="_blank" rel="noreferrer" title={tx({ en: 'Open the pipeline in the browser', pt: 'Abrir a pipeline no navegador' })}><ExternalLink size={14} /></a>}
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onRemove} title={tx({ en: 'Stop following', pt: 'Parar de acompanhar' })}><Trash2 size={14} /></button>
        </div>
      </td>
    </tr>
  )
}

type WatchGroup = { key: string; name: string; parent: string; sourceLabel: string | null; watches: Watch[] }

// Projects of the same parent group (e.g. ".../environments/team-a") side by side, groups and
// projects in name order.
function groupByParent(watches: Watch[]): WatchGroup[] {
  const groups = new Map<string, WatchGroup>()
  for (const w of watches) {
    const parent = w.fullPath.split('/').slice(0, -1).join('/')
    const key = `${w.sourceId}|${parent}`
    const g = groups.get(key) ?? { key, name: parent.split('/').pop() ?? parent, parent, sourceLabel: w.sourceLabel, watches: [] }
    g.watches.push(w)
    groups.set(key, g)
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
  for (const g of groups.values()) g.watches.sort((a, b) => byName(a.fullPath, b.fullPath))
  return [...groups.values()].sort((a, b) => byName(a.name, b.name) || byName(a.parent, b.parent))
}

// A collapsed group still says whether something inside it broke.
function GroupHealth({ watches }: { watches: Watch[] }) {
  const failed = watches.filter(w => w.error || w.latest?.status === 'failed').length
  const running = watches.filter(w => w.latest?.status === 'running' || w.latest?.status === 'pending').length
  return (
    <>
      {failed > 0 && <span className="badge badge-crit">{tx({ en: `${failed} failed`, pt: `${failed} com falha` })}</span>}
      {running > 0 && <span className="badge badge-info">{tx({ en: `${running} running`, pt: `${running} rodando` })}</span>}
    </>
  )
}
