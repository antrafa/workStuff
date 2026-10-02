import './performance.css'
import { Activity, Pause, Play, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Async, ConfirmModal, Empty, Page, SkeletonRows, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { NewObservation } from './NewObservation'
import { ObservationDetail } from './ObservationDetail'
import { ReportSection } from './ReportSection'
import { deleteObservation, fetchKubeconfigs, fetchObservations, resumeObservation, stopObservation, type Observation, type Status } from './api'

const STATUS: Record<Status, { label: string; badge: string }> = {
  running: { label: 'rodando', badge: 'badge-ok' },
  stopped: { label: 'parada', badge: '' },
  failed: { label: 'falhou', badge: 'badge-crit' },
}

// Observação aberta por último: conveniência deste navegador.
const LAST = 'performance-last-observation'
const readLast = () => {
  try {
    return localStorage.getItem(LAST)
  } catch {
    return null
  }
}

export default function PerformancePage() {
  const kubeconfigs = useAsync(fetchKubeconfigs)
  const state = useAsync(fetchObservations)
  const [kubeconfigId, setKubeconfigId] = useState('')
  const [context, setContext] = useState('')
  const [selectedId, setSelectedIdState] = useState<string | null>(readLast)
  const [deleting, setDeleting] = useState<Observation | null>(null)
  const toast = useToast()

  const items = kubeconfigs.data?.items
  const selectedKube = items?.find(k => k.id === kubeconfigId)
  // Começa pelo kubeconfig ativo na tela Cluster; sem sessão, o primeiro da lista.
  useEffect(() => {
    if (kubeconfigId || !items?.length) return
    const session = kubeconfigs.data?.session
    setKubeconfigId(session && items.some(k => k.id === session.kubeconfigId) ? session.kubeconfigId : items[0].id)
  }, [kubeconfigs.data, kubeconfigId])
  useEffect(() => {
    if (!selectedKube) return
    const session = kubeconfigs.data?.session
    setContext(session?.kubeconfigId === selectedKube.id ? session.context : selectedKube.currentContext)
  }, [selectedKube])

  // Batimento e status mudam no servidor: relista a cada 15s enquanto houver coleta.
  const anyRunning = state.data?.some(o => o.status === 'running') ?? false
  useEffect(() => {
    if (!anyRunning) return
    const t = setInterval(() => fetchObservations().then(state.setData).catch(() => {}), 15_000)
    return () => clearInterval(t)
  }, [anyRunning])

  const select = (id: string | null) => {
    setSelectedIdState(id)
    try {
      if (id) localStorage.setItem(LAST, id)
      else localStorage.removeItem(LAST)
    } catch {
      // sem storage a seleção vale só nesta aba
    }
  }

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast(ok)
    } catch (e) {
      toast((e as Error).message)
    }
    state.reload()
  }

  const selected = state.data?.find(o => o.id === selectedId)

  return (
    <Page
      title="Performance"
      hint="Grava CPU, memória, restarts, throttling e latência do Istio de pods escolhidos ao longo do tempo, e gera um relatório com IA."
      actions={
        <div className="row" title="Kubeconfig desta tela, separado da sessão do Cluster. Cada observação guarda o seu.">
          <span className="eyebrow">Kubeconfig</span>
          <select className="select" value={kubeconfigId} onChange={e => setKubeconfigId(e.target.value)} disabled={!items?.length}>
            {items?.map(k => <option key={k.id} value={k.id}>{k.id}{k.environment ? ` · ${k.environment}` : ''}</option>)}
          </select>
          {selectedKube && selectedKube.contexts.length > 1 && (
            <select className="select" value={context} onChange={e => setContext(e.target.value)} title="Contexto">
              {selectedKube.contexts.map(c => <option key={c}>{c}</option>)}
            </select>
          )}
        </div>
      }
    >
      {kubeconfigs.error && <div className="callout callout-crit">{kubeconfigs.error}</div>}
      {items?.length === 0 && (
        <div className="callout callout-warn">Nenhum kubeconfig em ~/.kube. Adicione um pela tela Cluster para observar pods.</div>
      )}
      {kubeconfigId && context && (
        <NewObservation
          key={`${kubeconfigId}/${context}`}
          kubeconfigId={kubeconfigId}
          context={context}
          onStarted={o => {
            toast(`Observação iniciada com ${o.targets.length} pod(s)`)
            select(o.id)
            state.reload()
          }}
        />
      )}

      <section className="card">
        <div className="card-head">
          <div className="card-title spacer">Observações</div>
          <span className="mono muted" style={{ fontSize: 12 }}>{state.data?.length ?? 0}</span>
        </div>
        <Async
          state={state}
          isEmpty={d => d.length === 0}
          skeleton={<div className="card-pad"><SkeletonRows rows={3} /></div>}
          empty={<Empty icon={Activity} title="Nenhuma observação ainda">Escolha pods acima e clique em “Iniciar observação” para começar a coletar.</Empty>}
        >
          {list => (
            <div className="obs-list">
              {list.map(o => (
                <div key={o.id} className={`obs-row ${o.id === selectedId ? 'is-selected' : ''}`} onClick={() => select(o.id)}>
                  <Heartbeat o={o} />
                  <div className="stack spacer" style={{ ['--gap' as string]: '2px' }}>
                    <b className="mono" style={{ fontSize: 12.5 }}>{o.kubeconfigId.replace(/\.(ya?ml|kubeconfig)$/, '')} · {o.namespace} · {o.targets.length} pod(s)</b>
                    <span className="muted" style={{ fontSize: 12 }}>
                      início {new Date(o.startedAt).toLocaleString('pt-BR')} · a cada {o.intervalSeconds}s
                      {(o.failure ?? o.lastError) && <span style={{ color: 'var(--crit)' }}> · {o.failure ?? o.lastError}</span>}
                    </span>
                  </div>
                  <span className={`badge ${STATUS[o.status].badge}`}>{STATUS[o.status].label}</span>
                  <div className="row" style={{ ['--gap' as string]: '4px' }} onClick={e => e.stopPropagation()}>
                    {o.status === 'running' ? (
                      <button className="btn btn-sm" onClick={() => act(() => stopObservation(o.id), 'Coleta parada; os pontos ficam salvos')} title="Para a coleta; os pontos ficam salvos"><Pause size={13} /> Parar</button>
                    ) : (
                      <button className="btn btn-sm" onClick={() => act(() => resumeObservation(o.id), 'Coleta retomada')} title={`Volta a coletar com ${o.kubeconfigId}`}><Play size={13} /> Retomar</button>
                    )}
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDeleting(o)} title="Apagar observação e pontos coletados"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Async>
      </section>

      {selected && <ObservationDetail key={`${selected.id}-${selected.status}`} observation={selected} />}
      {selected && <ReportSection key={`r-${selected.id}`} observation={selected} />}

      {deleting && (
        <ConfirmModal
          title="Apagar a observação?"
          confirmLabel="Apagar"
          icon={Trash2}
          onClose={() => setDeleting(null)}
          onConfirm={() => void act(() => deleteObservation(deleting.id), 'Observação apagada').then(() => deleting.id === selectedId && select(null))}
        >
          A observação de <code className="inline">{deleting.namespace}</code> e todos os pontos coletados são apagados. Não dá para desfazer;
          relatórios já gerados continuam salvos.
        </ConfirmModal>
      )}
    </Page>
  )
}

function Heartbeat({ o }: { o: Observation }) {
  if (o.status !== 'running') return <span className="dot" title="Sem coleta" />
  if (!o.lastTickAt) return <span className="dot dot-warn" title="aguardando a 1ª coleta" />
  const stale = Date.now() - new Date(o.lastTickAt).getTime() > o.intervalSeconds * 3000
  return <span className={`dot ${stale ? 'dot-warn' : 'dot-ok pulse'}`} title={`última coleta ${relTime(o.lastTickAt)}${stale ? ' (atrasada)' : ''}`} />
}
