import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  GitBranch,
  Maximize2,
  Minimize2,
  Play,
  RotateCw,
  Square,
  Terminal,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Chips } from '@/ui'
import { runFactoryAction, useLiveTask, type FactoryAction, type SessionEvent } from './factoryRun'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'

type LogEntry = {
  id: string
  time: string
  type: 'status' | 'text' | 'tool' | 'gate' | 'done' | 'error'
  title: string
  detail?: string
  tool?: string
  callId?: string
  isError?: boolean
}

type Props = {
  task: FactoryTask
  onClose: () => void
  onUpdate: () => void
  initialAction?: 'plan' | 'approve-plan' | null
  onOpenTrace?: (task: FactoryTask) => void
  onOpenReview?: (task: FactoryTask) => void
}

// One persisted session event -> one console line. A tool-result is folded into the
// tool line it answers, so a call and its output read together.
function toLogEntries(events: SessionEvent[]): LogEntry[] {
  const entries: LogEntry[] = []
  events.forEach((ev, i) => {
    const time = ev.createdAt ? fmtTime(new Date(ev.createdAt)) : ''
    const id = `ev-${i}`
    if (ev.type === 'tool') {
      const input = typeof ev.input === 'object' ? JSON.stringify(ev.input, null, 2) : String(ev.input ?? '')
      entries.push({ id, time, type: 'tool', title: `Ferramenta: ${ev.tool}`, detail: input, tool: ev.tool, callId: ev.id })
    } else if (ev.type === 'tool-result') {
      const call = [...entries].reverse().find(e => e.callId === ev.id)
      if (!call) return
      call.detail = `${call.detail}\n\n── saída ──\n${(ev.content ?? '').slice(0, 4000)}`
      call.isError = ev.isError
    } else if (ev.type === 'text' && ev.text) {
      entries.push({ id, time, type: 'text', title: 'Saída do agente', detail: ev.text })
    } else if (ev.type === 'error') {
      entries.push({ id, time, type: 'error', title: 'Erro na execução', detail: ev.message, isError: true })
    } else if (ev.type === 'status' && ev.message) {
      entries.push({ id, time, type: 'status', title: ev.message })
    }
  })
  return entries
}

function fmtTime(d = new Date()) {
  return d.toTimeString().split(' ')[0]
}

