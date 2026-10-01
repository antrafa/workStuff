import { ArrowDownUp, Boxes, Info, RotateCcw, ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Async, Chips, Empty, Meter, Search, SkeletonRows } from '@/ui'
import { pct, relTime } from '@/lib/format'
import { RestartModal } from './RestartModal'
import { canWrite, type Environment, type Pod } from './api'

type State = { data: Pod[] | null; error: string | null; loading: boolean; reload: () => void }
type Props = {
  state: State
  env: Environment | null
  metricsUnavailable: boolean
  namespace: string
  onNamespace: (ns: string) => void
  namespaces: { namespaces: string[]; limitedRbac: boolean } | null
  onOpen: (p: Pod) => void
  onLogs: (p: Pod) => void
}
type Filter = 'todos' | 'running' | 'pending' | 'problema'
type SortKey = 'name' | 'mem' | 'restarts' | 'uptime'

const HEALTH_DOT = { ok: 'dot-ok', warning: 'dot-warn', critical: 'dot-crit' }

export function restartTitle(env: Environment | null, p: Pod) {
  if (!canWrite(env)) return env === 'PRO' ? 'Reinício bloqueado: PRO é somente leitura' : 'Reinício bloqueado: classifique o kubeconfig como DES, ITG ou HML'
  if (!p.workload) return 'Pod sem Deployment/StatefulSet/DaemonSet: não há o que reiniciar'
  return `Reinicia o ${p.workload.kind} ${p.workload.name}`
}

// RBAC limitado: sem lista de namespaces, o usuário digita o que quer ver.
function NamespaceControl({ namespace, onNamespace, namespaces, forceInput }: Pick<Props, 'namespace' | 'onNamespace' | 'namespaces'> & { forceInput: boolean }) {
  const [typed, setTyped] = useState(namespace)
  if (forceInput || namespaces?.limitedRbac || (namespaces && namespaces.namespaces.length === 0)) {
    return (
      <form className="row" style={{ ['--gap' as string]: '4px' }} onSubmit={e => (e.preventDefault(), onNamespace(typed.trim()))}>
        <input className="input mono" style={{ width: 200 }} placeholder="namespace" value={typed} onChange={e => setTyped(e.target.value)} title="O RBAC não lista namespaces: digite o nome" />
        <button className="btn btn-sm" type="submit">Ver</button>
      </form>
    )
  }
  return (
    <select className="select" value={namespace} onChange={e => onNamespace(e.target.value)} title="Filtra por namespace (consulta o cluster só nele)">
      <option value="">todos os namespaces</option>
      {namespaces?.namespaces.map(n => <option key={n}>{n}</option>)}
    </select>
  )
}

