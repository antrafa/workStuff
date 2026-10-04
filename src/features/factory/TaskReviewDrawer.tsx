import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Cpu,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  Play,
  RotateCw,
  ShieldAlert,
  Square,
  Trash2,
} from 'lucide-react'
import { Markdown, Modal } from '@/ui'
import { api } from '@/lib/api'
import { isTaskRunning, runFactoryAction, type FactoryAction } from './factoryRun'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'
import { TraceTimeline } from './TraceTimeline'
import { FactoryStatusChip } from './timeline/FactoryStatusChip'

type Props = {
  task: FactoryTask | null
  onClose: () => void
  onUpdate: () => void
}

type Tab = 'diff' | 'qa' | 'security' | 'trace'

function diffLineColor(line: string): string | undefined {
  if (line.startsWith('+++') || line.startsWith('---')) return undefined
  if (line.startsWith('+')) return 'var(--ok)'
  if (line.startsWith('-')) return 'var(--crit)'
  return undefined
}

export function TaskReviewDrawer({ task, onClose, onUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('diff')
  const [feedback, setFeedback] = useState('')
  const [processing, setProcessing] = useState(false)
  const [logText, setLogText] = useState('')
  const logRef = useRef<HTMLPreElement | null>(null)
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logText])
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [taskProvider, setTaskProvider] = useState<'claude' | 'codex' | 'agy'>(task?.provider || 'agy')

  // Every hook must run before this early return, or opening a card crashes the drawer
  const [stopping, setStopping] = useState(false)

  if (!task) return null

  const isWaitingApproval = task.state === 'waiting_approval'
  const isReview = task.state === 'review'
  const isError = task.state === 'error' || Boolean(task.error)
  const isAuthError =
    task.error && /authenticate|oauth|expired|unauthorized|401|api_key|token/i.test(task.error)
  const isExecuting = processing || isTaskRunning(task)

  const handleProviderChange = async (newProvider: 'claude' | 'codex' | 'agy') => {
    setTaskProvider(newProvider)
    try {
      await api.patch(`/factory/tasks/${task.id}`, { provider: newProvider })
      onUpdate()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleCancelExecution = async () => {
    if (stopping) return
    setStopping(true)
    try {
      await api.post(`/factory/tasks/${task.id}/cancel`, {})
      setStatusMessage('Solicitação de cancelamento enviada ao servidor.')
      onUpdate()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setStopping(false)
    }
  }

  // One runner for the three actions; text and status stream into the logs tab
  const startAction = async (action: FactoryAction, starting: string, finished: string, body?: unknown) => {
    setProcessing(true)
    setError(null)
    setLogText('')
    setStatusMessage(starting)
    try {
      const outcome = await runFactoryAction(task.id, action, {
        body,
        onStarted: onUpdate,
        onEvent: e => {
          if (e.type === 'status' && e.message) setStatusMessage(e.message)
          if (e.type === 'text' && e.text) setLogText(prev => prev + e.text)
        },
      })
      if (outcome.error) setError(outcome.error)
      if (outcome.cancelled) setStatusMessage('Execução interrompida pelo usuário.')
      if (outcome.ok) {
        setStatusMessage(finished)
        if (action === 'adjust') setFeedback('')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProcessing(false)
      onUpdate()
    }
  }

  const handleRetryPlan = () => startAction('plan', 'Re-executando análise com o Architect...', 'Plano técnico gerado com sucesso!')
  const handleApprovePlan = () =>
    startAction('approve-plan', 'Iniciando esteira determinística de construção...', 'Construção, portões de teste e auditoria finalizados!')
  // Same rule as the board: with a plan, retry the build; without one, plan again.
  // In review (a failed adjust) the work is intact: the way forward is a new adjust.
  const retry = task.state === 'review' ? null : task.plan ? handleApprovePlan : handleRetryPlan

  const handleSendFeedback = () => {
    if (!feedback.trim()) return
    return startAction('adjust', 'Aplicando ajustes na worktree...', 'Ajustes aplicados com sucesso!', { feedback })
  }

  const handleOpenEditor = async () => {
    try {
      await api.post(`/factory/tasks/${task.id}/open-editor`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleFinish = async (mode: 'mr' | 'local_merge') => {
    if (mode === 'local_merge') {
      if (!confirm(`Deseja mesclar a branch ${task.branchName} diretamente na branch ${task.baseBranch} do seu repositório local? Certifique-se de que não possui alterações não salvas no workspace.`)) {
        return
      }
    }
    setProcessing(true)
    setError(null)
    try {
      const res = await api.post<FactoryTask & { warning?: string }>(`/factory/tasks/${task.id}/finish`, { mode })
      onUpdate()
      if (res?.prUrl) {
        window.open(res.prUrl, '_blank')
      }
      if (res?.warning) {
        setError(res.warning)
        return
      }
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Deseja realmente descartar esta tarefa e limpar a worktree?')) return
    setProcessing(true)
    try {
      await api.delete(`/factory/tasks/${task.id}`)
      onUpdate()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Modal onClose={onClose} title={task.title} width={820}>
      <div className="stack" style={{ minWidth: 640, maxWidth: 840, maxHeight: '80vh', overflowY: 'auto', gap: 14 }}>
        {/* Metadados da Tarefa */}
        <div className="row" style={{ gap: 12, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--line)', paddingBottom: 10, flexWrap: 'wrap' }}>
          <span className="row" style={{ gap: 4 }}>
            <GitBranch size={13} /> {task.branchName} contra <b>{task.baseBranch}</b>
          </span>
          <span>·</span>
          <span>Repo: <span className="mono">{task.source.repoPath}</span></span>
          <span>·</span>
          <span className="row" style={{ gap: 4 }}>
            <Cpu size={12} /> Provedor: <b>{task.provider}</b>
          </span>
          <span>·</span>
          <FactoryStatusChip state={task.state} executing={task.executing} />
          {task.prUrl && (
            <a
              href={task.prUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-primary row"
              style={{ gap: 4, textDecoration: 'none', padding: '2px 8px', fontSize: 11, marginLeft: 'auto' }}
            >
              <GitPullRequest size={12} /> Abrir MR/PR <ExternalLink size={10} />
            </a>
          )}
        </div>

        {/* ALERTA DE ERRO OU FALHA DE AUTENTICAÇÃO */}
        {(error || isError) && (
          <div className="callout callout-crit">
            <AlertTriangle size={18} />
            <div className="stack" style={{ gap: 10, flex: 1 }}>
              <span style={{ fontWeight: 600, color: 'var(--crit)' }}>
                {isAuthError ? 'Falha de Autenticação no Provedor' : 'Erro na Execução'}
              </span>

              <span style={{ lineHeight: 1.4 }}>
                {error || task.error}
              </span>
  
              {/* Ações de Recuperação / Troca de Provedor */}
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 12 }}>Alterar Provedor:</span>
                  <select
                    className="input"
                    style={{ padding: '4px 8px', fontSize: 12 }}
                    value={taskProvider}
                    onChange={e => handleProviderChange(e.target.value as FactoryTask['provider'])}
                    disabled={isExecuting}
                  >
                    <option value="agy">Antigravity (AGY)</option>
                    <option value="codex">Codex</option>
                    <option value="claude">Claude Code</option>
                  </select>
                </div>
  
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={handleDelete}
                    disabled={processing}
                  >
                    <Trash2 size={13} style={{ color: 'var(--crit)', marginTop: 0 }} /> Descartar
                  </button>
                  {retry && (
                    <button type="button" className="btn btn-sm btn-primary" onClick={retry} disabled={processing}>
                      {/* .callout-crit svg pintaria o ícone de vermelho dentro do botão primário */}
                      <RotateCw size={13} style={{ color: 'currentColor', marginTop: 0 }} /> {processing ? 'Tentando...' : 'Tentar Novamente'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {(statusMessage || isExecuting) && (
          <div
            className="card card-pad row"
            style={{
              background: 'var(--surface-3)',
              fontSize: 13,
              justifyContent: 'space-between',
              alignItems: 'center',
              borderColor: isExecuting ? 'var(--signal-line)' : undefined,
            }}
          >
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              {isExecuting && <span className="live-dot" />}
              <span className="mono">{statusMessage || 'Execução em andamento...'}</span>
            </div>

            {isExecuting && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={handleCancelExecution}
                disabled={stopping}
                title="Interromper execução atual"
              >
                <Square size={12} fill="currentColor" /> {stopping ? 'Parando...' : 'Parar'}
              </button>
            )}
          </div>
        )}

        {/* Saída do agente desta execução, em qualquer estado da tarefa */}
        {(logText || processing) && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Saída do agente</span>
            <pre className="factory-log" ref={logRef}>
              {logText || 'Aguardando a primeira saída do agente...'}
            </pre>
          </div>
        )}

        {/* CASO 1: AGUARDANDO APROVAÇÃO DO PLANO */}
        {isWaitingApproval && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="card card-pad stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="eyebrow" style={{ color: 'var(--signal)' }}>Plano Técnico do Architect</span>
                {task.handoffs?.plan?.targetFiles && task.handoffs.plan.targetFiles.length > 0 && (
                  <span className="muted" style={{ fontSize: 11 }}>
                    {task.handoffs.plan.targetFiles.length} arquivos mapeados
                  </span>
                )}
              </div>
              {task.plan ? (
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  <Markdown>{task.plan}</Markdown>
                </div>
              ) : (
                <span className="muted">Nenhum plano detalhado disponível.</span>
              )}
            </div>

            {/* Linha do tempo da fase de planejamento */}
            {task.spans && task.spans.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <TraceTimeline spans={task.spans} />
              </div>
            )}

            <div className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <button type="button" className="btn" onClick={handleDelete} disabled={processing}>
                <Trash2 size={15} style={{ color: 'var(--crit)' }} /> Descartar
              </button>

              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-primary" onClick={handleApprovePlan} disabled={processing}>
                  <Play size={15} /> {processing ? 'Construindo...' : 'Aprovar e Construir na Worktree'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CASO 2: TAREFA EM REVISÃO (DIFF, QA, SEGURANÇA, TRACE) */}
        {isReview && (
          <div className="stack" style={{ gap: 16 }}>
            {/* Abas de Inspeção */}
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'diff'}
                onClick={() => setTab('diff')}
              >
                <GitCommit size={14} /> Diff de Código
                {task.diffStat && (
                  <span className="mono" style={{ fontSize: 11, marginLeft: 4 }}>
                    (+{task.diffStat.insertions} / -{task.diffStat.deletions})
                  </span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'qa'}
                onClick={() => setTab('qa')}
              >
                <CheckCircle2 size={14} /> QA & Testes
                {task.qaReport?.passed && <span style={{ color: 'var(--ok)', marginLeft: 4 }}>✓</span>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'security'}
                onClick={() => setTab('security')}
              >
                <ShieldAlert size={14} /> Auditoria de Segurança
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'trace'}
                onClick={() => setTab('trace')}
              >
                <Activity size={14} /> Linha do Tempo (Trace)
                {task.spans && task.spans.length > 0 && (
                  <span className="badge" style={{ fontSize: 10, marginLeft: 4 }}>
                    {task.spans.length}
                  </span>
                )}
              </button>
            </div>

            {/* Conteúdo da Aba Diff */}
            {tab === 'diff' && (
              <div className="stack" style={{ gap: 8 }}>
                {task.diffStat && (
                  <div className="row" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    <span>{task.diffStat.filesChanged} arquivos alterados</span>
                    <span>·</span>
                    <span style={{ color: 'var(--ok)' }}>+{task.diffStat.insertions} adições</span>
                    <span>·</span>
                    <span style={{ color: 'var(--crit)' }}>-{task.diffStat.deletions} remoções</span>
                  </div>
                )}
                <div
                  className="card card-pad mono"
                  style={{ maxHeight: 360, overflowY: 'auto', fontSize: 12, background: 'var(--surface-3)', whiteSpace: 'pre-wrap' }}
                >
                  {task.diffContent
                    ? task.diffContent.split('\n').map((line, i) => (
                        <span key={i} style={{ display: 'block', color: diffLineColor(line) }}>
                          {line || ' '}
                        </span>
                      ))
                    : 'Nenhuma diferença identificada contra a branch base.'}
                </div>
              </div>
            )}

            {/* Conteúdo da Aba QA */}
            {tab === 'qa' && (
              <div className="stack card card-pad" style={{ maxHeight: 360, overflowY: 'auto', gap: 8 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="eyebrow">Relatório do Tester e Portão de Testes</span>
                  <span className={`badge ${task.qaReport?.passed ? 'badge-ok' : 'badge-crit'}`}>
                    {task.qaReport?.passed ? 'Testes Passaram' : 'Atenção aos Testes'}
                  </span>
                </div>
                {task.qaReport?.output && (
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="muted" style={{ fontSize: 11 }}>Saída Determinística da Suíte de Testes:</span>
                    <pre style={{ margin: 0, padding: 8, background: 'var(--surface-3)', borderRadius: 4, fontSize: 11, maxHeight: 160, overflowY: 'auto' }}>
                      {task.qaReport.output}
                    </pre>
                  </div>
                )}
                {task.qaReport?.summary ? (
                  <Markdown>{task.qaReport.summary}</Markdown>
                ) : (
                  <span className="muted">Nenhum relatório de QA gravado.</span>
                )}
              </div>
            )}

            {/* Conteúdo da Aba Segurança */}
            {tab === 'security' && (
              <div className="stack card card-pad" style={{ maxHeight: 360, overflowY: 'auto', gap: 8 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="eyebrow">Auditoria do Reviewer</span>
                  <span className={`badge ${task.securityReport?.passed ? 'badge-ok' : 'badge-warn'}`}>
                    {task.securityReport?.passed ? 'Seguro' : 'Observações'}
                  </span>
                </div>
                {task.securityReport?.summary ? (
                  <Markdown>{task.securityReport.summary}</Markdown>
                ) : (
                  <span className="muted">Nenhuma auditoria gravada.</span>
                )}
              </div>
            )}

            {/* Conteúdo da Aba Trace */}
            {tab === 'trace' && (
              <div className="stack" style={{ maxHeight: 420, overflowY: 'auto' }}>
                <TraceTimeline spans={task.spans} />
              </div>
            )}

            {/* Seção Human-in-the-Loop */}
            <div className="card card-pad stack" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
              <span className="eyebrow">Human-in-the-Loop: Ajustes e Decisão</span>

              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Precisa de alterações? Digite o ajuste para o Implementer..."
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  disabled={processing}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={handleSendFeedback}
                  disabled={processing || !feedback.trim()}
                >
                  <MessageSquare size={14} /> Solicitar Ajuste
                </button>
              </div>

              <div className="row" style={{ justifyContent: 'space-between', marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-sm" onClick={handleOpenEditor} title="Abre a worktree no VS Code ou editor padrão">
                    <ExternalLink size={13} /> Abrir no Editor
                  </button>
                  <button type="button" className="btn btn-sm" onClick={handleDelete} disabled={processing}>
                    <Trash2 size={13} style={{ color: 'var(--crit)' }} /> Descartar
                  </button>
                </div>

                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleFinish('local_merge')}
                    disabled={processing}
                    title="Mescla a branch na sua branch base local e limpa a worktree"
                  >
                    <Check size={14} /> Merge Local
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => handleFinish('mr')}
                    disabled={processing}
                    title="Prepara para Pull/Merge Request remoto"
                  >
                    <GitPullRequest size={14} /> Criar MR/PR Remoto
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </Modal>
  )
}
