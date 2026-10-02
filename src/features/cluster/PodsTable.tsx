import { ArrowDownUp, Boxes, ChevronRight, Info, Sparkles } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { AiStream, Async, Chips, Empty, Meter, Search, SkeletonRows } from '@/ui'
import { pct, relTime } from '@/lib/format'
import { LogsDock } from './LogsDock'
import { RestartModal } from './RestartModal'
import { canWrite, diagnosePod, type DiagnoseEvent, type Environment, type HealthLevel, type Pod } from './api'

type State = { data: Pod[] | null; error: string | null; loading: boolean; reload: () => void }
type Props = {
  state: State
  env: Environment | null
  metricsUnavailable: boolean
  namespace: string
  onNamespace: (ns: string) => void
  namespaces: { namespaces: string[]; limitedRbac: boolean } | null
  onOpen: (p: Pod) => void
}
type Filter = 'todos' | 'running' | 'pending' | 'problema'
type SortKey = 'severity' | 'name' | 'mem' | 'restarts' | 'uptime'

const SEVERITY: Record<HealthLevel, number> = { critical: 2, warning: 1, ok: 0 }

// Estado com forma e palavra, não só cor: ◆ crítico, ▲ atenção, ● ok.
export function HealthChip({ level }: { level: HealthLevel }) {
  if (level === 'critical') return <span className="badge badge-crit">◆ crítico</span>
  if (level === 'warning') return <span className="badge badge-warn">▲ atenção</span>
  return <span className="badge badge-ok">● ok</span>
}

