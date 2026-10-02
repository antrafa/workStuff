import './incident.css'
import { History, ScanSearch, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AiStream, Empty, Modal, Page, Search, SkeletonRows, type AiStreamEvent } from '@/ui'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import { useAsync } from '@/lib/useAsync'
import { fetchSession } from '@/features/cluster/api'

type Entry = { at: string; source: 'evento' | 'restart' | 'rollout' | 'log'; severity: 'info' | 'aviso' | 'crítico'; object: string; title: string; detail: string }
// params: o que gerou a linha do tempo na tela. O post-mortem usa estes, não o que está digitado agora.
type Params = { namespace: string; hours: string; focus: string }
type Timeline = { context: string; since: string; entries: Entry[]; notes: string[]; params: Params }
type Level = 'tudo' | 'aviso' | 'crítico'

const NS_KEY = 'incident-namespace'
const read = () => {
  try {
    return localStorage.getItem(NS_KEY) ?? ''
  } catch {
    return ''
  }
}

const SEVERITY_BADGE = { crítico: 'badge-crit', aviso: 'badge-warn', info: '' }
const SOURCE_BADGE = { evento: 'badge-info', restart: 'badge-crit', rollout: 'badge-signal', log: 'badge-warn' }

const time = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function IncidentPage() {
  const session = useAsync(fetchSession)
  const [namespace, setNamespace] = useState(read)
  const [hours, setHours] = useState('3')
  const [focus, setFocus] = useState('')
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState<Level>('aviso')
  const [query, setQuery] = useState('')
  const [drafting, setDrafting] = useState(false)

  const load = async () => {
    setRunning(true)
    setError(null)
    try {
      localStorage.setItem(NS_KEY, namespace)
    } catch {
      // sem storage o namespace não é lembrado
    }
    try {
      const params = { namespace, hours, focus }
      const t = await api.get<Omit<Timeline, 'params'>>(`/incident/timeline?${new URLSearchParams(params)}`)
      setTimeline({ ...t, params })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const visible = useMemo(() => (timeline?.entries ?? [])
    .filter(e => level === 'tudo' || e.severity === 'crítico' || (level === 'aviso' && e.severity === 'aviso'))
    .filter(e => !query || `${e.object} ${e.title} ${e.detail}`.toLowerCase().includes(query.toLowerCase())), [timeline, level, query])

  if (session.loading && !session.data) return <Page eyebrow="Kubernetes" title="Linha do tempo" hint=""><SkeletonRows rows={3} /></Page>

  return (
    <Page
      eyebrow="Kubernetes"
      title="Linha do tempo de incidente"
      hint="Eventos, restarts, rollouts e erros de log de um namespace numa ordem só, e o rascunho do post-mortem pela IA. Só leitura."
      actions={timeline && timeline.entries.length > 0 && <button className="btn btn-primary" onClick={() => setDrafting(true)}><Sparkles size={14} /> Rascunhar post-mortem</button>}
    >
      {!session.data ? (
        <div className="card"><Empty icon={History} title="Nenhum cluster conectado" action={<Link className="btn btn-primary" to="/cluster">Conectar na tela Cluster</Link>} /></div>
      ) : (
        <>
          <section className="card card-pad stack">
            <form className="row" style={{ flexWrap: 'wrap' }} onSubmit={e => (e.preventDefault(), load())}>
              <span className="muted" style={{ fontSize: 12.5 }}>Cluster <span className="mono">{session.data.context}</span></span>
              <input className="input mono" style={{ width: 180 }} value={namespace} onChange={e => setNamespace(e.target.value.trim())} placeholder="namespace" />
              <select className="select" value={hours} onChange={e => setHours(e.target.value)}>
                {['1', '3', '6', '12', '24'].map(h => <option key={h} value={h}>últimas {h} h</option>)}
              </select>
              <input className="input mono spacer" value={focus} onChange={e => setFocus(e.target.value)} placeholder="foco opcional: parte do nome (ex.: api-pedidos)" />
              <button className="btn btn-primary" disabled={!namespace || running}><ScanSearch size={14} /> {running ? 'Montando…' : 'Montar linha do tempo'}</button>
            </form>
            {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
          </section>

          {running && <SkeletonRows rows={6} height={36} />}
          {!running && timeline && (
            <section className="card">
              <div className="card-head" style={{ flexWrap: 'wrap' }}>
                <div className="segmented">
                  {(['crítico', 'aviso', 'tudo'] as Level[]).map(l => (
                    <button key={l} aria-pressed={level === l} onClick={() => setLevel(l)}>{l === 'crítico' ? 'Só críticos' : l === 'aviso' ? 'Avisos e críticos' : 'Tudo'}</button>
                  ))}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{visible.length} de {timeline.entries.length} entradas desde {time(timeline.since)}</span>
                <div className="spacer" />
                <Search value={query} onChange={setQuery} placeholder="Filtrar" width={220} />
              </div>
              {timeline.notes.map(n => <div key={n} className="callout callout-info" style={{ fontSize: 12, margin: '10px 14px 0' }}>{n}</div>)}
              {visible.length === 0 ? (
                <Empty icon={History} title="Nada neste filtro" />
              ) : (
                <ol className="ic-list">
                  {visible.map((e, i) => (
                    <li key={i} className={`ic-item ic-${e.severity === 'crítico' ? 'crit' : e.severity === 'aviso' ? 'warn' : 'info'}`}>
                      <span className="mono muted ic-time">{time(e.at)}</span>
                      <div className="spacer">
                        <div className="row" style={{ ['--gap' as string]: '6px', flexWrap: 'wrap' }}>
                          <span className={`badge ${SOURCE_BADGE[e.source]}`}>{e.source}</span>
                          {e.severity !== 'info' && <span className={`badge ${SEVERITY_BADGE[e.severity]}`}>{e.severity}</span>}
                          <span className="mono" style={{ fontSize: 12.5 }}>{e.object}</span>
                          <b style={{ fontSize: 13 }}>{e.title}</b>
                        </div>
                        <div className="muted ic-detail">{e.detail}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </>
      )}
      {drafting && timeline && (
        <Modal title="Rascunho do post-mortem" width={860} onClose={() => setDrafting(false)}>
          <AiStream<AiStreamEvent & { entries?: number; sent?: number }>
            initial="remontando a linha do tempo…"
            start={(onEvent, signal) => streamPost('/incident/postmortem', onEvent, signal, { ...timeline.params, hours: Number(timeline.params.hours) })}
            describe={e => (e.type === 'timeline' ? `${e.sent} de ${e.entries} entradas enviadas; a IA está escrevendo…` : null)}
          />
        </Modal>
      )}
    </Page>
  )
}
