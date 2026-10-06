import { AlertTriangle, Check, ChevronRight, History, Plus, Send, ShieldAlert, ShieldCheck, Square, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CopyButton, EnvStamp, Markdown, Modal, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { useClusterShared } from './api'
import {
  approveDoctor, askDoctor, deleteConversation, fetchConversation, fetchConversations, fetchStatus, rejectDoctor, stopConversation,
  type ConversationSummary, type DoctorEvent,
} from './doctorApi'
import { tx } from '@/lib/i18n'

type Entry =
  | { kind: 'user' | 'text' | 'thinking'; text: string }
  | { kind: 'tool'; id: string; command: string; result?: { isError: boolean; content: string } }
  | { kind: 'status' | 'error'; text: string }
  | { kind: 'mutation'; line: string; action: string; allowed: boolean; reason: string | null }
  | { kind: 'executed'; line: string; ok: boolean; output: string }

const SUGGESTIONS = tx({
  en: ['Which pods have problems in this cluster?', 'Investigate the recent events in the namespace', 'Is any node under memory or disk pressure?'],
  pt: ['Quais pods estão com problema neste cluster?', 'Investiga os eventos recentes do namespace', 'Algum node sob pressão de memória ou disco?'],
})

// One function for live events and for the history: a reopened conversation looks like the one seen.
function apply(entries: Entry[], e: DoctorEvent): Entry[] {
  const last = entries.at(-1)
  switch (e.type) {
    case 'user': return [...entries, { kind: 'user', text: e.text }]
    case 'text':
    case 'thinking':
      return last?.kind === e.type ? [...entries.slice(0, -1), { ...last, text: last.text + e.text }] : [...entries, { kind: e.type, text: e.text }]
    case 'tool': return [...entries, { kind: 'tool', id: e.id, command: e.input.command ?? e.tool }]
    case 'tool-result': return entries.map(x => (x.kind === 'tool' && x.id === e.id ? { ...x, result: { isError: e.isError, content: e.content } } : x))
    case 'status': return [...entries, { kind: 'status', text: e.message }]
    case 'error': return [...entries, { kind: 'error', text: e.message }]
    case 'mutation': return [...entries, { kind: 'mutation', line: e.line, action: e.action, allowed: e.allowed, reason: e.reason }]
    case 'executed': return [...entries, { kind: 'executed', line: e.line, ok: e.ok, output: e.output }]
    default: return entries
  }
}

export function DoctorPanel() {
  const { session } = useClusterShared()
  const status = useAsync(fetchStatus)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [pending, setPending] = useState<{ line: string; action: string } | null>(null)
  const [running, setRunning] = useState(false)
  const [input, setInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement | null>(null)
  const toast = useToast()

  // Braces on purpose: in recent Chrome scrollIntoView returns a Promise, which React would treat as a cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [entries])
  useEffect(() => () => abort.current?.abort(), [])
  // Switching clusters starts a new conversation: it is tied to the kubeconfig and context it was born in.
  useEffect(() => {
    setConversationId(null)
    setEntries([])
    setPending(null)
  }, [session?.kubeconfig.id, session?.context])

  const stream = async (call: (onEvent: (e: DoctorEvent) => void, signal: AbortSignal) => Promise<void>) => {
    abort.current = new AbortController()
    setRunning(true)
    setPending(null)
    try {
      await call(e => {
        if (e.type === 'conversation') setConversationId(e.id)
        else if (e.type === 'done') setPending(e.pending)
        else setEntries(prev => apply(prev, e))
      }, abort.current.signal)
    } catch (e) {
      setEntries(prev => apply(prev, { type: 'error', message: (e as Error).message }))
    }
    setRunning(false)
  }

  const send = (text: string) => {
    const message = text.trim()
    if (!message || running) return
    setInput('')
    stream((onEvent, signal) => askDoctor({ conversationId: conversationId ?? undefined, message }, onEvent, signal))
  }

  const stop = () => {
    if (conversationId) stopConversation(conversationId).catch(() => {})
    abort.current?.abort()
  }

  const open = async (c: ConversationSummary) => {
    setShowHistory(false)
    try {
      const full = await fetchConversation(c.id)
      setConversationId(full.id)
      setEntries(full.events.reduce(apply, [] as Entry[]))
      setPending(full.pending)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  if (status.data && !status.data.ok) {
    return (
      <div className="callout callout-warn">
        <AlertTriangle size={16} />
        <span>{status.data.reason} <Link to="/configuracoes/ia">{tx({ en: 'Open Settings', pt: 'Abrir Configurações' })}</Link></span>
      </div>
    )
  }
  if (!session) return <div className="callout callout-info"><ShieldCheck size={16} />{tx({ en: 'Connect a cluster to talk to Cluster Doctor.', pt: 'Conecte um cluster para conversar com o Cluster Doctor.' })}</div>

  const env = session.kubeconfig.environment
  return (
    <section className="doctor">
      <header className="doctor-head">
        <b>Cluster Doctor</b>
        <span className="mono">{session.kubeconfig.id.replace(/\.(ya?ml|kubeconfig)$/, '')}</span>
        <EnvStamp env={env} />
        {(env === 'PRO' || !env) && <span className="badge badge-crit" title={tx({ en: 'No write is proposed for execution in this environment', pt: 'Nenhuma escrita é proposta para execução neste ambiente' })}>{tx({ en: 'read-only', pt: 'somente leitura' })}</span>}
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 11.5 }} title={tx({ en: 'The agent only runs kubectl reads; a write is proposed and run by the panel after your confirmation', pt: 'O agente só roda leituras do kubectl; escrita é proposta e executada pelo painel depois da sua confirmação' })}>
          <ShieldCheck size={12} /> {tx({ en: 'locked reads; writes only with your confirmation', pt: 'leitura com trava; escrita só com sua confirmação' })}
        </span>
        <button className="btn btn-sm" onClick={() => setShowHistory(true)}><History size={13} /> {tx({ en: 'History', pt: 'Histórico' })}</button>
        <button className="btn btn-sm" disabled={running} onClick={() => (setConversationId(null), setEntries([]), setPending(null))}><Plus size={13} /> {tx({ en: 'New', pt: 'Nova' })}</button>
      </header>

      <div className="doctor-body">
        {entries.length === 0 && (
          <div className="stack" style={{ alignItems: 'center', padding: '32px 0' }}>
            <span className="muted">{tx({ en: 'Describe the problem or start from a suggestion:', pt: 'Descreva o problema ou comece por uma sugestão:' })}</span>
            <div className="row" style={{ justifyContent: 'center' }}>
              {SUGGESTIONS.map(s => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {entries.map((e, i) => (
          <EntryView
            key={i}
            entry={e}
            actionable={Boolean(pending && e.kind === 'mutation' && e.allowed && e.line === pending.line && i === entries.map(x => x.kind).lastIndexOf('mutation'))}
            busy={running}
            onApprove={() => conversationId && stream((onEvent, signal) => approveDoctor(conversationId, onEvent, signal))}
            onReject={() => conversationId && stream((onEvent, signal) => rejectDoctor(conversationId, onEvent, signal))}
          />
        ))}
        {running && <div className="muted" style={{ fontSize: 12 }}>{tx({ en: 'investigating…', pt: 'investigando…' })}</div>}
        <div ref={bottom} />
      </div>

      <form className="doctor-input" onSubmit={e => (e.preventDefault(), send(input))}>
        <textarea
          className="textarea"
          rows={2}
          value={input}
          placeholder={tx({ en: 'describe the cluster problem… (Enter sends, Shift+Enter new line)', pt: 'descreva o problema do cluster… (Enter envia, Shift+Enter quebra linha)' })}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send(input))}
        />
        {running
          ? <button className="btn" type="button" onClick={stop} title={tx({ en: 'Stops the agent; what already arrived stays in the conversation', pt: 'Interrompe o agente; o que já chegou fica na conversa' })}><Square size={13} /> {tx({ en: 'Stop', pt: 'Parar' })}</button>
          : <button className="btn btn-primary" type="submit" disabled={!input.trim()}><Send size={14} /> {tx({ en: 'Send', pt: 'Enviar' })}</button>}
      </form>

      {showHistory && <HistoryModal onOpen={open} onClose={() => setShowHistory(false)} currentId={conversationId} />}
    </section>
  )
}

type EntryProps = { entry: Entry; actionable: boolean; busy: boolean; onApprove: () => void; onReject: () => void }

function EntryView({ entry, actionable, busy, onApprove, onReject }: EntryProps) {
  const [open, setOpen] = useState(false)
  switch (entry.kind) {
    case 'user': return <div className="d-user">{entry.text}</div>
    case 'text': return <div className="d-text"><Markdown>{entry.text}</Markdown></div>
    case 'thinking': return <details className="d-thinking"><summary>{tx({ en: 'reasoning', pt: 'raciocínio' })}</summary><pre>{entry.text}</pre></details>
    case 'status': return <div className="muted" style={{ fontSize: 12 }}>{entry.text}</div>
    case 'error': return <div className="d-error"><AlertTriangle size={14} /> {entry.text}</div>
    case 'tool': {
      const blocked = entry.result?.isError && /Bloqueado pelo workStuff|não roda por aqui|hook error/.test(entry.result.content)
      return (
        <div className="d-tool">
          <button onClick={() => setOpen(o => !o)} title={tx({ en: 'Show the command output', pt: 'Mostrar a saída do comando' })}>
            <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : undefined }} />
            <span className="mono">{entry.command}</span>
            {blocked && <span className="badge badge-warn">{tx({ en: 'blocked', pt: 'bloqueado' })}</span>}
            {!entry.result && <span className="muted">…</span>}
          </button>
          {open && entry.result && <pre className="mono">{entry.result.content.slice(0, 6000)}</pre>}
        </div>
      )
    }
    case 'mutation':
      return (
        <div className={`d-pending ${entry.allowed ? '' : 'is-denied'}`}>
          <div className="row"><ShieldAlert size={16} /><b>{entry.allowed ? tx({ en: `Write action (${entry.action}): confirm?`, pt: `Ação de escrita (${entry.action}): confirmar?` }) : tx({ en: `Action blocked: ${entry.reason}`, pt: `Ação bloqueada: ${entry.reason}` })}</b></div>
          <code className="code">{entry.line}</code>
          <div className="row">
            {entry.allowed && actionable ? (
              <>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={onApprove} title={tx({ en: "The panel runs this command, without a shell, in the conversation's cluster", pt: 'O painel executa este comando, sem shell, no cluster da conversa' })}><Check size={13} /> {tx({ en: 'Confirm and run', pt: 'Confirmar e executar' })}</button>
                <button className="btn btn-sm" disabled={busy} onClick={onReject}><X size={13} /> {tx({ en: 'Refuse', pt: 'Recusar' })}</button>
              </>
            ) : (
              <>
                <span className="muted" style={{ fontSize: 12 }}>{entry.allowed ? tx({ en: 'proposal closed (the conversation moved on or it was already answered)', pt: 'proposta encerrada (a conversa seguiu ou já foi respondida)' }) : tx({ en: 'If you are sure, run it yourself:', pt: 'Se tiver certeza, rode por conta própria:' })}</span>
                <CopyButton value={entry.line} label={tx({ en: 'Copy command', pt: 'Copiar comando' })} />
              </>
            )}
          </div>
        </div>
      )
    case 'executed':
      return (
        <div className={`d-executed ${entry.ok ? 'is-ok' : 'is-fail'}`}>
          <div className="row">{entry.ok ? <Check size={14} /> : <X size={14} />}<b>{entry.ok ? tx({ en: 'Executed', pt: 'Executado' }) : tx({ en: 'Failed', pt: 'Falhou' })}:</b><span className="mono">{entry.line}</span></div>
          {entry.output && <pre className="mono">{entry.output}</pre>}
        </div>
      )
  }
}

function HistoryModal({ onOpen, onClose, currentId }: { onOpen: (c: ConversationSummary) => void; onClose: () => void; currentId: string | null }) {
  const list = useAsync(fetchConversations)
  const toast = useToast()
  const [confirming, setConfirming] = useState<string | null>(null)

  const remove = async (id: string) => {
    try {
      await deleteConversation(id)
      list.reload()
    } catch (e) {
      toast((e as Error).message)
    }
    setConfirming(null)
  }

  return (
    <Modal title={tx({ en: 'Cluster Doctor conversations', pt: 'Conversas do Cluster Doctor' })} onClose={onClose} width={640}>
      {list.data?.length === 0 && <p className="muted">{tx({ en: 'No conversation yet.', pt: 'Nenhuma conversa ainda.' })}</p>}
      <div className="stack" style={{ ['--gap' as string]: '6px' }}>
        {list.data?.map(c => (
          <div key={c.id} className={`card interactive kube-item ${c.id === currentId ? 'is-current' : ''}`} onClick={() => onOpen(c)}>
            <div className="spacer stack" style={{ ['--gap' as string]: '2px', minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>{c.title}</b>
              <span className="muted mono" style={{ fontSize: 11.5 }}>{c.kubeconfigId} · {tx({ en: `${c.messages} question(s)`, pt: `${c.messages} pergunta(s)` })} · {relTime(c.updatedAt)}{c.pending ? tx({ en: ' · waiting for confirmation', pt: ' · aguardando confirmação' }) : ''}</span>
            </div>
            <EnvStamp env={c.environment as never} />
            {c.running && <span className="badge badge-signal">{tx({ en: 'answering', pt: 'respondendo' })}</span>}
            <button
              className={`btn btn-sm ${confirming === c.id ? 'btn-danger' : 'btn-ghost btn-icon'}`}
              onClick={e => (e.stopPropagation(), confirming === c.id ? remove(c.id) : setConfirming(c.id))}
              title={tx({ en: 'Delete this conversation from the history', pt: 'Apagar esta conversa do histórico' })}
            >
              <Trash2 size={13} />{confirming === c.id && tx({ en: ' delete?', pt: ' apagar?' })}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
