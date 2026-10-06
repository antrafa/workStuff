import { ArrowDownUp, Boxes, ChevronRight, Info, Sparkles } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { AiStream, Async, Chips, Empty, Meter, Search, SkeletonRows } from '@/ui'
import { pct, relTime } from '@/lib/format'
import { LogsDock } from './LogsDock'
import { RestartModal } from './RestartModal'
import { canWrite, diagnosePod, type DiagnoseEvent, type Environment, type HealthLevel, type Pod } from './api'
import { tx } from '@/lib/i18n'

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

// State with shape and word, not only color: ◆ critical, ▲ warning, ● ok.
export function HealthChip({ level }: { level: HealthLevel }) {
  if (level === 'critical') return <span className="badge badge-crit">◆ {tx({ en: 'critical', pt: 'crítico' })}</span>
  if (level === 'warning') return <span className="badge badge-warn">▲ {tx({ en: 'warning', pt: 'atenção' })}</span>
  return <span className="badge badge-ok">● ok</span>
}

export function restartTitle(env: Environment | null, p: Pod) {
  if (!p.workload) return tx({ en: 'Pod with no Deployment/StatefulSet/DaemonSet: nothing to restart', pt: 'Pod sem Deployment/StatefulSet/DaemonSet: não há o que reiniciar' })
  if (!canWrite(env)) return env === 'PRO' ? tx({ en: 'Locked in PRO: opens the command to take to the change', pt: 'Travado em PRO: abre o comando para levar à mudança' }) : tx({ en: 'Locked: classify the kubeconfig as DES, ITG or HML', pt: 'Travado: classifique o kubeconfig como DES, ITG ou HML' })
  return tx({ en: `Restarts ${p.workload.kind} ${p.workload.name} (asks for confirmation)`, pt: `Reinicia o ${p.workload.kind} ${p.workload.name} (pede confirmação)` })
}

