import { Download, History, Pause, Play, WrapText, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Chips, Search } from '@/ui'
import { logsUrl, mainContainer, type Pod } from './api'

type Level = 'tudo' | 'erros' | 'warns'
type Tail = 500 | 2000 | 10000

const MAX_LINES = 10_000

function levelOf(line: string) {
  const l = line.toLowerCase()
  if (l.includes('error') || l.includes('exception') || l.includes('fatal')) return 'error'
  if (l.includes('warn')) return 'warn'
  return 'info'
}

export function LogsDock({ pod, onClose }: { pod: Pod; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<'conectando' | 'seguindo' | 'fim' | string>('conectando')
  const [level, setLevel] = useState<Level>('tudo')
  const [query, setQuery] = useState('')
  const [paused, setPaused] = useState(false)
  const [wrap, setWrap] = useState(false)
  const [container, setContainer] = useState(mainContainer(pod))
  const [tail, setTail] = useState<Tail>(500)
  const [previous, setPrevious] = useState(false)
  const pausedRef = useRef(false)
  const body = useRef<HTMLPreElement>(null)
  pausedRef.current = paused

  // Uma conexão por combinação de container/tail/previous; fechar o dock ou trocar encerra o kubectl.
  useEffect(() => {
    setLines([])
    setStatus('conectando')
    const es = new EventSource(logsUrl(pod, { container, tail, previous, follow: !previous }))
    es.onmessage = m => {
      const e = JSON.parse(m.data) as { type: 'line'; text: string } | { type: 'error'; message: string } | { type: 'done' }
      if (e.type === 'line') {
        setStatus(s => (s === 'conectando' ? 'seguindo' : s))
        if (!pausedRef.current) setLines(l => (l.length >= MAX_LINES ? [...l.slice(-MAX_LINES + 1), e.text] : [...l, e.text]))
      }
      if (e.type === 'error') setStatus(`erro: ${e.message}`)
      if (e.type === 'done') {
        setStatus(s => (s.startsWith('erro') ? s : 'fim'))
        es.close()
      }
    }
    es.onerror = () => (setStatus(s => (s === 'fim' || s.startsWith('erro') ? s : 'conexão encerrada')), es.close())
    return () => es.close()
  }, [pod, container, tail, previous])

  const counts = useMemo(() => ({ errors: lines.filter(l => levelOf(l) === 'error').length, warns: lines.filter(l => levelOf(l) === 'warn').length }), [lines])
  const visible = lines.filter(l => {
    if (level === 'erros' && levelOf(l) !== 'error') return false
    if (level === 'warns' && levelOf(l) !== 'warn') return false
    return !query || l.toLowerCase().includes(query.toLowerCase())
  })

  useEffect(() => {
    if (!paused && body.current) body.current.scrollTop = body.current.scrollHeight
  }, [visible.length, paused])

  const download = () => {
    const url = URL.createObjectURL(new Blob([visible.join('\n')], { type: 'text/plain' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${pod.name}${previous ? '-anterior' : ''}.log` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="logs-dock">
      <div className="logs-head">
        <b className="mono">{pod.name}</b>
        {pod.containers.length > 1 && (
          <select className="select" value={container} onChange={e => setContainer(e.target.value)} title="Container">
            {pod.containers.map(c => <option key={c}>{c}</option>)}
          </select>
        )}
        <Chips
          value={level}
          onChange={setLevel}
          options={[
            { id: 'tudo', label: 'Tudo', count: lines.length },
            { id: 'erros', label: 'Erros', count: counts.errors },
            { id: 'warns', label: 'Warns', count: counts.warns },
          ]}
        />
        <Search value={query} onChange={setQuery} placeholder="filtrar por texto…" width={200} />
        <div className="spacer" />
        <select className="select" value={tail} onChange={e => setTail(Number(e.target.value) as Tail)} title="Quantas linhas buscar do fim do log">
          {[500, 2000, 10000].map(n => <option key={n} value={n}>últimas {n}</option>)}
        </select>
        {pod.restartCount > 0 && (
          <button className="btn btn-sm" aria-pressed={previous} onClick={() => setPrevious(p => !p)} title="Log do container anterior, o que morreu antes do último restart">
            <History size={13} /> {previous ? 'Anterior' : 'Atual'}
          </button>
        )}
        <button className="btn btn-sm" onClick={() => setPaused(p => !p)} title={paused ? 'Volta a acrescentar linhas novas' : 'Para de acrescentar linhas (as novas são descartadas)'}>
          {paused ? <Play size={13} /> : <Pause size={13} />} {paused ? 'Retomar' : 'Pausar'}
        </button>
        <button className="btn btn-sm" aria-pressed={wrap} onClick={() => setWrap(w => !w)}><WrapText size={13} /> Quebrar linha</button>
        <button className="btn btn-sm" onClick={download} disabled={visible.length === 0} title="Baixa as linhas visíveis (com o filtro aplicado)"><Download size={13} /> Baixar</button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} title="Fechar logs"><X size={14} /></button>
      </div>
      <pre ref={body} className={`logs-body ${wrap ? 'wrap' : ''}`}>
        {visible.map((l, i) => <div key={i} className={`log-${levelOf(l)}`}>{l}</div>)}
        {status === 'seguindo' && !paused && <div className="log-cursor">▍</div>}
        {status === 'conectando' && <div className="log-cursor">aguardando logs…</div>}
      </pre>
      <div className="logs-foot mono">
        {visible.length} de {lines.length} linhas · {counts.errors} erro(s) · {paused ? 'pausado' : status}
      </div>
    </div>
  )
}
