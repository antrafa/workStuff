import { Play, RotateCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Async, Search, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { fetchNamespaces, fetchPods, startObservation, type Observation, type Target } from './api'
import { tx } from '@/lib/i18n'

type Props = { kubeconfigId: string; context: string; onStarted: (o: Observation) => void }

// A system namespace is rarely what one wants to observe: the first application one comes preselected.
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
  // The Istio sidecar comes unchecked: what matters is the application's consumption.
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
        <div className="card-title spacer">{tx({ en: 'New observation', pt: 'Nova observação' })}</div>
        {namespaces.data?.limitedRbac ? (
          <input
            className="input mono"
            style={{ width: 180 }}
            placeholder="namespace"
            defaultValue={namespace}
            onKeyDown={e => e.key === 'Enter' && (setNamespace(e.currentTarget.value.trim()), setSelected([]))}
            onBlur={e => e.target.value.trim() !== namespace && (setNamespace(e.target.value.trim()), setSelected([]))}
            title={tx({ en: 'RBAC does not allow listing namespaces: type the namespace and press Enter', pt: 'O RBAC não permite listar namespaces: digite o namespace e tecle Enter' })}
          />
        ) : (
          <select className="select" value={namespace} onChange={e => (setNamespace(e.target.value), setSelected([]))} title={tx({ en: "The pods' namespace", pt: 'Namespace dos pods' })} disabled={!list.length}>
            {list.map(n => <option key={n}>{n}</option>)}
          </select>
        )}
        <select className="select" value={interval} onChange={e => setIntervalSeconds(Number(e.target.value))} title={tx({ en: 'Interval between collections', pt: 'Intervalo entre coletas' })}>
          {[15, 30, 60, 120].map(s => <option key={s} value={s}>{tx({ en: 'every', pt: 'a cada' })} {s}s</option>)}
        </select>
        <button className="btn btn-sm" onClick={pods.reload} title={tx({ en: "Reloads the namespace's pod list", pt: 'Recarrega a lista de pods do namespace' })}><RotateCw size={13} className={pods.loading ? 'spin' : ''} /> Pods</button>
        <button className="btn btn-primary" disabled={selected.length === 0 || starting} onClick={start} title={selected.length === 0 ? tx({ en: 'Select at least one pod', pt: 'Selecione ao menos um pod' }) : tx({ en: `Starts collecting ${selected.length} pod(s) every ${interval}s`, pt: `Começa a coletar ${selected.length} pod(s) a cada ${interval}s` })}>
          <Play size={14} /> {starting ? tx({ en: 'Starting…', pt: 'Iniciando…' }) : tx({ en: 'Start observation', pt: 'Iniciar observação' })}
        </button>
      </div>
      {namespaces.error && <div className="card-pad"><div className="callout callout-crit">{namespaces.error}</div></div>}
      {error && <div className="card-pad" style={{ paddingBottom: 0 }}><div className="callout callout-crit">{error}</div></div>}
      <div className="obs-columns">
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          <div className="row">
            <span className="eyebrow spacer">{tx({ en: 'Available', pt: 'Disponíveis' })}</span>
            <Search value={query} onChange={setQuery} placeholder={tx({ en: 'filter pods…', pt: 'filtrar pods…' })} width={200} />
          </div>
          <Async state={pods} isEmpty={d => d.length === 0} skeleton={<SkeletonRows rows={4} height={30} />} empty={<span className="muted">{tx({ en: `No pod in ${namespace || 'no namespace'}.`, pt: `Nenhum pod em ${namespace || 'nenhum namespace'}.` })}</span>}>
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
          <span className="eyebrow">{tx({ en: 'Selected', pt: 'Selecionados' })} · {selected.length}</span>
          {selected.length === 0 ? (
            <div className="muted pick-empty">{tx({ en: 'Check pods on the left. The istio-proxy container comes unchecked.', pt: 'Marque pods à esquerda. O container istio-proxy vem desmarcado.' })}</div>
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
                    {t.containers.length === 0 && <small className="muted">{tx({ en: 'none checked: collects every container', pt: 'nenhum marcado: coleta todos os containers' })}</small>}
                  </div>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => togglePod(t.pod, [])} title={tx({ en: 'Remove from the selection', pt: 'Tirar da seleção' })}><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
