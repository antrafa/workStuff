import './compare.css'
import { ArrowLeftRight, ChevronDown, ChevronRight, GitCompare } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { Empty, Page, Search, Segmented, SkeletonRows } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { fetchKubeconfigs, type Kubeconfig } from '@/features/cluster/api'

type Side = { kubeconfigId: string; context: string; namespace: string }
type State = 'igual' | 'diferente' | 'só em A' | 'só em B'
type WorkloadDiff = { kind: string; name: string; state: State; diffs: { field: string; a: string | null; b: string | null }[] }
type Result = { a: { label: string; count: number }; b: { label: string; count: number }; workloads: WorkloadDiff[] }

const STORAGE = 'compare-sides'
const empty: Side = { kubeconfigId: '', context: '', namespace: '' }

function readSides(): [Side, Side] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? 'null')
    if (Array.isArray(saved) && saved.length === 2) return saved as [Side, Side]
  } catch {
    // sem storage os lados começam vazios
  }
  return [empty, empty]
}

const STATE_BADGE: Record<State, string> = { diferente: 'badge-warn', 'só em A': 'badge-info', 'só em B': 'badge-info', igual: 'badge-ok' }

export default function ComparePage() {
  const kubeconfigs = useAsync(fetchKubeconfigs)
  const [sides, setSides] = useState<[Side, Side]>(readSides)
  const [result, setResult] = useState<Result | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(sides))
    } catch {
      // sem storage os lados não são lembrados
    }
  }, [sides])

  const items = kubeconfigs.data?.items ?? []
  const ready = sides.every(s => s.kubeconfigId && s.namespace)
  const setSide = (i: 0 | 1, s: Side) => setSides(prev => (i === 0 ? [s, prev[1]] : [prev[0], s]))

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      setResult(await api.post<Result>('/compare', { a: sides[0], b: sides[1] }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Page
      eyebrow="Kubernetes"
      title="Comparar ambientes"
      hint="Diferenças de imagem, réplicas, recursos, variáveis e probes entre os Deployments, StatefulSets e CronJobs de dois namespaces, em clusters iguais ou diferentes. Só leitura."
    >
      <section className="card card-pad">
        <div className="cmp-sides">
          <SidePicker label="A" side={sides[0]} items={items} onChange={s => setSide(0, s)} />
          <button className="btn btn-ghost btn-icon" title="Trocar os lados" onClick={() => setSides([sides[1], sides[0]])}><ArrowLeftRight size={15} /></button>
          <SidePicker label="B" side={sides[1]} items={items} onChange={s => setSide(1, s)} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="muted" style={{ fontSize: 12 }}>Variáveis com nome de senha, token ou chave aparecem mascaradas; Secret nunca é lido.</span>
          <div className="spacer" />
          <button className="btn btn-primary" disabled={!ready || running} onClick={run}><GitCompare size={14} /> {running ? 'Comparando…' : 'Comparar'}</button>
        </div>
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5, marginTop: 12 }}>{error}</div>}
      </section>

      {running && <SkeletonRows rows={5} height={40} />}
      {!running && result && <Diffs result={result} />}
    </Page>
  )
}

function SidePicker({ label, side, items, onChange }: { label: string; side: Side; items: Kubeconfig[]; onChange: (s: Side) => void }) {
  const kc = items.find(k => k.id === side.kubeconfigId)
  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <div className="eyebrow">Lado {label}</div>
      <select className="select" value={side.kubeconfigId} onChange={e => {
        const next = items.find(k => k.id === e.target.value)
        onChange({ ...side, kubeconfigId: e.target.value, context: next?.currentContext ?? '' })
      }}>
        <option value="">escolha o kubeconfig</option>
        {items.map(k => <option key={k.id} value={k.id}>{k.id}{k.environment ? ` (${k.environment})` : ''}</option>)}
      </select>
      {kc && kc.contexts.length > 1 && (
        <select className="select" value={side.context} onChange={e => onChange({ ...side, context: e.target.value })}>
          {kc.contexts.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <input className="input mono" value={side.namespace} onChange={e => onChange({ ...side, namespace: e.target.value.trim() })} placeholder="namespace" />
    </div>
  )
}

type Filter = 'mudou' | 'todos'

function Diffs({ result }: { result: Result }) {
  const changed = result.workloads.filter(w => w.state !== 'igual')
  const [filter, setFilter] = useState<Filter>(changed.length ? 'mudou' : 'todos')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const rows = (filter === 'mudou' ? changed : result.workloads).filter(w => w.name.toLowerCase().includes(query.toLowerCase()))
  const count = (s: State) => result.workloads.filter(w => w.state === s).length

  return (
    <>
      <div className="grid" style={{ ['--min' as string]: '150px' }}>
        {(['diferente', 'só em A', 'só em B', 'igual'] as State[]).map(s => (
          <div key={s} className="stat"><span className="eyebrow">{s}</span><b>{count(s)}</b><small>workloads</small></div>
        ))}
      </div>
      <section className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <Segmented<Filter> value={filter} onChange={setFilter} options={[{ id: 'mudou', label: `Com diferença (${changed.length})` }, { id: 'todos', label: `Todos (${result.workloads.length})` }]} />
          <div className="spacer" />
          <Search value={query} onChange={setQuery} placeholder="Filtrar por nome" />
        </div>
        {rows.length === 0 ? (
          <Empty icon={GitCompare} title="Nenhuma diferença">Os dois lados têm os mesmos workloads com a mesma configuração.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Workload</th><th>Estado</th><th>Diferenças</th></tr></thead>
              <tbody>
                {rows.map(w => {
                  const key = `${w.kind}/${w.name}`
                  const expanded = open === key
                  return (
                    <Fragment key={key}>
                      <tr className={w.diffs.length ? 'cmp-row' : ''} onClick={() => w.diffs.length && setOpen(expanded ? null : key)}>
                        <td>
                          <div className="row" style={{ ['--gap' as string]: '6px' }}>
                            {w.diffs.length > 0 && (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                            <span className="mono">{w.name}</span>
                          </div>
                          <div className="muted" style={{ fontSize: 11.5 }}>{w.kind}</div>
                        </td>
                        <td><span className={`badge ${STATE_BADGE[w.state]}`}>{w.state}</span></td>
                        <td className="muted" style={{ fontSize: 12.5 }}>{w.diffs.length ? w.diffs.slice(0, 4).map(d => d.field.split('.').slice(-1)[0]).join(', ') + (w.diffs.length > 4 ? ` +${w.diffs.length - 4}` : '') : '—'}</td>
                      </tr>
                      {expanded && (
                        <tr className="cmp-detail">
                          <td colSpan={3}>
                            <table className="table cmp-fields">
                              <thead><tr><th>Campo</th><th title={result.a.label}>A</th><th title={result.b.label}>B</th></tr></thead>
                              <tbody>
                                {w.diffs.map(d => (
                                  <tr key={d.field}>
                                    <td className="mono">{d.field}</td>
                                    <td className="mono">{d.a ?? <span className="muted">ausente</span>}</td>
                                    <td className="mono">{d.b ?? <span className="muted">ausente</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
        <div className="card-pad muted" style={{ fontSize: 12 }}>A: {result.a.label} ({result.a.count}) · B: {result.b.label} ({result.b.count})</div>
      </section>
    </>
  )
}
