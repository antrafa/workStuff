import { WrapText, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Search } from '@/ui'
import { appLogsUrl, type App } from './api'
import { tx } from '@/lib/i18n'
import '../cluster/cluster.css'

const MAX_LINES = 5_000
const levelOf = (line: string) => (/error|exception|fatal/i.test(line) ? 'error' : /warn/i.test(line) ? 'warn' : 'info')

// Follows the log file of an application; a new start empties the file and the view starts over.
export function AppLogs({ app, onClose }: { app: App; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [wrap, setWrap] = useState(false)
  const body = useRef<HTMLPreElement>(null)
  // A chunk can end mid-line: the remainder waits for the next one.
  const partial = useRef('')

  useEffect(() => {
    const es = new EventSource(appLogsUrl(app.id))
    es.onmessage = m => {
      const e = JSON.parse(m.data) as { type: 'chunk'; text: string; reset: boolean }
      if (e.reset) partial.current = ''
      const parts = (partial.current + e.text).split('\n')
      partial.current = parts.pop() ?? ''
      setLines(l => [...(e.reset ? [] : l), ...parts].slice(-MAX_LINES))
    }
    return () => es.close()
  }, [app.id])

  const visible = query ? lines.filter(l => l.toLowerCase().includes(query.toLowerCase())) : lines

  useEffect(() => {
    if (body.current) body.current.scrollTop = body.current.scrollHeight
  }, [visible.length])

  return (
    <div className="logs-dock inline">
      <div className="logs-head">
        <b className="mono">{app.name}</b>
        <Search value={query} onChange={setQuery} placeholder={tx({ en: 'filter by text…', pt: 'filtrar por texto…' })} width={200} />
        <div className="spacer" />
        <button className="btn btn-sm" aria-pressed={wrap} onClick={() => setWrap(w => !w)}><WrapText size={13} /> {tx({ en: 'Wrap lines', pt: 'Quebrar linha' })}</button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} title={tx({ en: 'Close logs', pt: 'Fechar logs' })}><X size={14} /></button>
      </div>
      <pre ref={body} className={`logs-body ${wrap ? 'wrap' : ''}`}>
        {visible.length === 0 && <div className="log-info">{tx({ en: 'Empty log: the application has not written anything since the last start.', pt: 'Log vazio: a aplicação não escreveu nada desde o último início.' })}</div>}
        {visible.map((l, i) => <div key={i} className={`log-${levelOf(l)}`}>{l}</div>)}
      </pre>
    </div>
  )
}
