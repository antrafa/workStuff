import './logs.css'
import { Pause, Play, ScrollText, Square, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CopyButton, Empty, Page, Search, SkeletonRows } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { fetchSession } from '@/features/cluster/api'

type Line = { id: number; pod: string; container: string; text: string }
type Suggestion = { selector: string; pods: number }

// Teto de linhas na tela: o navegador trava com dezenas de milhares de nós.
const MAX_LINES = 5000
const NS_KEY = 'logs-namespace'

const read = (k: string) => {
  try {
    return localStorage.getItem(k) ?? ''
  } catch {
    return ''
  }
}

// Cor estável por pod: o mesmo pod tem a mesma cor em toda a sessão.
function hue(pod: string) {
  let h = 0
  for (const c of pod) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

// Clicar em vários apps da mesma chave vira "chave in (a,b)"; de chaves diferentes, fica o último.
function combine(picked: string[]): string {
  if (picked.length <= 1) return picked[0] ?? ''
  const pairs = picked.map(s => s.split('='))
  const key = pairs[0][0]
  return pairs.every(p => p[0] === key) ? `${key} in (${pairs.map(p => p[1]).join(',')})` : picked[picked.length - 1]
}

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
  // Rajada inicial (centenas de linhas do --tail) renderizada linha a linha trava a aba: chega no buffer
  // e vai para a tela em lote a cada 250 ms.
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
      // sem storage o namespace não é lembrado
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

  // Só dá para combinar valores da mesma chave: outra chave recomeça a seleção, e os chips marcados batem com o seletor.
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
    // Conectado não significa linha nova: app quieta não escreve nada, e a tela não deve parecer travada.
    es.onopen = () => setStatus(s => (s === 'conectando' ? 'ao vivo' : s))
    es.onmessage = msg => {
      const e = JSON.parse(msg.data)
      if (e.type === 'line') {
        const line = { id: seq.current++, pod: e.pod, container: e.container, text: e.text }
        setStatus(s => (s === 'conectando' ? 'ao vivo' : s))
        const target = paused.current ?? incoming.current
        target.push(line)
        // Pausa longa numa app barulhenta não pode crescer sem fim: fica só o que caberia na tela.
        if (target.length > MAX_LINES) target.splice(0, target.length - MAX_LINES)
      }
      if (e.type === 'error') ((setError(e.message), setStatus('erro')))
      if (e.type === 'done') (es.close(), setStatus(s => (s === 'erro' ? s : 'parado')))
    }
    // EventSource não expõe o corpo do erro HTTP: a validação do seletor e do namespace é feita antes, no servidor.
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
      // O que ainda estava no lote de 250 ms vem primeiro: a ordem das linhas se mantém ao retomar.
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
      hint="Logs de todos os pods de uma ou mais aplicações ao mesmo tempo, intercalados e com uma cor por pod. Só leitura."
    >
      {!session.data ? (
        <div className="card">
          <Empty icon={ScrollText} title="Nenhum cluster conectado" action={<Link className="btn btn-primary" to="/cluster">Conectar na tela Cluster</Link>} />
        </div>
      ) : (
        <>
          <section className="card card-pad stack">
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Cluster <span className="mono">{session.data.context}</span></span>
              <input className="input mono" style={{ width: 200 }} value={namespace} onChange={e => setNamespace(e.target.value.trim())} placeholder="namespace" disabled={running} />
              <button className="btn" onClick={loadSuggestions} disabled={!namespace || running}>Listar aplicações</button>
            </div>
            {suggestions && (
              <div className="row lg-apps">
                {suggestions.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Nenhum pod com label de app neste namespace; digite o seletor.</span>}
                {suggestions.map(s => (
                  <button key={s.selector} className="chip" aria-pressed={picked.includes(s.selector)} onClick={() => toggle(s.selector)} disabled={running}>
                    <span className="mono">{s.selector.split('=')[1]}</span><span className="count">{s.pods}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <input className="input mono spacer" value={selector} onChange={e => (setSelector(e.target.value), setPicked([]))} placeholder="seletor, ex.: app=api" disabled={running} />
              <input className="input mono" style={{ width: 150 }} value={container} onChange={e => setContainer(e.target.value.trim())} placeholder="container (padrão)" disabled={running} title="Vazio: o container principal de cada pod" />
              <select className="select" value={since} onChange={e => setSince(e.target.value)} disabled={running}>
                <option value="300">últimos 5 min</option>
                <option value="600">últimos 10 min</option>
                <option value="3600">última hora</option>
                <option value="">só as 100 últimas linhas</option>
              </select>
              {running
                ? <button className="btn" onClick={stop}><Square size={13} /> Parar</button>
                : <button className="btn btn-primary" onClick={start} disabled={!namespace || !selector}><Play size={13} /> Acompanhar</button>}
            </div>
            {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
          </section>

          {(running || lines.length > 0) && (
            <section className="card">
              <div className="card-head" style={{ flexWrap: 'wrap' }}>
                <span className={`badge ${status === 'ao vivo' ? 'badge-ok' : status === 'erro' ? 'badge-crit' : status === 'pausado' ? 'badge-warn' : ''}`}>{status}</span>
                <span className="muted" style={{ fontSize: 12 }}>{pods.length} pod(s) · {lines.length} linhas{lines.length >= MAX_LINES ? ` (as ${MAX_LINES} mais recentes)` : ''}</span>
                <div className="spacer" />
                <Search value={filter} onChange={setFilter} placeholder="Filtrar texto ou pod" width={220} />
                {running && <button className="btn btn-sm" onClick={togglePause}>{status === 'pausado' ? <><Play size={12} /> Retomar</> : <><Pause size={12} /> Pausar</>}</button>}
                <CopyButton value={visible.map(l => `[${l.pod}] ${l.text}`).join('\n')} label="Copiar" />
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setLines([])} title="Limpar a tela"><Trash2 size={13} /></button>
              </div>
              <div className="lg-legend">
                {pods.map(p => <span key={p} className="mono" style={{ color: `hsl(${hue(p)} 65% 60%)` }}>● {p}</span>)}
              </div>
              <pre ref={body} className="lg-body">
                {visible.map(l => (
                  <div key={l.id}><span className="lg-pod" style={{ color: `hsl(${hue(l.pod)} 65% 60%)` }}>{l.pod.slice(-12)}</span> {l.text}</div>
                ))}
                {status === 'conectando' && <div className="muted">conectando…</div>}
                {status === 'ao vivo' && lines.length === 0 && <div className="muted">conectado; nenhuma linha no período escolhido ainda.</div>}
              </pre>
            </section>
          )}
        </>
      )}
    </Page>
  )
}
