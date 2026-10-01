import { AlertTriangle, Check, ChevronRight, History, Plus, Send, ShieldAlert, ShieldCheck, Square, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CopyButton, Markdown, Modal, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { EnvBadge } from './KubeconfigBar'
import { useClusterShared } from './api'
import {
  approveDoctor, askDoctor, deleteConversation, fetchConversation, fetchConversations, fetchStatus, rejectDoctor, stopConversation,
  type ConversationSummary, type DoctorEvent,
} from './doctorApi'

type Entry =
  | { kind: 'user' | 'text' | 'thinking'; text: string }
  | { kind: 'tool'; id: string; command: string; result?: { isError: boolean; content: string } }
  | { kind: 'status' | 'error'; text: string }
  | { kind: 'mutation'; line: string; action: string; allowed: boolean; reason: string | null }
  | { kind: 'executed'; line: string; ok: boolean; output: string }

const SUGGESTIONS = ['Quais pods estão com problema neste cluster?', 'Investiga os eventos recentes do namespace', 'Algum node sob pressão de memória ou disco?']

// Uma função para evento ao vivo e para o histórico: a conversa reaberta fica igual à que foi vista.
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

  // Chaves de propósito: em Chrome novo scrollIntoView devolve uma Promise, e o React trataria como cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [entries])
  useEffect(() => () => abort.current?.abort(), [])
  // Trocar de cluster começa conversa nova: a conversa é presa ao kubeconfig e ao contexto em que nasceu.
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
        <span>{status.data.reason} <Link to="/configuracoes/ia">Abrir Configurações</Link></span>
      </div>
    )
  }
  if (!session) return <div className="callout callout-info"><ShieldCheck size={16} />Conecte um cluster para conversar com o Cluster Doctor.</div>

  const env = session.kubeconfig.environment
  return (
    <section className="doctor">
      <header className="doctor-head">
        <b>Cluster Doctor</b>
        <span className="mono">{session.kubeconfig.id.replace(/\.(ya?ml|kubeconfig)$/, '')}</span>
        <EnvBadge env={env} />
        {(env === 'PRO' || !env) && <span className="badge badge-crit" title="Nenhuma escrita é proposta para execução neste ambiente">somente leitura</span>}
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 11.5 }} title="O agente só roda leituras do kubectl; escrita é proposta e executada pelo painel depois da sua confirmação">
          <ShieldCheck size={12} /> leitura com trava; escrita só com sua confirmação
        </span>
        <button className="btn btn-sm" onClick={() => setShowHistory(true)}><History size={13} /> Histórico</button>
        <button className="btn btn-sm" disabled={running} onClick={() => (setConversationId(null), setEntries([]), setPending(null))}><Plus size={13} /> Nova</button>
      </header>

      <div className="doctor-body">
        {entries.length === 0 && (
          <div className="stack" style={{ alignItems: 'center', padding: '32px 0' }}>
            <span className="muted">Descreva o problema ou comece por uma sugestão:</span>
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
        {running && <div className="muted" style={{ fontSize: 12 }}>investigando…</div>}
        <div ref={bottom} />
      </div>

      <form className="doctor-input" onSubmit={e => (e.preventDefault(), send(input))}>
        <textarea
          className="textarea"
          rows={2}
          value={input}
          placeholder="descreva o problema do cluster… (Enter envia, Shift+Enter quebra linha)"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send(input))}
        />
        {running
          ? <button className="btn" type="button" onClick={stop} title="Interrompe o agente; o que já chegou fica na conversa"><Square size={13} /> Parar</button>
          : <button className="btn btn-primary" type="submit" disabled={!input.trim()}><Send size={14} /> Enviar</button>}
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
    case 'thinking': return <details className="d-thinking"><summary>raciocínio</summary><pre>{entry.text}</pre></details>
    case 'status': return <div className="muted" style={{ fontSize: 12 }}>{entry.text}</div>
    case 'error': return <div className="d-error"><AlertTriangle size={14} /> {entry.text}</div>
    case 'tool': {
      const blocked = entry.result?.isError && /Bloqueado pelo workStuff|não roda por aqui|hook error/.test(entry.result.content)
      return (
        <div className="d-tool">
          <button onClick={() => setOpen(o => !o)} title="Mostrar a saída do comando">
            <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : undefined }} />
            <span className="mono">{entry.command}</span>
            {blocked && <span className="badge badge-warn">bloqueado</span>}
            {!entry.result && <span className="muted">…</span>}
          </button>
          {open && entry.result && <pre className="mono">{entry.result.content.slice(0, 6000)}</pre>}
        </div>
      )
    }
    case 'mutation':
      return (
        <div className={`d-pending ${entry.allowed ? '' : 'is-denied'}`}>
          <div className="row"><ShieldAlert size={16} /><b>{entry.allowed ? `Ação de escrita (${entry.action}): confirmar?` : `Ação bloqueada: ${entry.reason}`}</b></div>
          <code className="code">{entry.line}</code>
          <div className="row">
            {entry.allowed && actionable ? (
              <>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={onApprove} title="O painel executa este comando, sem shell, no cluster da conversa"><Check size={13} /> Confirmar e executar</button>
                <button className="btn btn-sm" disabled={busy} onClick={onReject}><X size={13} /> Recusar</button>
              </>
            ) : (
              <>
                <span className="muted" style={{ fontSize: 12 }}>{entry.allowed ? 'proposta encerrada (a conversa seguiu ou já foi respondida)' : 'Se tiver certeza, rode por conta própria:'}</span>
                <CopyButton value={entry.line} label="Copiar comando" />
              </>
            )}
          </div>
        </div>
      )
    case 'executed':
      return (
        <div className={`d-executed ${entry.ok ? 'is-ok' : 'is-fail'}`}>
          <div className="row">{entry.ok ? <Check size={14} /> : <X size={14} />}<b>{entry.ok ? 'Executado' : 'Falhou'}:</b><span className="mono">{entry.line}</span></div>
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
    <Modal title="Conversas do Cluster Doctor" onClose={onClose} width={640}>
      {list.data?.length === 0 && <p className="muted">Nenhuma conversa ainda.</p>}
      <div className="stack" style={{ ['--gap' as string]: '6px' }}>
        {list.data?.map(c => (
          <div key={c.id} className={`card interactive kube-item ${c.id === currentId ? 'is-current' : ''}`} onClick={() => onOpen(c)}>
            <div className="spacer stack" style={{ ['--gap' as string]: '2px', minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>{c.title}</b>
              <span className="muted mono" style={{ fontSize: 11.5 }}>{c.kubeconfigId} · {c.messages} pergunta(s) · {relTime(c.updatedAt)}{c.pending ? ' · aguardando confirmação' : ''}</span>
            </div>
            <EnvBadge env={c.environment as never} />
            {c.running && <span className="badge badge-signal">respondendo</span>}
            <button
              className={`btn btn-sm ${confirming === c.id ? 'btn-danger' : 'btn-ghost btn-icon'}`}
              onClick={e => (e.stopPropagation(), confirming === c.id ? remove(c.id) : setConfirming(c.id))}
              title="Apagar esta conversa do histórico"
            >
              <Trash2 size={13} />{confirming === c.id && ' apagar?'}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
