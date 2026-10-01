import { Bot, ScrollText, Sparkles, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Async, CopyButton, Empty, Markdown, Modal, SkeletonRows } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { diagnosePod, fetchPodDetail, fetchPodEvents, type Pod } from './api'

type Tab = 'geral' | 'imagem' | 'eventos' | 'ia'
type Props = { pod: Pod; initialTab?: string; onClose: () => void; onLogs: () => void }

const TABS: { id: Tab; label: string }[] = [
  { id: 'geral', label: 'Visão geral' },
  { id: 'imagem', label: 'Imagem e ConfigMaps' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'ia', label: 'Diagnóstico IA' },
]

export function PodDetailModal({ pod, initialTab, onClose, onLogs }: Props) {
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'geral')

  return (
    <Modal
      width={780}
      onClose={onClose}
      title={
        <div className="row">
          <span className="mono">{pod.name}</span>
          <span className={`badge ${pod.health.level === 'ok' ? 'badge-ok' : pod.health.level === 'warning' ? 'badge-warn' : 'badge-crit'}`}>{pod.status}</span>
        </div>
      }
      footer={
        <button className="btn" onClick={onLogs}>
          <ScrollText size={14} /> Abrir logs
        </button>
      }
    >
      <div className="stack">
        <div className="tabs" role="tablist">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'geral' && <Overview pod={pod} />}
        {tab === 'imagem' && <Detail pod={pod} />}
        {tab === 'eventos' && <Events pod={pod} />}
        {/* Montado sempre: trocar de aba não interrompe um diagnóstico em andamento. */}
        <div hidden={tab !== 'ia'}><Diagnosis pod={pod} /></div>
      </div>
    </Modal>
  )
}

function Overview({ pod }: { pod: Pod }) {
  return (
    <dl className="kv">
      <dt>Namespace</dt><dd>{pod.namespace}</dd>
      <dt>Node</dt><dd>{pod.nodeName || '—'}</dd>
      <dt>Pod IP</dt><dd>{pod.podIP || '—'}</dd>
      <dt>Containers</dt><dd>{pod.containers.join(', ')} ({pod.readyContainers} prontos)</dd>
      <dt>Uptime</dt><dd>{relTime(pod.startTime)}</dd>
      <dt>Workload</dt><dd>{pod.workload ? `${pod.workload.kind}/${pod.workload.name}` : '—'}</dd>
      <dt>Memória</dt><dd>uso {pod.memUsageMi ?? '—'}Mi · request {pod.memRequestMi}Mi · limit {pod.memLimitMi || '—'}Mi</dd>
      <dt>CPU</dt><dd>uso {pod.cpuUsageM ?? '—'}m</dd>
      {pod.health.reasons.length > 0 && <><dt>Problemas</dt><dd style={{ fontFamily: 'inherit' }}>{pod.health.reasons.join(' · ')}</dd></>}
    </dl>
  )
}

function Detail({ pod }: { pod: Pod }) {
  const state = useAsync(() => fetchPodDetail(pod), [pod.namespace, pod.name])
  return (
    <Async state={state} skeleton={<SkeletonRows rows={3} />}>
      {d => (
        <div className="stack">
          {d.images.map(i => (
            <div key={i.container} className="stack" style={{ ['--gap' as string]: '4px' }}>
              <span className="eyebrow">{i.container}</span>
              <div className="row">
                <code className="code" style={{ flex: 1 }}>{i.image}</code>
                <CopyButton value={i.image} />
              </div>
              {i.resolvedImage && <small className="muted mono" style={{ overflowWrap: 'anywhere' }}>{i.resolvedImage}</small>}
            </div>
          ))}
          <span className="eyebrow">ConfigMaps ({d.configMaps.length})</span>
          {d.configMaps.length === 0 && <span className="muted">Nenhum ConfigMap referenciado pelo pod.</span>}
          {d.configMaps.map(cm => (
            <details key={cm.name} className="card card-pad">
              <summary className="mono" style={{ cursor: 'pointer' }}>{cm.name} <span className="muted">· {cm.error ?? `${Object.keys(cm.data).length} chaves`}</span></summary>
              <dl className="kv" style={{ marginTop: 10 }}>
                {Object.entries(cm.data).flatMap(([k, v]) => [<dt key={`k-${k}`}>{k}</dt>, <dd key={`v-${k}`}>{v.length > 300 ? `${v.slice(0, 300)}…` : v}</dd>])}
              </dl>
            </details>
          ))}
        </div>
      )}
    </Async>
  )
}

