import { useState, useEffect, useRef } from 'react'
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
import { streamPost } from '@/lib/stream'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'

type LogEntry = {
  id: string
  time: string
  type: 'status' | 'text' | 'tool' | 'gate' | 'done' | 'error'
  title: string
  detail?: string
  tool?: string
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

export function FactoryLiveConsole({
  task,
  onClose,
  onUpdate,
  initialAction = null,
  onOpenTrace,
  onOpenReview,
}: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [runningAction, setRunningAction] = useState<string | null>(initialAction)
  const [filter, setFilter] = useState<'all' | 'tools' | 'status'>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(task.error || null)
  const logContainerRef = useRef<HTMLDivElement | null>(null)

  const fmtTime = (d = new Date()) => {
    return d.toTimeString().split(' ')[0]
  }

  // Carrega histórico de eventos prévios se existirem
  useEffect(() => {
    let unmounted = false
    api.get<any[]>(`/factory/tasks/${task.id}/session`)
      .then(events => {
        if (unmounted || !Array.isArray(events) || events.length === 0) return
        const mapped: LogEntry[] = events.map((ev, i) => {
          const time = ev.createdAt ? fmtTime(new Date(ev.createdAt)) : fmtTime()
          if (ev.type === 'tool') {
            return {
              id: `hist-${i}`,
              time,
              type: 'tool',
              title: `Execução de Ferramenta: ${ev.tool}`,
              detail: typeof ev.input === 'object' ? JSON.stringify(ev.input, null, 2) : String(ev.input ?? ''),
              tool: ev.tool,
              isError: Boolean(ev.isError),
            }
          }
          if (ev.type === 'status') {
            return {
              id: `hist-${i}`,
              time,
              type: 'status',
              title: ev.message || 'Atualização de status',
            }
          }
          if (ev.type === 'error') {
            return {
              id: `hist-${i}`,
              time,
              type: 'error',
              title: 'Erro na execução',
              detail: ev.message,
              isError: true,
            }
          }
          if (ev.type === 'text') {
            return {
              id: `hist-${i}`,
              time,
              type: 'text',
              title: 'Saída do agente',
              detail: ev.text,
            }
          }
          return {
            id: `hist-${i}`,
            time,
            type: 'status',
            title: ev.type || 'Evento',
            detail: ev.message || ev.text,
          }
        })
        setLogs(prev => (prev.length === 0 ? mapped : prev))
      })
      .catch(() => {})

    return () => {
      unmounted = true
    }
  }, [task.id])

  const [stopping, setStopping] = useState(false)

  const stopExecution = async () => {
    if (stopping) return
    setStopping(true)
    try {
      await api.post(`/factory/tasks/${task.id}/cancel`, {})
      setLogs(prev => [
        ...prev,
        {
          id: `stop-${Date.now()}`,
          time: fmtTime(),
          type: 'status',
          title: 'Solicitação de cancelamento enviada ao servidor.',
        },
      ])
      onUpdate()
    } catch (err) {
      setErrorMessage((err as Error).message)
    } finally {
      setStopping(false)
    }
  }

  // Inicia ação sob demanda
  const executeAction = async (action: 'plan' | 'approve-plan') => {
    setRunningAction(action)
    setErrorMessage(null)

    const now = fmtTime()
    const startMsg: LogEntry = {
      id: `act-${Date.now()}`,
      time: now,
      type: 'status',
      title: action === 'plan'
        ? 'Iniciando análise arquitetural com Architect...'
        : 'Iniciando esteira determinística de construção e testes...',
    }
    setLogs(prev => [...prev, startMsg])

    try {
      await streamPost(
        `/factory/tasks/${task.id}/${action}`,
        (ev: any) => {
          const evTime = fmtTime()
          if (ev.type === 'status') {
            setLogs(prev => [
              ...prev,
              {
                id: `ev-${Date.now()}-${Math.random()}`,
                time: evTime,
                type: 'status',
                title: ev.message,
              },
            ])
          } else if (ev.type === 'tool') {
            setLogs(prev => [
              ...prev,
              {
                id: `ev-${Date.now()}-${Math.random()}`,
                time: evTime,
                type: 'tool',
                title: `Ferramenta: ${ev.tool}`,
                detail: typeof ev.input === 'object' ? JSON.stringify(ev.input, null, 2) : String(ev.input ?? ''),
                tool: ev.tool,
              },
            ])
          } else if (ev.type === 'text' && ev.text) {
            setLogs(prev => {
              const last = prev[prev.length - 1]
              if (last && last.type === 'text') {
                return [
                  ...prev.slice(0, -1),
                  { ...last, detail: (last.detail || '') + ev.text },
                ]
              }
              return [
                ...prev,
                {
                  id: `ev-${Date.now()}-${Math.random()}`,
                  time: evTime,
                  type: 'text',
                  title: 'Raciocínio / Código',
                  detail: ev.text,
                },
              ]
            })
          } else if (ev.type === 'error') {
            setErrorMessage(ev.message)
            setLogs(prev => [
              ...prev,
              {
                id: `ev-${Date.now()}-${Math.random()}`,
                time: evTime,
                type: 'error',
                title: 'Falha reportada',
                detail: ev.message,
                isError: true,
              },
            ])
          } else if (ev.type === 'cancelled') {
            setLogs(prev => [
              ...prev,
              {
                id: `ev-${Date.now()}-${Math.random()}`,
                time: evTime,
                type: 'status',
                title: ev.message || 'Execução interrompida pelo usuário',
              },
            ])
            onUpdate()
          } else if (ev.type === 'done') {
            setLogs(prev => [
              ...prev,
              {
                id: `ev-${Date.now()}-${Math.random()}`,
                time: evTime,
                type: 'done',
                title: action === 'plan'
                  ? 'Planejamento concluído com sucesso. Aguardando aprovação.'
                  : 'Construção e testes concluídos com sucesso. Pronto para revisão.',
              },
            ])
            onUpdate()
          }
        }
      )
    } catch (err) {
      const msg = (err as Error).message
      setErrorMessage(msg)
      setLogs(prev => [
        ...prev,
        {
          id: `ev-err-${Date.now()}`,
          time: fmtTime(),
          type: 'error',
          title: 'Erro de comunicação',
          detail: msg,
          isError: true,
        },
      ])
    } finally {
      setRunningAction(null)
      onUpdate()
    }
  }

  // Executa initialAction se fornecido na abertura
  useEffect(() => {
    if (initialAction) {
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

  const isRunning = Boolean(runningAction) || Boolean(task.executing) || ['planning', 'building', 'qa_security'].includes(task.state)

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
          background: '#090d16',
          border: '1px solid #232c3d',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
          overflow: 'hidden',
          transition: 'width 0.2s, height 0.2s',
          color: '#f2f5fa',
        }}
      >
        {/* Cabeçalho do Console */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            background: '#101622',
            borderBottom: '1px solid #232c3d',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Terminal size={18} style={{ color: isRunning ? '#5ad2dd' : '#8b9cb6' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f2f5fa' }}>
                  Console de Execução
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: 'ui-monospace, monospace',
                    background: '#192334',
                    color: '#c084fc',
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
                      color: '#4ade80',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#4ade80',
                        boxShadow: '0 0 8px #4ade80',
                        animation: 'pulse 1.5s infinite',
                      }}
                    />
                    executando...
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#8b9cb6',
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
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
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
            background: '#0d121c',
            borderBottom: '1px solid #1a2230',
            fontSize: 12,
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#8b9cb6', marginRight: 4 }}>Filtro:</span>
            <button
              type="button"
              onClick={() => setFilter('all')}
              style={{
                background: filter === 'all' ? '#1f2b3e' : 'transparent',
                color: filter === 'all' ? '#f2f5fa' : '#8b9cb6',
                border: '1px solid #232c3d',
                borderRadius: 4,
                padding: '2px 8px',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Todos ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('tools')}
              style={{
                background: filter === 'tools' ? '#1f2b3e' : 'transparent',
                color: filter === 'tools' ? '#5ad2dd' : '#8b9cb6',
                border: '1px solid #232c3d',
                borderRadius: 4,
                padding: '2px 8px',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Ferramentas ({logs.filter(l => l.type === 'tool').length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('status')}
              style={{
                background: filter === 'status' ? '#1f2b3e' : 'transparent',
                color: filter === 'status' ? '#f2f5fa' : '#8b9cb6',
                border: '1px solid #232c3d',
                borderRadius: 4,
                padding: '2px 8px',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Status / Erros
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#8b9cb6' }}>
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
              {copied ? <Check size={12} style={{ color: '#4ade80' }} /> : <Copy size={12} />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setLogs([])}
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
              background: 'rgba(255, 111, 103, 0.12)',
              borderBottom: '1px solid rgba(255, 111, 103, 0.3)',
              color: '#ff6f67',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertTriangle size={15} />
            <span style={{ flex: 1, fontFamily: 'ui-monospace, monospace' }}>{errorMessage}</span>
          </div>
        )}

        {/* Corpo dos Logs (Terminal Viewer) */}
        <div
          ref={logContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 18px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.6,
            background: '#06080f',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#57657a' }}>
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
                      ? 'rgba(255, 111, 103, 0.08)'
                      : isDone
                      ? 'rgba(74, 222, 128, 0.06)'
                      : isTool
                      ? 'rgba(90, 210, 221, 0.05)'
                      : 'rgba(255, 255, 255, 0.02)',
                    borderLeft: isError
                      ? '3px solid #ff6f67'
                      : isDone
                      ? '3px solid #4ade80'
                      : isTool
                      ? '3px solid #5ad2dd'
                      : '3px solid #3b475c',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8b9cb6', fontSize: 11 }}>
                    <span style={{ opacity: 0.6 }}>[{entry.time}]</span>
                    {isTool && <Wrench size={11} style={{ color: '#5ad2dd' }} />}
                    {isDone && <CheckCircle2 size={11} style={{ color: '#4ade80' }} />}
                    {isError && <AlertTriangle size={11} style={{ color: '#ff6f67' }} />}
                    <span
                      style={{
                        fontWeight: 600,
                        color: isError
                          ? '#ff6f67'
                          : isDone
                          ? '#4ade80'
                          : isTool
                          ? '#5ad2dd'
                          : '#c084fc',
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
                        background: '#090d16',
                        borderRadius: 4,
                        color: isText ? '#c8d4e4' : '#8b9cb6',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#5ad2dd', padding: '6px 0' }}>
              <span style={{ animation: 'spin 1s linear infinite' }}>◓</span>
              <span>Processando etapa com o agente...</span>
            </div>
          )}
        </div>

        {/* Rodapé com Ações de Execução Rápidas */}
        <div
          style={{
            padding: '12px 18px',
            background: '#101622',
            borderTop: '1px solid #232c3d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8b9cb6' }}>
            <span>Worktree: <b className="mono" style={{ color: '#f2f5fa' }}>{task.branchName}</b></span>
            <span>·</span>
            <span>Provedor: <b style={{ color: '#c084fc' }}>{task.provider}</b></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isRunning && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={stopExecution}
                disabled={stopping}
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
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

            {(task.state === 'error' || errorMessage) && (
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
