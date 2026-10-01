import { RotateCcw, Send, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from '@/ui'
import { streamPost } from '@/lib/stream'
import type { ChatEvent } from './api'

type Message = { role: 'user' | 'ai'; text: string; steps?: number; info?: string; error?: string }

const SUGGESTIONS = [
  'Quais partes do sistema estão mais acopladas?',
  'Qual é o fluxo principal de ponta a ponta?',
  'O que quebra se eu mudar a camada de persistência?',
]

// Cada pergunta vai com as últimas trocas e o relatório salvo como contexto; o agente confirma no código.
export function ChatTab({ projectPath }: { projectPath: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const patchLast = (patch: (m: Message) => Message) => setMessages(ms => [...ms.slice(0, -1), patch(ms[ms.length - 1])])

  const send = async (question: string) => {
    if (!question.trim() || busy) return
    const history = messages.filter(m => !m.error).map(m => ({ role: m.role, text: m.text }))
    setMessages(ms => [...ms, { role: 'user', text: question }, { role: 'ai', text: '', steps: 0 }])
    setInput('')
    setBusy(true)
    abort.current = new AbortController()
    try {
      await streamPost<ChatEvent>('/analysis/chat', e => {
        if (e.type === 'text') patchLast(m => ({ ...m, text: m.text + e.text }))
        if (e.type === 'tool') patchLast(m => ({ ...m, steps: (m.steps ?? 0) + 1 }))
        if (e.type === 'error') patchLast(m => ({ ...m, error: e.message }))
        if (e.type === 'done') patchLast(m => ({ ...m, info: `${e.provider} · ${Math.round(e.durationMs / 1000)}s${e.stopped ? ' · parado' : ''}` }))
      }, abort.current.signal, { projectPath, question, history })
    } catch (e) {
      patchLast(m => ({ ...m, error: (e as Error).message }))
    }
    setBusy(false)
  }

  return (
    <div className="stack chat">
      {messages.length === 0 && (
        <div className="stack" style={{ alignItems: 'center', padding: '20px 0' }}>
          <span className="muted">Pergunte sobre o código. O agente parte do relatório e confirma lendo os arquivos.</span>
          <div className="row" style={{ justifyContent: 'center' }}>
            {SUGGESTIONS.map(s => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
          </div>
        </div>
      )}
      {messages.map((m, i) => (
        <div key={i} className={`chat-msg is-${m.role}`}>
          {m.role === 'user' ? m.text : m.text ? <Markdown>{m.text}</Markdown> : !m.error && <span className="muted">lendo o código… ({m.steps ?? 0} leituras)</span>}
          {m.error && <div className="callout callout-crit" style={{ marginTop: 6 }}>{m.error}</div>}
          {m.info && <div className="mono muted" style={{ fontSize: 11, marginTop: 6 }}>{m.steps ?? 0} leituras · {m.info}</div>}
        </div>
      ))}
      <form className="row" onSubmit={e => (e.preventDefault(), send(input))}>
        <input className="input" style={{ flex: 1 }} value={input} placeholder="pergunte algo sobre a arquitetura…" onChange={e => setInput(e.target.value)} disabled={busy} />
        {busy ? (
          <button className="btn" type="button" onClick={() => abort.current?.abort()} title="Encerra o agente; o que já chegou fica na tela"><Square size={14} /> Parar</button>
        ) : (
          <button className="btn btn-primary" type="submit" disabled={!input.trim()}><Send size={14} /> Enviar</button>
        )}
        <button className="btn" type="button" onClick={() => setMessages([])} disabled={busy || messages.length === 0} title="Começa uma conversa nova, sem o histórico desta">
          <RotateCcw size={14} /> Nova conversa
        </button>
      </form>
    </div>
  )
}