export function FactoryLiveConsole({
  task: initialTask,
  onClose,
  onUpdate,
  initialAction = null,
  onOpenTrace,
  onOpenReview,
}: Props) {
  const [runningAction, setRunningAction] = useState<FactoryAction | null>(initialAction)
  const { task, events, running: isRunning, refresh } = useLiveTask(initialTask, Boolean(runningAction))
  // "Limpar" hides what is on screen; the session itself stays on the server
  const [hiddenUpTo, setHiddenUpTo] = useState(0)
  const allLogs = useMemo(() => toLogEntries(events), [events])
  const logs = allLogs.slice(hiddenUpTo)
  const [filter, setFilter] = useState<'all' | 'tools' | 'status'>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const errorMessage = actionError ?? task.error ?? null
  const logContainerRef = useRef<HTMLDivElement | null>(null)
  const [stopping, setStopping] = useState(false)

  const stopExecution = async () => {
    if (stopping) return
    setStopping(true)
    try {
      await api.post(`/factory/tasks/${task.id}/cancel`, {})
      refresh()
      onUpdate()
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setStopping(false)
    }
  }

  // Progress arrives through the polled session; here only the outcome matters
  const executeAction = async (action: 'plan' | 'approve-plan') => {
    setRunningAction(action)
    setActionError(null)
    try {
      const outcome = await runFactoryAction(task.id, action, { onStarted: onUpdate })
      if (outcome.error) setActionError(outcome.error)
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setRunningAction(null)
      refresh()
      onUpdate()
    }
  }

  // Executa initialAction se fornecido na abertura. StrictMode monta o efeito duas vezes
  // no dev; sem a trava o segundo POST leva 409 e a tela mostra erro com a execução rodando.
  const startedRef = useRef(false)
  useEffect(() => {
    if (initialAction && !startedRef.current) {
      startedRef.current = true
      executeAction(initialAction)
    }
  }, [])

  // Auto-scroll para o final quando novos logs chegam
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const filteredLogs = logs.filter(entry => {
    if (filter === 'tools') return entry.type === 'tool'
    if (filter === 'status') return entry.type === 'status' || entry.type === 'error' || entry.type === 'done'
    return true
  })

  const handleCopyLogs = () => {
    const text = logs
      .map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.title}${l.detail ? '\n' + l.detail : ''}`)
      .join('\n\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }


  return (
    <div
      className="overlay"
      style={{
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(5, 8, 14, 0.75)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => e.target === e.currentTarget && !isRunning && onClose()}
    >
      <div
        style={{
          width: expanded ? '96vw' : '860px',
          maxWidth: '100%',
          height: expanded ? '92vh' : '620px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-pop)',
          overflow: 'hidden',
          transition: 'width 0.2s, height 0.2s',
          color: 'var(--ink)',
        }}
      >
        {/* Cabeçalho do Console */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line)',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Terminal size={18} style={{ color: isRunning ? 'var(--info)' : 'var(--muted)' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                  Console de Execução
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--surface-3)',
                    color: 'var(--fx-architect)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  {task.id}
                </span>
                {isRunning && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      color: 'var(--ok)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <span className="live-dot" />
                    executando...
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 480,
                }}
                title={task.title}
              >
                {task.title}
              </div>
            </div>
          </div>

          {/* Botões de Ação na Barra */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isRunning && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={stopExecution}
                disabled={stopping}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title="Interromper a execução atual"
              >
                <Square size={12} fill="currentColor" /> {stopping ? 'Parando...' : 'Parar'}
              </button>
            )}

            {onOpenTrace && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  onClose()
                  onOpenTrace(task)
                }}
                title="Abrir linha do tempo detalhada"
                style={{ fontSize: 11, padding: '4px 8px', gap: 4 }}
              >
                <Activity size={12} /> Linha do Tempo
              </button>
            )}

            {onOpenReview && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  onClose()
                  onOpenReview(task)
                }}
                title="Abrir revisão da tarefa"
                style={{ fontSize: 11, padding: '4px 8px', gap: 4 }}
              >
                <GitBranch size={12} /> Revisar
              </button>
            )}

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? 'Reduzir janela' : 'Expandir tela cheia'}
              style={{ padding: 6 }}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              title="Fechar (Esc)"
              style={{ padding: 6 }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Sub-barra com Filtros e Ferramentas do Terminal */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 18px',
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line)',
            fontSize: 12,
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--muted)', marginRight: 4 }}>Filtro:</span>
            <Chips
              options={[
                { id: 'all', label: 'Todos', count: logs.length },
                { id: 'tools', label: 'Ferramentas', count: logs.filter(l => l.type === 'tool').length },
                { id: 'status', label: 'Status / Erros' },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--muted)' }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={e => setAutoScroll(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Auto-scroll
            </label>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleCopyLogs}
              title="Copiar logs completos"
              style={{ fontSize: 11, padding: '2px 8px', gap: 4 }}
            >
              {copied ? <Check size={12} style={{ color: 'var(--ok)' }} /> : <Copy size={12} />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setHiddenUpTo(allLogs.length)}
              title="Limpar visualização de logs"
              style={{ fontSize: 11, padding: '2px 8px', gap: 4 }}
            >
              <Trash2 size={12} /> Limpar
            </button>
          </div>
        </div>

        {/* Banner de Erro Ativo */}
        {errorMessage && (
          <div
            style={{
              padding: '10px 18px',
              background: 'var(--crit-soft)',
              borderBottom: '1px solid color-mix(in srgb, var(--crit) 30%, transparent)',
              color: 'var(--crit)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertTriangle size={15} />
            <span style={{ flex: 1, fontFamily: 'var(--font-mono)' }}>{errorMessage}</span>
          </div>
        )}

        {/* Corpo dos Logs (Terminal Viewer) */}
        <div
          ref={logContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 18px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.6,
            background: 'var(--bg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
              Nenhum log registrado para esta sessão até o momento.
            </div>
          ) : (
            filteredLogs.map(entry => {
              const isTool = entry.type === 'tool'
              const isError = entry.type === 'error' || entry.isError
              const isDone = entry.type === 'done'
              const isText = entry.type === 'text'

              return (
                <div
                  key={entry.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: isError
                      ? 'var(--crit-soft)'
                      : isDone
                      ? 'var(--ok-soft)'
                      : isTool
                      ? 'var(--info-soft)'
                      : 'var(--surface)',
                    borderLeft: isError
                      ? '3px solid var(--crit)'
                      : isDone
                      ? '3px solid var(--ok)'
                      : isTool
                      ? '3px solid var(--info)'
                      : '3px solid var(--line-hi)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 11 }}>
                    <span style={{ opacity: 0.6 }}>[{entry.time}]</span>
                    {isTool && <Wrench size={11} style={{ color: 'var(--info)' }} />}
                    {isDone && <CheckCircle2 size={11} style={{ color: 'var(--ok)' }} />}
                    {isError && <AlertTriangle size={11} style={{ color: 'var(--crit)' }} />}
                    <span
                      style={{
                        fontWeight: 600,
                        color: isError
                          ? 'var(--crit)'
                          : isDone
                          ? 'var(--ok)'
                          : isTool
                          ? 'var(--info)'
                          : 'var(--fx-architect)',
                      }}
                    >
                      {entry.title}
                    </span>
                  </div>

                  {entry.detail && (
                    <pre
                      style={{
                        margin: '6px 0 0',
                        padding: '6px 8px',
                        background: 'var(--surface)',
                        borderRadius: 4,
                        color: isText ? 'var(--ink-2)' : 'var(--muted)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: 11,
                        maxHeight: isText ? 320 : 180,
                        overflowY: 'auto',
                      }}
                    >
                      {entry.detail}
                    </pre>
                  )}
                </div>
              )
            })
          )}

          {isRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--info)', padding: '6px 0' }}>
              <span className="spin" style={{ display: 'inline-block' }}>◓</span>
              <span>Processando etapa com o agente...</span>
            </div>
          )}
        </div>

        {/* Rodapé com Ações de Execução Rápidas */}
        <div
          style={{
            padding: '12px 18px',
            background: 'var(--surface-2)',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
            <span>Worktree: <b className="mono" style={{ color: 'var(--ink)' }}>{task.branchName}</b></span>
            <span>·</span>
            <span>Provedor: <b style={{ color: 'var(--fx-architect)' }}>{task.provider}</b></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isRunning && (
              <button
                type="button"
                className="btn btn-sm btn-danger-solid"
                onClick={stopExecution}
                disabled={stopping}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Square size={13} fill="currentColor" /> {stopping ? 'Parando...' : 'Parar Execução'}
              </button>
            )}

            {task.state === 'intake' && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => executeAction('plan')}
                disabled={isRunning}
              >
                <Play size={13} /> {isRunning ? 'Planejando...' : 'Iniciar Planejamento com Architect'}
              </button>
            )}

            {task.state === 'waiting_approval' && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => executeAction('approve-plan')}
                disabled={isRunning}
              >
                <Play size={13} /> {isRunning ? 'Construindo...' : 'Aprovar Plano e Iniciar Construção'}
              </button>
            )}

            {/* Only from 'error': a failed adjust lands in review with its work intact */}
            {task.state === 'error' && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => executeAction(task.plan ? 'approve-plan' : 'plan')}
                disabled={isRunning}
              >
                <RotateCw size={13} /> {isRunning ? 'Tentando...' : 'Tentar Novamente'}
              </button>
            )}

            <button type="button" className="btn btn-sm" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
