import './logs.css'
import { Pause, Play, ScrollText, Square, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CopyButton, Empty, Page, Search, SkeletonRows } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { fetchSession } from '@/features/cluster/api'
import { tx } from '@/lib/i18n'

type Line = { id: number; pod: string; container: string; text: string }
type Suggestion = { selector: string; pods: number }

// Cap on lines on screen: the browser freezes with tens of thousands of nodes.
const MAX_LINES = 5000
const NS_KEY = 'logs-namespace'

const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}

// Stable color per pod: the same pod has the same color for the whole session.
function hue(pod: string) {
  let h = 0
  for (const c of pod) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

// Clicking several apps of the same key becomes "key in (a,b)"; with different keys, the last one stays.
function combine(picked: string[]): string {
  if (picked.length <= 1) return picked[0] ?? ''
  const pairs = picked.map(s => s.split('='))
  const key = pairs[0][0]
  return pairs.every(p => p[0] === key) ? `${key} in (${pairs.map(p => p[1]).join(',')})` : picked[picked.length - 1]
}

// Status codes stay Portuguese ids; only the badge text is translated.
const STATUS_LABEL = tx({
  en: { parado: 'stopped', conectando: 'connecting', 'ao vivo': 'live', pausado: 'paused', erro: 'error' },
  pt: { parado: 'parado', conectando: 'conectando', 'ao vivo': 'ao vivo', pausado: 'pausado', erro: 'erro' },
})

export default function LogsPage() {
  const session = useAsync(fetchSession)
  const [namespace, setNamespace] = useState(() => read(NS_KEY))
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [selector, setSelector] = useState('')
  const [container, setContainer] = useState('')
  const [since, setSince] = useState('600')
  const [lines, setLines] = useState<Line[]>([])
  const [status, setStatus] = useState<'parado' | 'conectando' | 'ao vivo' | 'pausado' | 'erro'>('parado')
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const source = useRef<EventSource | null>(null)
  const paused = useRef<Line[] | null>(null)
  const body = useRef<HTMLPreElement | null>(null)
  const seq = useRef(0)
  // The initial burst (hundreds of --tail lines) rendered line by line freezes the tab: it lands in a
  // buffer and goes to the screen in a batch every 250 ms.
  const incoming = useRef<Line[]>([])
  useEffect(() => {
    const id = setInterval(() => {
      if (!incoming.current.length || paused.current) return
      const batch = incoming.current
      incoming.current = []
      setLines(prev => [...prev, ...batch].slice(-MAX_LINES))
    }, 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => () => source.current?.close(), [])
  useEffect(() => {
    try {
      localStorage.setItem(NS_KEY, namespace)
    } catch {
      // no storage: the namespace is not remembered
    }
  }, [namespace])

  const loadSuggestions = async () => {
    setError(null)
    try {
      setSuggestions(await api.get<Suggestion[]>(`/k8s/logs/selectors?namespace=${encodeURIComponent(namespace)}`))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Only values of the same key combine: another key restarts the selection, and the marked chips match the selector.
  const toggle = (s: string) => setPicked(prev => {
    if (prev.includes(s)) return prev.filter(x => x !== s)
    return prev.length && prev[0].split('=')[0] !== s.split('=')[0] ? [s] : [...prev, s]
  })
  useEffect(() => {
    if (picked.length) setSelector(combine(picked))
  }, [picked])

  const stop = () => {
    source.current?.close()
    source.current = null
    paused.current = null
    incoming.current = []
    setStatus('parado')
  }

  const start = () => {
    stop()
    setLines([])
    setError(null)
    setStatus('conectando')
    const q = new URLSearchParams({ namespace, selector, tail: '100', since, ...(container ? { container } : {}) })
    const es = new EventSource(`/api/k8s/logs?${q}`)
    source.current = es
    // Connected does not mean a new line: a quiet app writes nothing, and the screen must not look frozen.
    es.onopen = () => setStatus(s => (s === 'conectando' ? 'ao vivo' : s))
    es.onmessage = msg => {
      const e = JSON.parse(msg.data)
      if (e.type === 'line') {
        const line = { id: seq.current++, pod: e.pod, container: e.container, text: e.text }
        setStatus(s => (s === 'conectando' ? 'ao vivo' : s))
        const target = paused.current ?? incoming.current
        target.push(line)
        // A long pause on a noisy app must not grow forever: only what would fit on screen is kept.
        if (target.length > MAX_LINES) target.splice(0, target.length - MAX_LINES)
      }
      if (e.type === 'error') ((setError(e.message), setStatus('erro')))
      if (e.type === 'done') (es.close(), setStatus(s => (s === 'erro' ? s : 'parado')))
    }
    // EventSource does not expose the HTTP error body: selector and namespace validation happens first, on the server.
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) setStatus(s => (s === 'conectando' ? 'erro' : s))
    }
  }

  const togglePause = () => {
    if (paused.current) {
      const buffered = paused.current
      paused.current = null
      setLines(prev => [...prev, ...buffered].slice(-MAX_LINES))
      setStatus('ao vivo')
    } else {
      // What was still in the 250 ms batch comes first: the line order holds on resume.
      paused.current = incoming.current
      incoming.current = []
      setStatus('pausado')
    }
  }

  const visible = useMemo(() => {
    const f = filter.toLowerCase()
    return f ? lines.filter(l => l.text.toLowerCase().includes(f) || l.pod.includes(f)) : lines
  }, [lines, filter])

  useEffect(() => {
    if (status === 'ao vivo' && body.current) body.current.scrollTop = body.current.scrollHeight
  }, [visible.length, status])

  const pods = [...new Set(lines.map(l => l.pod))]
  const running = status === 'conectando' || status === 'ao vivo' || status === 'pausado'

  if (session.loading && !session.data) return <Page title="Logs" hint=""><SkeletonRows rows={3} /></Page>

  return (
    <Page
      title="Logs"
      hint={tx({ en: 'Logs of every pod of one or more applications at once, interleaved, one color per pod. Read-only.', pt: 'Logs de todos os pods de uma ou mais aplicações ao mesmo tempo, intercalados e com uma cor por pod. Só leitura.' })}
    >
      {!session.data ? (
        <div className="card">
          <Empty icon={ScrollText} title={tx({ en: 'No cluster connected', pt: 'Nenhum cluster conectado' })} action={<Link className="btn btn-primary" to="/cluster">{tx({ en: 'Connect on the Cluster screen', pt: 'Conectar na tela Cluster' })}</Link>} />
        </div>
      ) : (
        <>
          <section className="card card-pad stack">
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Cluster <span className="mono">{session.data.context}</span></span>
              <input className="input mono" style={{ width: 200 }} value={namespace} onChange={e => setNamespace(e.target.value.trim())} placeholder="namespace" disabled={running} />
              <button className="btn" onClick={loadSuggestions} disabled={!namespace || running}>{tx({ en: 'List applications', pt: 'Listar aplicações' })}</button>
            </div>
            {suggestions && (
              <div className="row lg-apps">
                {suggestions.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>{tx({ en: 'No pod with an app label in this namespace; type the selector.', pt: 'Nenhum pod com label de app neste namespace; digite o seletor.' })}</span>}
                {suggestions.map(s => (
                  <button key={s.selector} className="chip" aria-pressed={picked.includes(s.selector)} onClick={() => toggle(s.selector)} disabled={running}>
                    <span className="mono">{s.selector.split('=')[1]}</span><span className="count">{s.pods}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <input className="input mono spacer" value={selector} onChange={e => (setSelector(e.target.value), setPicked([]))} placeholder={tx({ en: 'selector, e.g. app=api', pt: 'seletor, ex.: app=api' })} disabled={running} />
              <input className="input mono" style={{ width: 150 }} value={container} onChange={e => setContainer(e.target.value.trim())} placeholder={tx({ en: 'container (default)', pt: 'container (padrão)' })} disabled={running} title={tx({ en: "Empty: each pod's main container", pt: 'Vazio: o container principal de cada pod' })} />
              <select className="select" value={since} onChange={e => setSince(e.target.value)} disabled={running}>
                <option value="300">{tx({ en: 'last 5 min', pt: 'últimos 5 min' })}</option>
                <option value="600">{tx({ en: 'last 10 min', pt: 'últimos 10 min' })}</option>
                <option value="3600">{tx({ en: 'last hour', pt: 'última hora' })}</option>
                <option value="">{tx({ en: 'only the last 100 lines', pt: 'só as 100 últimas linhas' })}</option>
              </select>
              {running
                ? <button className="btn" onClick={stop}><Square size={13} /> {tx({ en: 'Stop', pt: 'Parar' })}</button>
                : <button className="btn btn-primary" onClick={start} disabled={!namespace || !selector}><Play size={13} /> {tx({ en: 'Follow', pt: 'Acompanhar' })}</button>}
            </div>
            {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
          </section>

          {(running || lines.length > 0) && (
            <section className="card">
              <div className="card-head" style={{ flexWrap: 'wrap' }}>
                <span className={`badge ${status === 'ao vivo' ? 'badge-ok' : status === 'erro' ? 'badge-crit' : status === 'pausado' ? 'badge-warn' : ''}`}>{STATUS_LABEL[status]}</span>
                <span className="muted" style={{ fontSize: 12 }}>{tx({ en: `${pods.length} pod(s) · ${lines.length} lines`, pt: `${pods.length} pod(s) · ${lines.length} linhas` })}{lines.length >= MAX_LINES ? tx({ en: ` (the ${MAX_LINES} most recent)`, pt: ` (as ${MAX_LINES} mais recentes)` }) : ''}</span>
                <div className="spacer" />
                <Search value={filter} onChange={setFilter} placeholder={tx({ en: 'Filter text or pod', pt: 'Filtrar texto ou pod' })} width={220} />
                {running && <button className="btn btn-sm" onClick={togglePause}>{status === 'pausado' ? <><Play size={12} /> {tx({ en: 'Resume', pt: 'Retomar' })}</> : <><Pause size={12} /> {tx({ en: 'Pause', pt: 'Pausar' })}</>}</button>}
                <CopyButton value={visible.map(l => `[${l.pod}] ${l.text}`).join('\n')} label={tx({ en: 'Copy', pt: 'Copiar' })} />
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setLines([])} title={tx({ en: 'Clear the screen', pt: 'Limpar a tela' })}><Trash2 size={13} /></button>
              </div>
              <div className="lg-legend">
                {pods.map(p => <span key={p} className="mono" style={{ color: `hsl(${hue(p)} 65% 60%)` }}>● {p}</span>)}
              </div>
              <pre ref={body} className="lg-body">
                {visible.map(l => (
                  <div key={l.id}><span className="lg-pod" style={{ color: `hsl(${hue(l.pod)} 65% 60%)` }}>{l.pod.slice(-12)}</span> {l.text}</div>
                ))}
                {status === 'conectando' && <div className="muted">{tx({ en: 'connecting…', pt: 'conectando…' })}</div>}
                {status === 'ao vivo' && lines.length === 0 && <div className="muted">{tx({ en: 'connected; no line in the chosen period yet.', pt: 'conectado; nenhuma linha no período escolhido ainda.' })}</div>}
              </pre>
            </section>
          )}
        </>
      )}
    </Page>
  )
}