function Events({ pod }: { pod: Pod }) {
  const state = useAsync(() => fetchPodEvents(pod), [pod.namespace, pod.name])
  return (
    <Async
      state={state}
      isEmpty={d => d.length === 0}
      empty={<Empty icon={ScrollText} title="Nenhum evento">O Kubernetes descarta eventos depois de ~1h.</Empty>}
      skeleton={<SkeletonRows rows={3} />}
    >
      {events => (
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          {events.map((e, i) => (
            <div key={i} className="event">
              <span className={`badge ${e.type === 'Warning' ? 'badge-warn' : ''}`}>{e.type}</span>
              <div className="spacer stack" style={{ ['--gap' as string]: '2px' }}>
                <b style={{ fontSize: 13 }}>{e.reason} <span className="mono muted">×{e.count}</span></b>
                <span className="muted" style={{ fontSize: 12.5 }}>{e.message}</span>
              </div>
              <span className="mono muted" style={{ fontSize: 11.5 }}>{relTime(e.at)}</span>
            </div>
          ))}
        </div>
      )}
    </Async>
  )
}

function Diagnosis({ pod }: { pod: Pod }) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [text, setText] = useState('')
  const [info, setInfo] = useState('')
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const run = async () => {
    abort.current = new AbortController()
    setPhase('running')
    setText('')
    setInfo('lendo logs e eventos…')
    let failed = false
    try {
      await diagnosePod(pod, e => {
        if (e.type === 'logs') setInfo(`${e.lines} linhas de log enviadas; o agente está analisando…`)
        if (e.type === 'text') setText(t => t + e.text)
        if (e.type === 'error') ((failed = true), setInfo(e.message))
        if (e.type === 'done') setInfo(`${e.provider} · ${e.model || 'modelo padrão'} · ${Math.round(e.durationMs / 1000)}s${e.stopped ? ' · parado por você' : ''}`)
      }, abort.current.signal)
    } catch (e) {
      failed = true
      setInfo((e as Error).message)
    }
    setPhase(failed ? 'error' : 'done')
  }

  if (phase === 'idle') {
    return (
      <Empty icon={Bot} title="Diagnóstico com IA" action={<button className="btn btn-primary" onClick={run}><Sparkles size={14} /> Analisar com IA</button>}>
        Envia as últimas 150 linhas de log, os eventos e os problemas detectados para o provedor de{' '}
        <Link to="/configuracoes/ia">Configurações</Link>. O agente só lê; nada é executado no cluster.
      </Empty>
    )
  }
  return (
    <div className="stack">
      <div className="row">
        <span className="muted mono" style={{ fontSize: 12 }}>{info}</span>
        <div className="spacer" />
        {phase === 'running' ? (
          <button className="btn btn-sm" onClick={() => abort.current?.abort()} title="Encerra o agente; o que já chegou fica na tela"><Square size={12} /> Parar</button>
        ) : (
          <>
            {text && <CopyButton value={text} label="Copiar" />}
            <button className="btn btn-sm" onClick={run}><Sparkles size={13} /> Reanalisar</button>
          </>
        )}
      </div>
      {phase === 'error' && <div className="callout callout-crit">{info}</div>}
      {text ? <Markdown>{text}</Markdown> : phase === 'running' && <SkeletonRows rows={4} height={18} />}
    </div>
  )
}