export function PodsTable({ state, env, metricsUnavailable, namespace, onNamespace, namespaces, onOpen, onLogs }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'restarts', desc: true })
  const [restarting, setRestarting] = useState<Pod | null>(null)

  const all = state.data ?? []
  const needsNamespace = Boolean(state.error?.includes('escolha um namespace'))
  const scoped = all.filter(p => p.name.includes(query.trim()))
  const counts = {
    todos: scoped.length,
    running: scoped.filter(p => p.status === 'Running').length,
    pending: scoped.filter(p => p.status === 'Pending').length,
    problema: scoped.filter(p => p.health.level !== 'ok').length,
  }

  const rows = useMemo(() => {
    const filtered = scoped.filter(p => {
      if (filter === 'running') return p.status === 'Running'
      if (filter === 'pending') return p.status === 'Pending'
      if (filter === 'problema') return p.health.level !== 'ok'
      return true
    })
    const value = (p: Pod) =>
      sort.key === 'name' ? p.name
        : sort.key === 'mem' ? pct(p.memUsageMi ?? 0, p.memLimitMi)
        : sort.key === 'restarts' ? p.restartCount
        : -new Date(p.startTime).getTime()
    return [...filtered].sort((a, b) => {
      const r = value(a) > value(b) ? 1 : value(a) < value(b) ? -1 : 0
      return sort.desc ? -r : r
    })
  }, [scoped, filter, sort])

  const sortBy = (key: SortKey) => setSort(s => ({ key, desc: s.key === key ? !s.desc : true }))
  const th = (key: SortKey, label: string, className = '') => (
    <th className={`sortable ${className}`} onClick={() => sortBy(key)} title={`Ordenar por ${label.toLowerCase()}`}>
      {label} {sort.key === key && <ArrowDownUp size={10} />}
    </th>
  )

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <div className="card-title">Pods</div>
        <NamespaceControl namespace={namespace} onNamespace={onNamespace} namespaces={namespaces} forceInput={needsNamespace} />
        <Search value={query} onChange={setQuery} placeholder="Buscar pod por nome…" width={220} />
        <div className="spacer" />
        <span className="mono muted" style={{ fontSize: 12 }}>
          {rows.length} / {all.length} pods
        </span>
        {metricsUnavailable && <span className="badge badge-warn" title="Sem metrics-server (ou sem permissão): a coluna de memória mostra só o limite">sem métricas</span>}
      </div>
      <div style={{ padding: '10px 16px 0' }}>
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'todos', label: 'Todos', count: counts.todos },
            { id: 'running', label: 'Running', count: counts.running },
            { id: 'pending', label: 'Pending', count: counts.pending },
            { id: 'problema', label: 'Com problema', count: counts.problema },
          ]}
        />
      </div>
      {needsNamespace && (
        <div className="callout callout-info" style={{ margin: '12px 16px 0' }}>
          <Info size={16} /> O RBAC deste usuário não lista pods de todos os namespaces. Digite um namespace acima para ver os pods dele.
        </div>
      )}
      <Async
        state={needsNamespace ? { ...state, error: null, data: [] } : state}
        isEmpty={d => d.length === 0}
        empty={needsNamespace ? null : <Empty icon={Boxes} title="Nenhum pod encontrado">O namespace selecionado não tem pods, ou o RBAC não permite listá-los.</Empty>}
        skeleton={<div style={{ padding: 16 }}><SkeletonRows rows={6} height={40} /></div>}
      >
        {() =>
          rows.length === 0 ? (
            <Empty icon={Boxes} title="Nada casa com o filtro" action={<button className="btn btn-sm" onClick={() => (setQuery(''), setFilter('todos'))}>Limpar filtros</button>} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {th('name', 'Pod')}
                    <th>Node</th>
                    {th('uptime', 'Uptime')}
                    {th('mem', 'Memória')}
                    {th('restarts', 'Restarts', 'num')}
                    <th>Motivo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(p => (
                    <tr key={`${p.namespace}/${p.name}`} className="clickable" onClick={() => onOpen(p)}>
                      <td>
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          <span className={`dot ${HEALTH_DOT[p.health.level]}`} />
                          <div style={{ minWidth: 0 }}>
                            <div className="mono pod-name">{p.name}</div>
                            <div className="muted" style={{ fontSize: 11.5 }}>
                              {p.namespace} · {p.status} · <span className="mono">{p.imageTag}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="mono muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{p.nodeName}</td>
                      <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{relTime(p.startTime).replace('há ', '')}</td>
                      <td style={{ minWidth: 130 }}>
                        {p.memUsageMi === null ? (
                          <span className="muted">—</span>
                        ) : (
                          <div className="stack" style={{ ['--gap' as string]: '4px' }}>
                            <span className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                              {p.memUsageMi}Mi <span className="muted">/ {p.memLimitMi ? `${p.memLimitMi}Mi` : 'sem limite'}</span>
                            </span>
                            {p.memLimitMi > 0 && <Meter percent={pct(p.memUsageMi, p.memLimitMi)} />}
                          </div>
                        )}
                      </td>
                      <td className="num">{p.restartCount > 0 ? <b style={{ color: p.restartCount > 5 ? 'var(--crit)' : 'var(--warn)' }}>{p.restartCount}</b> : 0}</td>
                      <td style={{ fontSize: 12, minWidth: 180 }}>{p.health.reasons.join(' · ') || <span className="muted">—</span>}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="row" style={{ flexWrap: 'nowrap', ['--gap' as string]: '4px' }}>
                          <button className="btn btn-sm" onClick={() => onLogs(p)} title="Abre os logs deste pod no painel inferior">
                            <ScrollText size={13} /> Logs
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={!canWrite(env) || !p.workload}
                            onClick={() => setRestarting(p)}
                            title={restartTitle(env, p)}
                          >
                            <RotateCcw size={13} /> Reiniciar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Async>
      {restarting && <RestartModal pod={restarting} env={env} onDone={state.reload} onClose={() => setRestarting(null)} />}
    </section>
  )
}

