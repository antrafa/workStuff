import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, Wrench } from 'lucide-react'
import { Chips } from '@/ui'
import { tx } from '@/lib/i18n'
import { AGENT_UI, type SessionEvent } from './factoryRun'
import type { SpecializedAgentId } from '../../../server/lib/factory/types.ts'

type Entry = {
  id: string
  time: string
  type: 'status' | 'text' | 'tool' | 'error'
  agentId?: SpecializedAgentId
  title: string
  detail?: string
  callId?: string
  isError?: boolean
}

// One persisted session event -> one line. A tool-result is folded into the tool line it
// answers, so a call and its output read together.
function toEntries(events: SessionEvent[]): Entry[] {
  const entries: Entry[] = []
  events.forEach((ev, i) => {
    const base = { id: `ev-${i}`, time: ev.createdAt ? new Date(ev.createdAt).toTimeString().slice(0, 8) : '', agentId: ev.agentId }
    if (ev.type === 'tool') {
      const input = typeof ev.input === 'object' ? JSON.stringify(ev.input, null, 2) : String(ev.input ?? '')
      entries.push({ ...base, type: 'tool', title: ev.tool ?? tx({ en: 'tool', pt: 'ferramenta' }), detail: input, callId: ev.id })
    } else if (ev.type === 'tool-result') {
      const call = [...entries].reverse().find(e => e.callId === ev.id)
      if (!call) return
      call.detail = `${call.detail}\n\n── saída ──\n${(ev.content ?? '').slice(0, 4000)}`
      call.isError = ev.isError
    } else if (ev.type === 'text' && ev.text) {
      entries.push({ ...base, type: 'text', title: tx({ en: 'wrote', pt: 'escreveu' }), detail: ev.text })
    } else if (ev.type === 'error') {
      entries.push({ ...base, type: 'error', title: tx({ en: 'error', pt: 'erro' }), detail: ev.message, isError: true })
    } else if (ev.type === 'status' && ev.message) {
      entries.push({ ...base, type: 'status', title: ev.message })
    }
  })
  return entries
}

const TONE: Record<Entry['type'], string> = { status: 'var(--line-hi)', text: 'var(--line-hi)', tool: 'var(--info)', error: 'var(--crit)' }

// What every agent of the task wrote and every tool it called, as it happens.
export function ActivityFeed({ events, running }: { events: SessionEvent[]; running: boolean }) {
  const all = useMemo(() => toEntries(events), [events])
  const [filter, setFilter] = useState<'all' | 'tools' | 'status'>('all')
  const [follow, setFollow] = useState(true)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)

  const shown = all.filter(e => (filter === 'tools' ? e.type === 'tool' : filter === 'status' ? e.type === 'status' || e.type === 'error' : true))
  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [shown.length, events, follow])

  const copy = () => {
    const text = all.map(e => `[${e.time}] ${e.agentId ? AGENT_UI[e.agentId].name + ' ' : ''}${e.title}${e.detail ? `\n${e.detail}` : ''}`).join('\n\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }, () => {})
  }

  return (
    <div className="card stack" style={{ gap: 0, overflow: 'hidden' }}>
      <div className="row" style={{ justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--line)', gap: 10, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="eyebrow">{tx({ en: 'Agent activity', pt: 'Atividade dos agentes' })}</span>
          <Chips
            options={[
              { id: 'all', label: tx({ en: 'All', pt: 'Tudo' }), count: all.length },
              { id: 'tools', label: tx({ en: 'Tools', pt: 'Ferramentas' }), count: all.filter(e => e.type === 'tool').length },
              { id: 'status', label: tx({ en: 'Steps and errors', pt: 'Etapas e erros' }) },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </div>
        <div className="row" style={{ gap: 10, fontSize: 12 }}>
          <label className="row" style={{ gap: 6, cursor: 'pointer', color: 'var(--muted)' }}>
            <input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} /> {tx({ en: 'Follow the end', pt: 'Seguir o fim' })}
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={copy} title={tx({ en: 'Copy all the activity', pt: 'Copiar toda a atividade' })}>
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? tx({ en: 'Copied', pt: 'Copiado' }) : tx({ en: 'Copy', pt: 'Copiar' })}
          </button>
        </div>
      </div>
      <div ref={box} className="stack mono" style={{ maxHeight: 460, overflowY: 'auto', padding: '12px 14px', gap: 8, fontSize: 12, background: 'var(--bg)' }}>
        {shown.length === 0 && <span className="muted" style={{ textAlign: 'center', padding: 24 }}>{tx({ en: 'No activity recorded yet.', pt: 'Nenhuma atividade registrada ainda.' })}</span>}
        {shown.map(e => (
          <div key={e.id} style={{ padding: '6px 10px', borderRadius: 6, background: e.isError ? 'var(--crit-soft)' : e.type === 'tool' ? 'var(--info-soft)' : 'var(--surface)', borderLeft: `3px solid ${e.isError ? 'var(--crit)' : TONE[e.type]}` }}>
            <div className="row" style={{ gap: 8, fontSize: 11, color: 'var(--muted)' }}>
              <span>{e.time}</span>
              {e.agentId && <b style={{ color: AGENT_UI[e.agentId].color }}>{AGENT_UI[e.agentId].name}</b>}
              {e.type === 'tool' && <Wrench size={11} style={{ color: 'var(--info)' }} />}
              {e.isError && <AlertTriangle size={11} style={{ color: 'var(--crit)' }} />}
              <span style={{ color: e.isError ? 'var(--crit)' : 'var(--ink-2)', fontWeight: 600 }}>{e.title}</span>
            </div>
            {e.detail && (
              <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, maxHeight: e.type === 'text' ? 320 : 180, overflowY: 'auto', color: e.type === 'text' ? 'var(--ink-2)' : 'var(--muted)' }}>
                {e.detail}
              </pre>
            )}
          </div>
        ))}
        {running && <span style={{ color: 'var(--info)' }}><span className="live-dot" /> {tx({ en: 'agents working...', pt: 'agentes trabalhando...' })}</span>}
      </div>
    </div>
  )
}
