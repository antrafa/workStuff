import { Download, History, Pause, Play, WrapText, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Chips, Search } from '@/ui'
import { logsUrl, mainContainer, type Pod } from './api'
import { tx } from '@/lib/i18n'

type Level = 'tudo' | 'erros' | 'warns'
type Tail = 500 | 2000 | 10000

const MAX_LINES = 10_000

function levelOf(line: string) {
  const l = line.toLowerCase()
  if (l.includes('error') || l.includes('exception') || l.includes('fatal')) return 'error'
  if (l.includes('warn')) return 'warn'
  return 'info'
}

// Status codes stay Portuguese ids; only what is shown is translated.
function statusLabel(status: string, paused: boolean) {
  if (paused) return tx({ en: 'paused', pt: 'pausado' })
  if (status === 'conectando') return tx({ en: 'connecting', pt: 'conectando' })
  if (status === 'seguindo') return tx({ en: 'following', pt: 'seguindo' })
  if (status === 'fim') return tx({ en: 'end', pt: 'fim' })
  if (status === 'conexão encerrada') return tx({ en: 'connection closed', pt: 'conexão encerrada' })
  if (status.startsWith('erro: ')) return tx({ en: 'error: ', pt: 'erro: ' }) + status.slice(6)
  return status
}

// inline: inside the pod's row in the table; without inline: a panel fixed at the bottom of the screen.
export function LogsDock({ pod, onClose, inline }: { pod: Pod; onClose: () => void; inline?: boolean }) {
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

  // One connection per container/tail/previous combination; closing the dock or switching stops kubectl.
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
    const a = Object.assign(document.createElement('a'), { href: url, download: `${pod.name}${previous ? tx({ en: '-previous', pt: '-anterior' }) : ''}.log` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`logs-dock ${inline ? 'inline' : ''}`}>
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
            { id: 'tudo', label: tx({ en: 'All', pt: 'Tudo' }), count: lines.length },
            { id: 'erros', label: tx({ en: 'Errors', pt: 'Erros' }), count: counts.errors },
            { id: 'warns', label: 'Warns', count: counts.warns },
          ]}
        />
        <Search value={query} onChange={setQuery} placeholder={tx({ en: 'filter by text…', pt: 'filtrar por texto…' })} width={200} />
        <div className="spacer" />
        <select className="select" value={tail} onChange={e => setTail(Number(e.target.value) as Tail)} title={tx({ en: 'How many lines to fetch from the end of the log', pt: 'Quantas linhas buscar do fim do log' })}>
          {[500, 2000, 10000].map(n => <option key={n} value={n}>{tx({ en: 'last', pt: 'últimas' })} {n}</option>)}
        </select>
        {pod.restartCount > 0 && (
          <button className="btn btn-sm" aria-pressed={previous} onClick={() => setPrevious(p => !p)} title={tx({ en: 'Log of the previous container, the one that died before the last restart', pt: 'Log do container anterior, o que morreu antes do último restart' })}>
            <History size={13} /> {previous ? tx({ en: 'Previous', pt: 'Anterior' }) : tx({ en: 'Current', pt: 'Atual' })}
          </button>
        )}
        <button className="btn btn-sm" onClick={() => setPaused(p => !p)} title={paused ? tx({ en: 'Starts adding new lines again', pt: 'Volta a acrescentar linhas novas' }) : tx({ en: 'Stops adding lines (new ones are dropped)', pt: 'Para de acrescentar linhas (as novas são descartadas)' })}>
          {paused ? <Play size={13} /> : <Pause size={13} />} {paused ? tx({ en: 'Resume', pt: 'Retomar' }) : tx({ en: 'Pause', pt: 'Pausar' })}
        </button>
        <button className="btn btn-sm" aria-pressed={wrap} onClick={() => setWrap(w => !w)}><WrapText size={13} /> {tx({ en: 'Wrap lines', pt: 'Quebrar linha' })}</button>
        <button className="btn btn-sm" onClick={download} disabled={visible.length === 0} title={tx({ en: 'Downloads the visible lines (with the filter applied)', pt: 'Baixa as linhas visíveis (com o filtro aplicado)' })}><Download size={13} /> {tx({ en: 'Download', pt: 'Baixar' })}</button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} title={inline ? tx({ en: 'Collapse the row', pt: 'Recolher a linha' }) : tx({ en: 'Close logs', pt: 'Fechar logs' })}><X size={14} /></button>
      </div>
      <pre ref={body} className={`logs-body ${wrap ? 'wrap' : ''}`}>
        {visible.map((l, i) => <div key={i} className={`log-${levelOf(l)}`}>{l}</div>)}
        {status === 'seguindo' && !paused && <div className="log-cursor">▍</div>}
        {status === 'conectando' && <div className="log-cursor">{tx({ en: 'waiting for logs…', pt: 'aguardando logs…' })}</div>}
      </pre>
      <div className="logs-foot mono">
        {tx({ en: `${visible.length} of ${lines.length} lines · ${counts.errors} error(s)`, pt: `${visible.length} de ${lines.length} linhas · ${counts.errors} erro(s)` })} · {statusLabel(status, paused)}
      </div>
    </div>
  )
}
