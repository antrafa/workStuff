import { AlertTriangle, ArrowDownUp, ExternalLink, FileCode2, FileSearch, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Async, Empty, Meter, Modal, Search, SkeletonRows, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { fetchLink, fetchLive, fetchManifest, fetchStack, type Live, type LiveService, type ResourceService, type ResourceStack } from './api'
import { NamespaceLinkBar } from './NamespaceLink'
import { tx } from '@/lib/i18n'

type SortKey = 'service' | 'memReq' | 'memLim' | 'cpuReq' | 'live'

const REC_BADGE = { critical: 'badge-crit', warn: 'badge-warn', info: 'badge-info', ok: 'badge-ok' }

const FILTER_ON = tx({ en: 'filter on · click to clear', pt: 'filtro ativo · clique para limpar' })
const formatMi = (mi: number) => (mi >= 1024 ? `${(mi / 1024).toFixed(1)} Gi` : `${mi} Mi`)
const unset = (s: ResourceService) => !s.memReq || !s.memLim

export function StackTable({ stack }: { stack: ResourceStack }) {
  const state = useAsync(() => fetchStack(stack.projectId), [stack.projectId])
  const [onlyUnset, setOnlyUnset] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'service', desc: false })
  const [selected, setSelected] = useState<string | null>(null)
  const [yaml, setYaml] = useState<ResourceService | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [onlyNearLimit, setOnlyNearLimit] = useState(false)
  const link = useAsync(() => fetchLink(stack.projectId), [stack.projectId])
  const [live, setLive] = useState<Live | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const toast = useToast()

  const readLive = () => {
    setReading(true)
    setLiveError(null)
    fetchLive(stack.projectId)
      .then(setLive)
      .catch(e => ((setLive(null), setLiveError((e as Error).message))))
      .finally(() => setReading(false))
  }
  useEffect(() => {
    setLive(null)
    if (link.data) readLive()
  }, [link.data])
  const liveOf = (s: ResourceService) => live?.services[s.service]
  const nearLimitCount = live ? Object.values(live.services).filter(v => (v?.pct ?? 0) > 85).length : 0

  const all = state.data?.services ?? []
  const unsetCount = all.filter(unset).length
  const hasCpu = all.some(s => s.cpuReq || s.cpuLim)
  const hasJava = all.some(s => s.xms || s.xmx || s.metaspace)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = all.filter(s => (!onlyUnset || unset(s)) && (!onlyNearLimit || (liveOf(s)?.pct ?? 0) > 85) && `${s.app} ${s.service}`.toLowerCase().includes(q))
    const value = (s: ResourceService) =>
      sort.key === 'service' ? s.service : sort.key === 'memReq' ? s.memReqMi ?? -1 : sort.key === 'memLim' ? s.memLimMi ?? -1 : sort.key === 'live' ? liveOf(s)?.pct ?? -1 : s.cpuReqMillis ?? -1
    return [...filtered].sort((a, b) => {
      const r = value(a) > value(b) ? 1 : value(a) < value(b) ? -1 : 0
      return sort.desc ? -r : r
    })
  }, [all, onlyUnset, onlyNearLimit, query, sort, live])

  const refresh = async () => {
    setRefreshing(true)
    try {
      state.setData(await fetchStack(stack.projectId, true))
    } catch (e) {
      toast(tx({ en: `${stack.name} not refreshed: ${(e as Error).message}`, pt: `Não atualizou ${stack.name}: ${(e as Error).message}` }))
    } finally {
      setRefreshing(false)
    }
  }

  const sortBy = (key: SortKey) => setSort(s => ({ key, desc: s.key === key ? !s.desc : key !== 'service' }))
  const th = (key: SortKey, label: string, className = '') => (
    <th className={`sortable ${className}`} onClick={() => sortBy(key)} title={tx({ en: `Sort by ${label}`, pt: `Ordenar por ${label}` })}>
      {label} {sort.key === key && <ArrowDownUp size={10} />}
    </th>
  )

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <div className="card-title">Stack {stack.name}</div>
        <a className="btn btn-ghost btn-sm" href={stack.projectUrl} target="_blank" rel="noreferrer" title={tx({ en: `Opens ${stack.projectUrl} (branch ${stack.defaultBranch})`, pt: `Abre ${stack.projectUrl} (branch ${stack.defaultBranch})` })}>
          <ExternalLink size={13} /> GitLab
        </a>
        <span className="mono muted" style={{ fontSize: 12 }}>{tx({ en: `${all.length} services`, pt: `${all.length} serviços` })} · {stack.defaultBranch}</span>
        <div className="spacer" />
        {state.data?.fetchedAt && <span className="muted" style={{ fontSize: 12 }} title={state.data.fetchedAt}>{tx({ en: 'read', pt: 'lido' })} {relTime(state.data.fetchedAt)}</span>}
        <button className="btn btn-sm" onClick={refresh} disabled={refreshing} title={tx({ en: "Reads this stack's manifests on GitLab again (may take a few seconds)", pt: 'Lê de novo os manifests desta stack no GitLab (pode levar alguns segundos)' })}>
          <RotateCw size={13} className={refreshing ? 'spin' : ''} /> {refreshing ? tx({ en: 'Reading manifests…', pt: 'Lendo manifests…' }) : tx({ en: 'Refresh', pt: 'Atualizar' })}
        </button>
      </div>

      <Async
        state={state}
        isEmpty={d => d.services.length === 0}
        skeleton={<div className="card-pad"><div className="muted" style={{ marginBottom: 10, fontSize: 12.5 }}>{tx({ en: "Reading the manifests on GitLab; a stack's first read takes a few seconds.", pt: 'Lendo os manifests no GitLab; a primeira leitura de uma stack leva alguns segundos.' })}</div><SkeletonRows rows={5} height={38} /></div>}
        empty={<Empty icon={FileSearch} title={tx({ en: 'No resource file found', pt: 'Nenhum arquivo de recurso encontrado' })}>{tx({ en: `No YAML of this stack declares a resources block or JVM flags on the ${stack.defaultBranch} branch.`, pt: `Nenhum YAML desta stack declara bloco resources ou flags da JVM na branch ${stack.defaultBranch}.` })}</Empty>}
      >
        {() => (
          <div className="card-pad stack">
            <div className="grid" style={{ ['--min' as string]: '170px' }}>
              <div className="stat"><span className="eyebrow">{tx({ en: 'Services', pt: 'Serviços' })}</span><b>{all.length}</b><small>{tx({ en: `on the ${stack.defaultBranch} branch`, pt: `na branch ${stack.defaultBranch}` })}</small></div>
              <div className="stat"><span className="eyebrow">Total mem req</span><b>{formatMi(all.reduce((t, s) => t + (s.memReqMi ?? 0), 0))}</b><small>{tx({ en: 'reserved on the cluster', pt: 'reservado no cluster' })}</small></div>
              <div className="stat"><span className="eyebrow">Total mem lim</span><b>{formatMi(all.reduce((t, s) => t + (s.memLimMi ?? 0), 0))}</b><small>{tx({ en: 'summed ceiling', pt: 'teto somado' })}</small></div>
              <button className="stat" aria-pressed={onlyUnset} onClick={() => setOnlyUnset(v => !v)} title={tx({ en: 'Shows only services with no Mem Req or Mem Lim in the manifest', pt: 'Mostra só os serviços sem Mem Req ou sem Mem Lim no manifest' })}>
                <span className="eyebrow">{tx({ en: 'No memory req/lim', pt: 'Sem req/lim de memória' })}</span>
                <b style={{ color: unsetCount ? 'var(--crit)' : undefined }}>{unsetCount}</b>
                <small>{onlyUnset ? FILTER_ON : tx({ en: 'click to filter', pt: 'clique para filtrar' })}</small>
              </button>
              {live && (
                <button className="stat" aria-pressed={onlyNearLimit} onClick={() => setOnlyNearLimit(v => !v)} title={tx({ en: 'Services whose pod uses more than 85% of the declared Mem Lim, right now', pt: 'Serviços cujo pod usa mais de 85% do Mem Lim declarado, neste momento' })}>
                  <span className="eyebrow">{tx({ en: 'Near the limit (live)', pt: 'Perto do limite (ao vivo)' })}</span>
                  <b style={{ color: nearLimitCount ? 'var(--crit)' : 'var(--ok)' }}>{nearLimitCount}</b>
                  <small>{onlyNearLimit ? FILTER_ON : tx({ en: `above 85% · read ${relTime(live.readAt)}`, pt: `acima de 85% · lido ${relTime(live.readAt)}` })}</small>
                </button>
              )}
            </div>

            {!!state.data?.failed?.length && (
              <div className="callout callout-warn" style={{ fontSize: 12.5 }}>
                <AlertTriangle size={15} />
                <span>
                  {tx({
                    en: <>GitLab did not deliver {state.data.failed.length} file(s) in this read, left out of the table:{' '}{state.data.failed.map(f => <code key={f} className="inline">{f}</code>)}. Click Refresh to try again.</>,
                    pt: <>O GitLab não entregou {state.data.failed.length} arquivo(s) nesta leitura, que ficaram de fora da tabela:{' '}{state.data.failed.map(f => <code key={f} className="inline">{f}</code>)}. Clique em Atualizar para tentar de novo.</>,
                  })}
                </span>
              </div>
            )}

            {!link.loading && (
              <NamespaceLinkBar projectId={stack.projectId} link={link.data} environment={live?.environment ?? null} onChange={link.reload} onReadNow={readLive} reading={reading} />
            )}
            {liveError && <div className="callout callout-crit" style={{ fontSize: 12.5 }}><AlertTriangle size={15} />{liveError}</div>}
            {live?.metricsUnavailable && <div className="callout callout-warn" style={{ fontSize: 12.5 }}><AlertTriangle size={15} />{tx({ en: 'The cluster has no metrics-server answering: no memory usage to compare.', pt: 'O cluster não tem metrics-server respondendo: sem uso de memória para comparar.' })}</div>}

            <div className="row">
              <Search value={query} onChange={setQuery} placeholder={tx({ en: 'Filter service…', pt: 'Filtrar serviço…' })} width={240} />
              <span className="mono muted" style={{ fontSize: 12 }}>{rows.length} / {all.length}</span>
            </div>

            {rows.length === 0 ? (
              <Empty icon={FileSearch} title={tx({ en: 'Nothing matches the filter', pt: 'Nada casa com o filtro' })} action={<button className="btn btn-sm" onClick={() => (setQuery(''), setOnlyUnset(false), setOnlyNearLimit(false))}>{tx({ en: 'Clear filters', pt: 'Limpar filtros' })}</button>} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>App</th>
                      {th('service', tx({ en: 'Service', pt: 'Serviço' }))}
                      {th('memReq', 'Mem req', 'num')}
                      {th('memLim', 'Mem lim', 'num')}
                      {live ? th('live', tx({ en: 'Live usage', pt: 'Uso ao vivo' })) : <th>Manifest</th>}
                      {live && <th>{tx({ en: 'Recommendation', pt: 'Recomendação' })}</th>}
                      {hasCpu && th('cpuReq', 'CPU req / lim', 'num')}
                      {hasJava && <th className="num">-Xms</th>}
                      {hasJava && <th className="num">-Xmx</th>}
                      {hasJava && <th className="num">{tx({ en: 'Metaspace / max', pt: 'Metaspace / máx' })}</th>}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(s => (
                      <tr key={s.path} className={`clickable ${selected === s.path ? 'res-selected' : ''}`} onClick={() => setSelected(s.path)} title={s.path}>
                        <td className="muted">{s.app || '—'}</td>
                        <td className="mono" style={{ fontSize: 12.5 }}>{s.service}</td>
                        <td className="num">{s.memReq ?? <span style={{ color: 'var(--crit)' }}>—</span>}</td>
                        <td className="num">{s.memLim ?? <span style={{ color: 'var(--crit)' }}>—</span>}</td>
                        {live ? <LiveCell usage={liveOf(s)} /> : (
                          <td>
                            {unset(s)
                              ? <span className="badge badge-warn" title={tx({ en: 'Mem Req/Lim not declared: set both so the cluster reserves and limits the memory', pt: 'Mem Req/Lim não declarados: defina os dois para o cluster reservar e limitar a memória' })}>{tx({ en: 'set', pt: 'definir' })}</span>
                              : <span className="badge badge-ok" title={tx({ en: 'Mem Req and Mem Lim declared', pt: 'Mem Req e Mem Lim declarados' })}>{tx({ en: 'declared', pt: 'declarado' })}</span>}
                          </td>
                        )}
                        {live && (
                          <td><RecommendationBadge rec={liveOf(s)?.recommendation ?? null} /></td>
                        )}
                        {hasCpu && <td className="num">{s.cpuReq ?? '—'} / {s.cpuLim ?? '—'}</td>}
                        {hasJava && <td className="num">{s.xms ?? '—'}</td>}
                        {hasJava && <td className="num">{s.xmx ?? '—'}</td>}
                        {hasJava && <td className="num">{s.metaspace ?? '—'} / {s.maxMetaspace ?? '—'}</td>}
                        <td onClick={e => e.stopPropagation()}>
                          <button className="btn btn-sm" onClick={() => setYaml(s)} title={tx({ en: `Shows ${s.path}`, pt: `Mostra ${s.path}` })}>
                            <FileCode2 size={13} /> {tx({ en: 'View YAML', pt: 'Ver YAML' })}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Async>

      {yaml && <ManifestModal stack={stack} service={yaml} onClose={() => setYaml(null)} />}
    </section>
  )
}

function RecommendationBadge({ rec }: { rec: LiveService['recommendation'] }) {
  if (!rec) return <span className="muted">—</span>
  return <span className={`badge ${REC_BADGE[rec.level]}`} title={rec.text}>{rec.badge}</span>
}

function LiveCell({ usage: u }: { usage: LiveService | undefined }) {
  if (!u || !u.replicas) return <td className="muted" title={tx({ en: 'no pod of this service in the linked namespace', pt: 'nenhum pod deste serviço no namespace vinculado' })}>{tx({ en: 'no pod', pt: 'sem pod' })}</td>
  if (u.usageMi === null) return <td className="muted" title={tx({ en: 'the pod exists, but metrics-server has no reading of it yet', pt: 'o pod existe, mas o metrics-server ainda não tem leitura dele' })}>{tx({ en: 'no metric', pt: 'sem métrica' })}</td>
  return (
    <td style={{ minWidth: 150 }} title={tx({ en: `${u.replicas} replica(s): ${u.pods.join(', ')}`, pt: `${u.replicas} réplica(s): ${u.pods.join(', ')}` })}>
      <div className="stack" style={{ ['--gap' as string]: '4px' }}>
        <span className="mono" style={{ fontSize: 12 }}>{formatMi(u.usageMi)}{u.pct !== null && <span className="muted"> · {u.pct}%</span>}</span>
        {u.pct !== null && <Meter percent={u.pct} />}
      </div>
    </td>
  )
}

function ManifestModal({ stack, service, onClose }: { stack: ResourceStack; service: ResourceService; onClose: () => void }) {
  const state = useAsync(() => fetchManifest(stack.projectId, service.path), [service.path])
  return (
    <Modal title={<span className="mono">{service.path}</span>} onClose={onClose} width={720}>
      <Async state={state} skeleton={<SkeletonRows rows={6} height={18} />}>
        {d => <pre className="code" style={{ maxHeight: '60vh' }}>{d.content}</pre>}
      </Async>
    </Modal>
  )
}