export function restartTitle(env: Environment | null, p: Pod) {
  if (!p.workload) return 'Pod sem Deployment/StatefulSet/DaemonSet: não há o que reiniciar'
  if (!canWrite(env)) return env === 'PRO' ? 'Travado em PRO: abre o comando para levar à mudança' : 'Travado: classifique o kubeconfig como DES, ITG ou HML'
  return `Reinicia o ${p.workload.kind} ${p.workload.name} (pede confirmação)`
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

export function PodsTable({ state, env, metricsUnavailable, namespace, onNamespace, namespaces, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'severity', desc: true })
  const [restarting, setRestarting] = useState<Pod | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showHealthy, setShowHealthy] = useState(false)

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
      sort.key === 'severity' ? SEVERITY[p.health.level] * 1e6 + p.restartCount
        : sort.key === 'name' ? p.name
        : sort.key === 'mem' ? pct(p.memUsageMi ?? 0, p.memLimitMi)
        : sort.key === 'restarts' ? p.restartCount
        : -new Date(p.startTime).getTime()
    return [...filtered].sort((a, b) => {
      const r = value(a) > value(b) ? 1 : value(a) < value(b) ? -1 : 0
      return sort.desc ? -r : r
    })
  }, [scoped, filter, sort])

  const attention = rows.filter(p => p.health.level !== 'ok')
  const healthy = rows.filter(p => p.health.level === 'ok')
  // Sem nada pedindo atenção, os saudáveis são a lista inteira: não faz sentido escondê-los.
  const healthyOpen = showHealthy || attention.length === 0

  const sortBy = (key: SortKey) => setSort(s => ({ key, desc: s.key === key ? !s.desc : true }))
  const th = (key: SortKey, label: string, className = '') => (
    <th className={`sortable ${className}`} onClick={() => sortBy(key)} title={`Ordenar por ${label.toLowerCase()}`}>
      {label} {sort.key === key && <ArrowDownUp size={10} />}
    </th>
  )

  const podRow = (p: Pod) => {
    const key = `${p.namespace}/${p.name}`
    const open = expanded === key
    return (
      <Fragment key={key}>
        <tr className={`clickable pod-row ${open ? 'is-open' : ''}`} onClick={() => setExpanded(open ? null : key)} title="Abre logs e o agente de IA aqui mesmo">
          <td><HealthChip level={p.health.level} /></td>
          <td>
            <div className="row" style={{ flexWrap: 'nowrap', ['--gap' as string]: '6px' }}>
              <ChevronRight size={13} className="pod-caret" />
              <div style={{ minWidth: 0 }}>
                <div className="mono pod-name">{p.name}</div>
                <div className="muted pod-sub">{p.namespace} · <span className="mono">{p.imageTag}</span></div>
              </div>
            </div>
          </td>
          <td className="pod-reason">
            <div>{p.status}</div>
            {p.health.reasons.length > 0 && <div className="muted" title={p.health.reasons.join('\n')}>{p.health.reasons.join(' · ')}</div>}
          </td>
          <td className="num">{p.readyContainers}</td>
          <td className="num">{p.restartCount > 0 ? <b style={{ color: p.restartCount > 5 ? 'var(--crit)' : 'var(--warn)' }}>{p.restartCount}</b> : 0}</td>
          <td className="num">{p.cpuUsageM === null ? '—' : `${p.cpuUsageM}m`}</td>
          <td style={{ minWidth: 120 }}>
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
          <td className="num">{relTime(p.startTime).replace('há ', '')}</td>
          <td onClick={e => e.stopPropagation()}>
            <div className="row-actions">
              <button className="btn-link" onClick={() => onOpen(p)} title="Labels, imagem, ConfigMaps e eventos">Descrever</button>
              <button className="btn-link danger" disabled={!p.workload} onClick={() => setRestarting(p)} title={restartTitle(env, p)}>
                Reiniciar…
              </button>
            </div>
          </td>
        </tr>
        {open && (
          <tr className="pod-expanded">
            <td colSpan={9}>
              <div className="pod-inline">
                <LogsDock pod={p} inline onClose={() => setExpanded(null)} />
                <PodAgent pod={p} />
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

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
        {metricsUnavailable && <span className="badge badge-warn" title="Sem metrics-server (ou sem permissão): CPU e memória mostram só o limite">sem métricas</span>}
      </div>
      <div style={{ padding: '10px 16px' }}>
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
        <div className="callout callout-info" style={{ margin: '0 16px 12px' }}>
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
              <table className="table pods-table">
                <thead>
                  <tr>
                    {th('severity', 'Estado')}
                    {th('name', 'Pod')}
                    <th>Fase</th>
                    <th className="num">Pronto</th>
                    {th('restarts', 'Reinícios', 'num')}
                    <th className="num">CPU</th>
                    {th('mem', 'Memória')}
                    {th('uptime', 'Idade', 'num')}
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {attention.length > 0 && (
                    <tr className="group-row"><td colSpan={9}>Precisam de atenção · {attention.length}</td></tr>
                  )}
                  {attention.map(podRow)}
                  {healthy.length > 0 && attention.length > 0 && (
                    <tr className="group-row clickable" onClick={() => setShowHealthy(s => !s)}>
                      <td colSpan={9}>
                        <ChevronRight size={12} className={showHealthy ? 'rot' : ''} /> Saudáveis · {healthy.length} <span className="muted">— {showHealthy ? 'esconder' : 'mostrar'}</span>
                      </td>
                    </tr>
                  )}
                  {healthyOpen && healthy.map(podRow)}
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

// O agente só roda quando pedido: cada investigação é uma chamada à IA.
function PodAgent({ pod }: { pod: Pod }) {
  const [started, setStarted] = useState(false)
  return (
    <div className="pod-agent">
      <div className="row">
        <span className="eyebrow">Agente de IA</span>
        <span className="muted" style={{ fontSize: 12 }}>só leitura · logs e eventos vão no prompt</span>
      </div>
      {started ? (
        <AiStream<DiagnoseEvent & { type: string }>
          start={(onEvent, signal) => diagnosePod(pod, onEvent, signal)}
          initial="Juntando logs e eventos…"
          describe={e => (e.type === 'logs' ? `${e.lines} linhas de log enviadas; o agente está analisando…` : null)}
        />
      ) : (
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {pod.health.reasons.length ? `Sinais: ${pod.health.reasons.join(' · ')}.` : 'Nenhum sinal de problema neste pod.'} O agente lê os logs recentes e os eventos e aponta a causa provável.
          </p>
          <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setStarted(true)}>
            <Sparkles size={13} /> Investigar com IA
          </button>
        </div>
      )}
    </div>
  )
}
