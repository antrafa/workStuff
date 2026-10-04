import { useState } from 'react'
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
  Terminal,
  Trash2,
} from 'lucide-react'
import { Markdown, Modal } from '@/ui'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'
import { TraceTimeline } from './TraceTimeline'

type Props = {
  task: FactoryTask | null
  onClose: () => void
  onUpdate: () => void
}

type Tab = 'diff' | 'qa' | 'security' | 'trace' | 'logs'

export function TaskReviewDrawer({ task, onClose, onUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('diff')
  const [feedback, setFeedback] = useState('')
  const [processing, setProcessing] = useState(false)
  const [logText, setLogText] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [taskProvider, setTaskProvider] = useState<'claude' | 'codex' | 'agy'>(task?.provider || 'agy')

  if (!task) return null

  const isWaitingApproval = task.state === 'waiting_approval'
  const isReview = task.state === 'review'
  const isError = task.state === 'error' || Boolean(task.error)
  const isAuthError =
    task.error && /authenticate|oauth|expired|unauthorized|401|api_key|token/i.test(task.error)
  const isExecuting = processing || Boolean(task.executing) || ['planning', 'building', 'qa_security'].includes(task.state)

  const handleProviderChange = async (newProvider: 'claude' | 'codex' | 'agy') => {
    setTaskProvider(newProvider)
    try {
      await api.patch(`/factory/tasks/${task.id}`, { provider: newProvider })
      onUpdate()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const [stopping, setStopping] = useState(false)

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

  const handleRetryPlan = async () => {
    setProcessing(true)
    setError(null)
    setLogText('')
    setStatusMessage('Re-executando análise com o Architect...')
    setTab('logs')

    try {
      await streamPost(
        `/factory/tasks/${task.id}/plan`,
        (e: any) => {
          if (e.type === 'status') setStatusMessage(e.message)
          if (e.type === 'text') setLogText(prev => prev + e.text)
          if (e.type === 'cancelled') {
            setStatusMessage(e.message || 'Execução interrompida pelo usuário.')
            onUpdate()
          }
          if (e.type === 'done') {
            setStatusMessage('Plano técnico gerado com sucesso!')
            onUpdate()
          }
          if (e.type === 'error') setError(e.message)
        }
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProcessing(false)
      onUpdate()
    }
  }

  const handleApprovePlan = async () => {
    setProcessing(true)
    setError(null)
    setLogText('')
    setStatusMessage('Iniciando esteira determinística de construção...')
    setTab('logs')

    try {
      await streamPost(
        `/factory/tasks/${task.id}/approve-plan`,
        (e: any) => {
          if (e.type === 'status') setStatusMessage(e.message)
          if (e.type === 'text') setLogText(prev => prev + e.text)
          if (e.type === 'cancelled') {
            setStatusMessage(e.message || 'Execução interrompida pelo usuário.')
            onUpdate()
          }
          if (e.type === 'done') {
            setStatusMessage('Construção, portões de teste e auditoria finalizados!')
            onUpdate()
          }
          if (e.type === 'error') setError(e.message)
        }
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProcessing(false)
      onUpdate()
    }
  }

  const handleSendFeedback = async () => {
    if (!feedback.trim()) return
    setProcessing(true)
    setError(null)
    setLogText('')
    setStatusMessage('Aplicando ajustes na worktree...')
    setTab('logs')

    try {
      await streamPost(
        `/factory/tasks/${task.id}/adjust`,
        (e: any) => {
          if (e.type === 'status') setStatusMessage(e.message)
          if (e.type === 'text') setLogText(prev => prev + e.text)
          if (e.type === 'cancelled') {
            setStatusMessage(e.message || 'Execução interrompida pelo usuário.')
            onUpdate()
          }
          if (e.type === 'done') {
            setStatusMessage('Ajustes aplicados com sucesso!')
            setFeedback('')
            onUpdate()
          }
          if (e.type === 'error') setError(e.message)
        },
        undefined,
        { feedback }
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProcessing(false)
      onUpdate()
    }
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
      const res = await api.post<FactoryTask>(`/factory/tasks/${task.id}/finish`, { mode })
      onUpdate()
      if (res?.prUrl) {
        window.open(res.prUrl, '_blank')
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
          <span className="badge" style={{ textTransform: 'uppercase', fontSize: 10 }}>{task.state}</span>
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
          <div
            className="card card-pad stack"
            style={{
              background: 'var(--red-subtle)',
              borderColor: 'var(--red-line)',
              gap: 10,
            }}
          >
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={18} style={{ color: 'var(--red)' }} />
              <span style={{ fontWeight: 600, color: 'var(--red)' }}>
                {isAuthError ? 'Falha de Autenticação no Provedor' : 'Erro na Execução'}
              </span>
            </div>

            <span style={{ color: 'var(--foreground)', fontSize: 13, lineHeight: 1.4 }}>
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
                  onChange={e => handleProviderChange(e.target.value as any)}
                  disabled={processing}
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
                  <Trash2 size={13} style={{ color: 'var(--red)' }} /> Descartar
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={task.plan && isWaitingApproval ? handleApprovePlan : handleRetryPlan}
                  disabled={processing}
                >
                  <RotateCw size={13} /> {processing ? 'Tentando...' : 'Tentar Novamente'}
                </button>
              </div>
            </div>
          </div>
        )}

        {(statusMessage || isExecuting) && (
          <div
            className="card card-pad row"
            style={{
              background: 'var(--surface-active)',
              fontSize: 13,
              justifyContent: 'space-between',
              alignItems: 'center',
              border: isExecuting ? '1px solid rgba(90, 210, 221, 0.4)' : undefined,
            }}
          >
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              {isExecuting && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#5ad2dd',
                    boxShadow: '0 0 8px #5ad2dd',
                    animation: 'pulse 1.2s infinite',
                  }}
                />
              )}
              <span className="mono">{statusMessage || 'Execução em andamento...'}</span>
            </div>

            {isExecuting && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={handleCancelExecution}
                disabled={stopping}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  borderColor: 'rgba(239, 68, 68, 0.4)',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 10px',
                }}
                title="Interromper execução atual"
              >
                <Square size={12} fill="currentColor" /> {stopping ? 'Parando...' : 'Parar'}
              </button>
            )}
          </div>
        )}

        {/* CASO 1: AGUARDANDO APROVAÇÃO DO PLANO */}
        {isWaitingApproval && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="card card-pad stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="eyebrow" style={{ color: 'var(--accent)' }}>Plano Técnico do Architect</span>
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
                <Trash2 size={15} style={{ color: 'var(--red)' }} /> Descartar
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
            <div className="row" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
              <button
                type="button"
                className={`btn btn-sm ${tab === 'diff' ? 'btn-primary' : ''}`}
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
                className={`btn btn-sm ${tab === 'qa' ? 'btn-primary' : ''}`}
                onClick={() => setTab('qa')}
              >
                <CheckCircle2 size={14} /> QA & Testes
                {task.qaReport?.passed && <span style={{ color: 'var(--green)', marginLeft: 4 }}>✓</span>}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${tab === 'security' ? 'btn-primary' : ''}`}
                onClick={() => setTab('security')}
              >
                <ShieldAlert size={14} /> Auditoria de Segurança
              </button>
              <button
                type="button"
                className={`btn btn-sm ${tab === 'trace' ? 'btn-primary' : ''}`}
                onClick={() => setTab('trace')}
              >
                <Activity size={14} /> Linha do Tempo (Trace)
                {task.spans && task.spans.length > 0 && (
                  <span className="badge" style={{ fontSize: 10, marginLeft: 4 }}>
                    {task.spans.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${tab === 'logs' ? 'btn-primary' : ''}`}
                onClick={() => setTab('logs')}
              >
                <Terminal size={14} /> Console de Logs
              </button>
            </div>

            {/* Conteúdo da Aba Diff */}
            {tab === 'diff' && (
              <div className="stack" style={{ gap: 8 }}>
                {task.diffStat && (
                  <div className="row" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    <span>{task.diffStat.filesChanged} arquivos alterados</span>
                    <span>·</span>
                    <span style={{ color: 'var(--green)' }}>+{task.diffStat.insertions} adições</span>
                    <span>·</span>
                    <span style={{ color: 'var(--red)' }}>-{task.diffStat.deletions} remoções</span>
                  </div>
                )}
                <div
                  className="card card-pad mono"
                  style={{ maxHeight: 360, overflowY: 'auto', fontSize: 12, background: 'var(--surface-active)', whiteSpace: 'pre-wrap' }}
                >
                  {task.diffContent || 'Nenhuma diferença identificada contra a branch base.'}
                </div>
              </div>
            )}

            {/* Conteúdo da Aba QA */}
            {tab === 'qa' && (
              <div className="stack card card-pad" style={{ maxHeight: 360, overflowY: 'auto', gap: 8 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="eyebrow">Relatório do Tester e Portão de Testes</span>
                  <span className="badge" style={{ background: task.qaReport?.passed ? 'var(--green-subtle)' : 'var(--red-subtle)' }}>
                    {task.qaReport?.passed ? 'Testes Passaram' : 'Atenção aos Testes'}
                  </span>
                </div>
                {task.qaReport?.output && (
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="muted" style={{ fontSize: 11 }}>Saída Determinística da Suíte de Testes:</span>
                    <pre style={{ margin: 0, padding: 8, background: 'var(--surface-active)', borderRadius: 4, fontSize: 11, maxHeight: 160, overflowY: 'auto' }}>
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
                  <span className="badge" style={{ background: task.securityReport?.passed ? 'var(--green-subtle)' : 'var(--yellow-subtle)' }}>
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

            {/* Conteúdo da Aba Logs */}
            {tab === 'logs' && (
              <div className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="eyebrow">Saída em Tempo Real dos Agentes</span>
                  {processing && (
                    <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                      <span className="badge" style={{ color: '#5ad2dd', borderColor: '#5ad2dd' }}>
                        executando...
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={handleCancelExecution}
                        disabled={stopping}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          fontSize: 11,
                          padding: '2px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        title="Interromper execução da tarefa"
                      >
                        <Square size={10} fill="currentColor" /> {stopping ? 'Parando...' : 'Parar'}
                      </button>
                    </div>
                  )}
                </div>
                {statusMessage && (
                  <div className="card card-pad" style={{ background: 'var(--surface-active)', fontSize: 12, color: '#5ad2dd' }}>
                    {statusMessage}
                  </div>
                )}
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    background: '#06080f',
                    borderRadius: 8,
                    fontSize: 12,
                    lineHeight: 1.5,
                    maxHeight: 360,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: '#dbeafe',
                    border: '1px solid var(--line)',
                  }}
                >
                  {logText || 'Aguardando logs ou nenhuma saída registrada nesta sessão.'}
                </pre>
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
                    <Trash2 size={13} style={{ color: 'var(--red)' }} /> Descartar
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

        {/* LOGS DE EXECUÇÃO EM TEMPO REAL */}
        {logText && (
          <div className="stack" style={{ marginTop: 12 }}>
            <span className="eyebrow">Saída da IA</span>
            <div
              className="card card-pad mono"
              style={{ maxHeight: 200, overflowY: 'auto', fontSize: 11, background: 'var(--surface-active)', whiteSpace: 'pre-wrap' }}
            >
              {logText}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