// Limited RBAC: with no namespace list, the user types the one to see.
function NamespaceControl({ namespace, onNamespace, namespaces, forceInput }: Pick<Props, 'namespace' | 'onNamespace' | 'namespaces'> & { forceInput: boolean }) {
  const [typed, setTyped] = useState(namespace)
  if (forceInput || namespaces?.limitedRbac || (namespaces && namespaces.namespaces.length === 0)) {
    return (
      <form className="row" style={{ ['--gap' as string]: '4px' }} onSubmit={e => (e.preventDefault(), onNamespace(typed.trim()))}>
        <input className="input mono" style={{ width: 200 }} placeholder="namespace" value={typed} onChange={e => setTyped(e.target.value)} title={tx({ en: 'RBAC does not list namespaces: type the name', pt: 'O RBAC não lista namespaces: digite o nome' })} />
        <button className="btn btn-sm" type="submit">{tx({ en: 'View', pt: 'Ver' })}</button>
      </form>
    )
  }
  return (
    <select className="select" value={namespace} onChange={e => onNamespace(e.target.value)} title={tx({ en: 'Filters by namespace (queries the cluster only there)', pt: 'Filtra por namespace (consulta o cluster só nele)' })}>
      <option value="">{tx({ en: 'all namespaces', pt: 'todos os namespaces' })}</option>
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
  // The server says so in the chosen language
  const needsNamespace = /escolha um namespace|choose a namespace/.test(state.error ?? '')
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
  // With nothing asking for attention, the healthy ones are the whole list: no point hiding them.
  const healthyOpen = showHealthy || attention.length === 0

  const sortBy = (key: SortKey) => setSort(s => ({ key, desc: s.key === key ? !s.desc : true }))
  const th = (key: SortKey, label: string, className = '') => (
    <th className={`sortable ${className}`} onClick={() => sortBy(key)} title={tx({ en: `Sort by ${label.toLowerCase()}`, pt: `Ordenar por ${label.toLowerCase()}` })}>
      {label} {sort.key === key && <ArrowDownUp size={10} />}
    </th>
  )

  const podRow = (p: Pod) => {
    const key = `${p.namespace}/${p.name}`
    const open = expanded === key
    return (
      <Fragment key={key}>
        <tr className={`clickable pod-row ${open ? 'is-open' : ''}`} onClick={() => setExpanded(open ? null : key)} title={tx({ en: 'Opens logs and the AI agent right here', pt: 'Abre logs e o agente de IA aqui mesmo' })}>
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
                  {p.memUsageMi}Mi <span className="muted">/ {p.memLimitMi ? `${p.memLimitMi}Mi` : tx({ en: 'no limit', pt: 'sem limite' })}</span>
                </span>
                {p.memLimitMi > 0 && <Meter percent={pct(p.memUsageMi, p.memLimitMi)} />}
              </div>
            )}
          </td>
          <td className="num">{relTime(p.startTime).replace(/^há | ago$/g, '')}</td>
          <td onClick={e => e.stopPropagation()}>
            <div className="row-actions">
              <button className="btn-link" onClick={() => onOpen(p)} title={tx({ en: 'Labels, image, ConfigMaps and events', pt: 'Labels, imagem, ConfigMaps e eventos' })}>{tx({ en: 'Describe', pt: 'Descrever' })}</button>
              <button className="btn-link danger" disabled={!p.workload} onClick={() => setRestarting(p)} title={restartTitle(env, p)}>
                {tx({ en: 'Restart…', pt: 'Reiniciar…' })}
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
        <Search value={query} onChange={setQuery} placeholder={tx({ en: 'Find pod by name…', pt: 'Buscar pod por nome…' })} width={220} />
        <div className="spacer" />
        <span className="mono muted" style={{ fontSize: 12 }}>
          {rows.length} / {all.length} pods
        </span>
        {metricsUnavailable && <span className="badge badge-warn" title={tx({ en: 'No metrics-server (or no permission): CPU and memory show only the limit', pt: 'Sem metrics-server (ou sem permissão): CPU e memória mostram só o limite' })}>{tx({ en: 'no metrics', pt: 'sem métricas' })}</span>}
      </div>
      <div style={{ padding: '10px 16px' }}>
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'todos', label: tx({ en: 'All', pt: 'Todos' }), count: counts.todos },
            { id: 'running', label: 'Running', count: counts.running },
            { id: 'pending', label: 'Pending', count: counts.pending },
            { id: 'problema', label: tx({ en: 'With problems', pt: 'Com problema' }), count: counts.problema },
          ]}
        />
      </div>
      {needsNamespace && (
        <div className="callout callout-info" style={{ margin: '0 16px 12px' }}>
          <Info size={16} /> {tx({ en: "This user's RBAC does not list pods in all namespaces. Type a namespace above to see its pods.", pt: 'O RBAC deste usuário não lista pods de todos os namespaces. Digite um namespace acima para ver os pods dele.' })}
        </div>
      )}
      <Async
        state={needsNamespace ? { ...state, error: null, data: [] } : state}
        isEmpty={d => d.length === 0}
        empty={needsNamespace ? null : <Empty icon={Boxes} title={tx({ en: 'No pod found', pt: 'Nenhum pod encontrado' })}>{tx({ en: 'The selected namespace has no pods, or RBAC does not allow listing them.', pt: 'O namespace selecionado não tem pods, ou o RBAC não permite listá-los.' })}</Empty>}
        skeleton={<div style={{ padding: 16 }}><SkeletonRows rows={6} height={40} /></div>}
      >
        {() =>
          rows.length === 0 ? (
            <Empty icon={Boxes} title={tx({ en: 'Nothing matches the filter', pt: 'Nada casa com o filtro' })} action={<button className="btn btn-sm" onClick={() => (setQuery(''), setFilter('todos'))}>{tx({ en: 'Clear filters', pt: 'Limpar filtros' })}</button>} />
          ) : (
            <div className="table-wrap">
              <table className="table pods-table">
                <thead>
                  <tr>
                    {th('severity', tx({ en: 'State', pt: 'Estado' }))}
                    {th('name', 'Pod')}
                    <th>{tx({ en: 'Phase', pt: 'Fase' })}</th>
                    <th className="num">{tx({ en: 'Ready', pt: 'Pronto' })}</th>
                    {th('restarts', tx({ en: 'Restarts', pt: 'Reinícios' }), 'num')}
                    <th className="num">CPU</th>
                    {th('mem', tx({ en: 'Memory', pt: 'Memória' }))}
                    {th('uptime', tx({ en: 'Age', pt: 'Idade' }), 'num')}
                    <th>{tx({ en: 'Actions', pt: 'Ações' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {attention.length > 0 && (
                    <tr className="group-row"><td colSpan={9}>{tx({ en: 'Need attention', pt: 'Precisam de atenção' })} · {attention.length}</td></tr>
                  )}
                  {attention.map(podRow)}
                  {healthy.length > 0 && attention.length > 0 && (
                    <tr className="group-row clickable" onClick={() => setShowHealthy(s => !s)}>
                      <td colSpan={9}>
                        <ChevronRight size={12} className={showHealthy ? 'rot' : ''} /> {tx({ en: 'Healthy', pt: 'Saudáveis' })} · {healthy.length} <span className="muted">— {showHealthy ? tx({ en: 'hide', pt: 'esconder' }) : tx({ en: 'show', pt: 'mostrar' })}</span>
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

// The agent only runs when asked: each investigation is an AI call.
function PodAgent({ pod }: { pod: Pod }) {
  const [started, setStarted] = useState(false)
  return (
    <div className="pod-agent">
      <div className="row">
        <span className="eyebrow">{tx({ en: 'AI agent', pt: 'Agente de IA' })}</span>
        <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'read-only · logs and events go in the prompt', pt: 'só leitura · logs e eventos vão no prompt' })}</span>
      </div>
      {started ? (
        <AiStream<DiagnoseEvent & { type: string }>
          start={(onEvent, signal) => diagnosePod(pod, onEvent, signal)}
          initial={tx({ en: 'Gathering logs and events…', pt: 'Juntando logs e eventos…' })}
          describe={e => (e.type === 'logs' ? tx({ en: `${e.lines} log lines sent; the agent is analyzing…`, pt: `${e.lines} linhas de log enviadas; o agente está analisando…` }) : null)}
        />
      ) : (
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {pod.health.reasons.length ? tx({ en: `Signals: ${pod.health.reasons.join(' · ')}.`, pt: `Sinais: ${pod.health.reasons.join(' · ')}.` }) : tx({ en: 'No sign of a problem in this pod.', pt: 'Nenhum sinal de problema neste pod.' })} {tx({ en: 'The agent reads the recent logs and events and points out the likely cause.', pt: 'O agente lê os logs recentes e os eventos e aponta a causa provável.' })}
          </p>
          <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setStarted(true)}>
            <Sparkles size={13} /> {tx({ en: 'Investigate with AI', pt: 'Investigar com IA' })}
          </button>
        </div>
      )}
    </div>
  )
}
