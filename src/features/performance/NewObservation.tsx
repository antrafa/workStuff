import { Play, RotateCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Async, Search, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { fetchNamespaces, fetchPods, startObservation, type Observation, type Target } from './api'

type Props = { kubeconfigId: string; context: string; onStarted: (o: Observation) => void }

// Namespace de sistema raramente é o que se quer observar: o primeiro de aplicação vem pré-selecionado.
const SYSTEM = /^(kube-|cattle-|istio-|fleet-|cert-manager|ingress|default$|local|gitlab-agent|monitoring)/

export function NewObservation({ kubeconfigId, context, onStarted }: Props) {
  const namespaces = useAsync(() => fetchNamespaces(kubeconfigId, context), [kubeconfigId, context])
  const [namespace, setNamespace] = useState('')
  const pods = useAsync(() => (namespace ? fetchPods(kubeconfigId, context, namespace) : Promise.resolve([])), [kubeconfigId, context, namespace])
  const [interval, setIntervalSeconds] = useState(30)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Target[]>([])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = namespaces.data?.namespaces ?? []
  useEffect(() => {
    if (!namespace && list.length) setNamespace(list.find(n => !SYSTEM.test(n)) ?? list[0])
  }, [namespaces.data, namespace])

  const isSelected = (pod: string) => selected.some(t => t.pod === pod)
  // O sidecar do Istio vem desmarcado: o que interessa é o consumo da aplicação.
  const togglePod = (pod: string, containers: string[]) =>
    setSelected(s => (isSelected(pod) ? s.filter(t => t.pod !== pod) : [...s, { pod, containers: containers.filter(c => c !== 'istio-proxy') }]))
  const toggleContainer = (pod: string, container: string) =>
    setSelected(s => s.map(t => (t.pod !== pod ? t : { ...t, containers: t.containers.includes(container) ? t.containers.filter(c => c !== container) : [...t.containers, container] })))
  const allContainers = (pod: string) => pods.data?.find(p => p.name === pod)?.containers ?? []

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      const o = await startObservation({ kubeconfigId, context, namespace, targets: selected, intervalSeconds: interval })
      setSelected([])
      onStarted(o)
    } catch (e) {
      setError((e as Error).message)
    }
    setStarting(false)
  }

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <div className="card-title spacer">Nova observação</div>
        {namespaces.data?.limitedRbac ? (
          <input
            className="input mono"
            style={{ width: 180 }}
            placeholder="namespace"
            defaultValue={namespace}
            onKeyDown={e => e.key === 'Enter' && (setNamespace(e.currentTarget.value.trim()), setSelected([]))}
            onBlur={e => e.target.value.trim() !== namespace && (setNamespace(e.target.value.trim()), setSelected([]))}
            title="O RBAC não permite listar namespaces: digite o namespace e tecle Enter"
          />
        ) : (
          <select className="select" value={namespace} onChange={e => (setNamespace(e.target.value), setSelected([]))} title="Namespace dos pods" disabled={!list.length}>
            {list.map(n => <option key={n}>{n}</option>)}
          </select>
        )}
        <select className="select" value={interval} onChange={e => setIntervalSeconds(Number(e.target.value))} title="Intervalo entre coletas">
          {[15, 30, 60, 120].map(s => <option key={s} value={s}>a cada {s}s</option>)}
        </select>
        <button className="btn btn-sm" onClick={pods.reload} title="Recarrega a lista de pods do namespace"><RotateCw size={13} className={pods.loading ? 'spin' : ''} /> Pods</button>
        <button className="btn btn-primary" disabled={selected.length === 0 || starting} onClick={start} title={selected.length === 0 ? 'Selecione ao menos um pod' : `Começa a coletar ${selected.length} pod(s) a cada ${interval}s`}>
          <Play size={14} /> {starting ? 'Iniciando…' : 'Iniciar observação'}
        </button>
      </div>
      {namespaces.error && <div className="card-pad"><div className="callout callout-crit">{namespaces.error}</div></div>}
      {error && <div className="card-pad" style={{ paddingBottom: 0 }}><div className="callout callout-crit">{error}</div></div>}
      <div className="obs-columns">
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          <div className="row">
            <span className="eyebrow spacer">Disponíveis</span>
            <Search value={query} onChange={setQuery} placeholder="filtrar pods…" width={200} />
          </div>
          <Async state={pods} isEmpty={d => d.length === 0} skeleton={<SkeletonRows rows={4} height={30} />} empty={<span className="muted">Nenhum pod em {namespace || 'nenhum namespace'}.</span>}>
            {list => (
              <div className="pick-list">
                {list.filter(p => p.name.includes(query.trim())).map(p => (
                  <label key={p.name} className="pick-item">
                    <input type="checkbox" checked={isSelected(p.name)} onChange={() => togglePod(p.name, p.containers)} />
                    <span className="mono">{p.name}</span>
                  </label>
                ))}
              </div>
            )}
          </Async>
        </div>
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          <span className="eyebrow">Selecionados · {selected.length}</span>
          {selected.length === 0 ? (
            <div className="muted pick-empty">Marque pods à esquerda. O container istio-proxy vem desmarcado.</div>
          ) : (
            <div className="pick-list">
              {selected.map(t => (
                <div key={t.pod} className="pick-item selected">
                  <div className="stack spacer" style={{ ['--gap' as string]: '4px' }}>
                    <span className="mono">{t.pod}</span>
                    <div className="row" style={{ ['--gap' as string]: '10px' }}>
                      {allContainers(t.pod).map(c => (
                        <label key={c} className="row" style={{ ['--gap' as string]: '4px', fontSize: 12 }}>
                          <input type="checkbox" checked={t.containers.includes(c)} onChange={() => toggleContainer(t.pod, c)} /> {c}
                        </label>
                      ))}
                    </div>
                    {t.containers.length === 0 && <small className="muted">nenhum marcado: coleta todos os containers</small>}
                  </div>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => togglePod(t.pod, [])} title="Tirar da seleção"><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
