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
import { ConfirmModal, Markdown, Modal } from '@/ui'
import { api } from '@/lib/api'
import { AGENT_UI, isTaskRunning, retryActionOf, runFactoryAction, taskUsage, type FactoryAction } from './factoryRun'
import type { FactoryTask, SecurityFinding } from '../../../server/lib/factory/types.ts'
import { TraceTimeline } from './TraceTimeline'
import { tx } from '@/lib/i18n'
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
  const [answers, setAnswers] = useState('')
  const [budgetDraft, setBudgetDraft] = useState(task?.budgetUsd ? String(task.budgetUsd) : '')
  // null: the Architect's plan as is; a string: the developer's edited version
  const [editedPlan, setEditedPlan] = useState<string | null>(null)
  // A finish that worked but left something to do by hand (MR not opened): not an execution error
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'delete' | 'merge' | null>(null)

  if (!task) return null

  const isWaitingApproval = task.state === 'waiting_approval'
  const isWaitingClarification = task.state === 'waiting_clarification'
  const spec = task.handoffs?.spec
  const usage = taskUsage(task)
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

  const handleBudgetSave = async () => {
    try {
      await api.patch(`/factory/tasks/${task.id}`, { budgetUsd: budgetDraft.trim() || null })
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
      setStatusMessage(tx({ en: 'Stop request sent to the server.', pt: 'Solicitação de cancelamento enviada ao servidor.' }))
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
      if (outcome.cancelled) setStatusMessage(tx({ en: 'Run stopped by the user.', pt: 'Execução interrompida pelo usuário.' }))
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

  const handleRetryPlan = () => startAction('plan', tx({ en: 'Planning again with the Analyst and the Architect...', pt: 'Re-executando análise com o Analyst e o Architect...' }), tx({ en: 'Technical plan ready.', pt: 'Plano técnico gerado com sucesso!' }))
  const handleApprovePlan = () =>
    startAction('approve-plan', tx({ en: 'Starting the build pipeline...', pt: 'Iniciando esteira determinística de construção...' }), tx({ en: 'Build, test gates and review finished.', pt: 'Construção, portões de teste e auditoria finalizados!' }),
      editedPlan !== null && editedPlan.trim() ? { plan: editedPlan } : undefined)
  const handleAnswer = () =>
    startAction('plan', tx({ en: 'Planning again with your answers...', pt: 'Replanejando com as suas respostas...' }), tx({ en: 'Spec and plan written with your answers.', pt: 'Especificação e plano gerados com as respostas.' }), { answers })
  const askFix = (f: SecurityFinding) =>
    setFeedback(`${tx({ en: 'Fix', pt: 'Corrija' })}: ${f.description}${f.file ? ` (${f.file}${f.line !== undefined ? `:${f.line}` : ''})` : ''}`)
  // Only from 'error', with the board's rule (retryActionOf). In review (a failed adjust) the work
  // is intact and the way forward is a new adjust; in done there is nothing to retry.
  const retry = task.state !== 'error' ? null : retryActionOf(task) === 'approve-plan' ? handleApprovePlan : handleRetryPlan

  const handleSendFeedback = () => {
    if (!feedback.trim()) return
    return startAction('adjust', tx({ en: 'Applying the adjustments in the worktree...', pt: 'Aplicando ajustes na worktree...' }), tx({ en: 'Adjustments applied.', pt: 'Ajustes aplicados com sucesso!' }), { feedback })
  }

  const handleOpenEditor = async () => {
    try {
      await api.post(`/factory/tasks/${task.id}/open-editor`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleFinish = (mode: 'mr' | 'local_merge') => (mode === 'local_merge' ? setConfirming('merge') : finish('mr'))

  const finish = async (mode: 'mr' | 'local_merge') => {
    setProcessing(true)
    setError(null)
    try {
      const res = await api.post<FactoryTask & { warning?: string }>(`/factory/tasks/${task.id}/finish`, { mode })
      onUpdate()
      if (res?.prUrl) {
        window.open(res.prUrl, '_blank')
      }
      if (res?.warning) {
        setNotice(res.warning)
        return
      }
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  const handleDelete = () => setConfirming('delete')

  const deleteTask = async () => {
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
      {confirming === 'delete' && (
        <ConfirmModal
          title={tx({ en: `Discard "${task.title}"?`, pt: `Descartar "${task.title}"?` })}
          action={tx({ en: 'discard task', pt: 'descartar tarefa' })}
          confirmLabel={tx({ en: 'Discard', pt: 'Descartar' })}
          icon={Trash2}
          effects={[
            tx({ en: 'Stops the run in progress, if any.', pt: 'Para a execução em andamento, se houver.' }),
            tx({ en: `Removes the worktree and the branch ${task.branchName}.`, pt: `Remove a worktree e a branch ${task.branchName}.` }),
          ]}
          losses={[
            tx({ en: 'The generated code that did not become an MR or a merge.', pt: 'O código gerado que não virou MR nem merge.' }),
            tx({ en: 'The spans history and the agents\' session.', pt: 'O histórico de spans e a sessão dos agentes.' }),
          ]}
          onConfirm={deleteTask}
          onClose={() => setConfirming(null)}
        />
      )}
      {confirming === 'merge' && (
        <ConfirmModal
          title={tx({ en: `Merge ${task.branchName} into your repository?`, pt: `Mesclar ${task.branchName} no seu repositório?` })}
          action="merge local"
          confirmLabel={tx({ en: 'Merge', pt: 'Mesclar' })}
          icon={Check}
          command={`git merge --no-ff ${task.branchName}`}
          effects={[
            tx({
              en: `Checks out ${task.baseBranch.replace(/^origin\//, '')} in ${task.source.repoPath}, merges, and goes back to the branch you were on.`,
              pt: `Faz checkout de ${task.baseBranch.replace(/^origin\//, '')} em ${task.source.repoPath}, mescla e volta para a branch onde você estava.`,
            }),
            tx({ en: 'Does not push.', pt: 'Não faz push.' }),
          ]}
          losses={[tx({ en: 'Nothing: the merge can be undone with git reset on the base branch. Needs the repository with no pending changes.', pt: 'Nada: o merge pode ser desfeito com git reset na branch base. Exige o repositório sem alterações pendentes.' })]}
          onConfirm={() => finish('local_merge')}
          onClose={() => setConfirming(null)}
        />
      )}
      <div className="stack" style={{ minWidth: 640, maxWidth: 840, maxHeight: '80vh', overflowY: 'auto', gap: 14 }}>
        {/* Task metadata */}
        <div className="row" style={{ gap: 12, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--line)', paddingBottom: 10, flexWrap: 'wrap' }}>
          <span className="row" style={{ gap: 4 }}>
            <GitBranch size={13} /> {task.branchName} {tx({ en: 'against', pt: 'contra' })} <b>{task.baseBranch}</b>
          </span>
          <span>·</span>
          <span>Repo: <span className="mono">{task.source.repoPath}</span></span>
          <span>·</span>
          <span className="row" style={{ gap: 4 }}>
            <Cpu size={12} /> {tx({ en: 'Provider', pt: 'Provedor' })}: <b>{task.provider}</b>
          </span>
          <span>·</span>
          <FactoryStatusChip state={task.state} executing={task.executing} />
          {(usage.costUsd !== null || usage.tokens > 0) && (
            <>
              <span>·</span>
              <span className="mono" title={tx({ en: 'Sum of what the CLIs reported for each agent run', pt: 'Somado do que os CLIs informaram em cada execução de agente' })}>
                {usage.costUsd !== null ? `US$ ${usage.costUsd.toFixed(2)}` : ''}
                {task.budgetUsd ? tx({ en: ` of US$ ${task.budgetUsd.toFixed(2)}`, pt: ` de US$ ${task.budgetUsd.toFixed(2)}` }) : ''}
                {usage.tokens > 0 ? ` ${(usage.tokens / 1000).toFixed(0)}k tokens` : ''}
              </span>
            </>
          )}
          {task.prUrl && (
            <a
              href={task.prUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-primary row"
              style={{ gap: 4, textDecoration: 'none', padding: '2px 8px', fontSize: 11, marginLeft: 'auto' }}
            >
              <GitPullRequest size={12} /> {tx({ en: 'Open MR/PR', pt: 'Abrir MR/PR' })} <ExternalLink size={10} />
            </a>
          )}
        </div>

        {notice && <div className="callout callout-warn">{notice}</div>}

        {/* Error or provider authentication failure */}
        {(error || isError) && (
          <div className="callout callout-crit">
            <AlertTriangle size={18} />
            <div className="stack" style={{ gap: 10, flex: 1 }}>
              <span style={{ fontWeight: 600, color: 'var(--crit)' }}>
                {isAuthError ? tx({ en: 'Provider authentication failed', pt: 'Falha de Autenticação no Provedor' }) : tx({ en: 'Run error', pt: 'Erro na Execução' })}
              </span>

              <span style={{ lineHeight: 1.4 }}>
                {error || task.error}
              </span>
  
              {/* Recovery actions / provider switch */}
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'Change provider:', pt: 'Alterar Provedor:' })}</span>
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
                  <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'Cap US$:', pt: 'Teto US$:' })}</span>
                  <input
                    className="input mono"
                    type="number"
                    min="0.01"
                    step="0.01"
                    style={{ width: 90, padding: '4px 8px', fontSize: 12 }}
                    placeholder={tx({ en: 'no cap', pt: 'sem teto' })}
                    value={budgetDraft}
                    onChange={e => setBudgetDraft(e.target.value)}
                    disabled={isExecuting}
                  />
                  <button type="button" className="btn btn-sm" onClick={handleBudgetSave} disabled={isExecuting}>{tx({ en: 'Save', pt: 'Salvar' })}</button>
                </div>
  
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={handleDelete}
                    disabled={processing}
                  >
                    <Trash2 size={13} style={{ color: 'var(--crit)', marginTop: 0 }} /> {tx({ en: 'Discard', pt: 'Descartar' })}
                  </button>
                  {retry && (
                    <button type="button" className="btn btn-sm btn-primary" onClick={retry} disabled={processing}>
                      {/* .callout-crit svg would paint the icon red inside the primary button */}
                      <RotateCw size={13} style={{ color: 'currentColor', marginTop: 0 }} /> {processing ? tx({ en: 'Retrying...', pt: 'Tentando...' }) : tx({ en: 'Try again', pt: 'Tentar Novamente' })}
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
              <span className="mono">{statusMessage || tx({ en: 'Run in progress...', pt: 'Execução em andamento...' })}</span>
            </div>

            {isExecuting && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={handleCancelExecution}
                disabled={stopping}
                title={tx({ en: 'Stop the current run', pt: 'Interromper execução atual' })}
              >
                <Square size={12} fill="currentColor" /> {stopping ? tx({ en: 'Stopping...', pt: 'Parando...' }) : tx({ en: 'Stop', pt: 'Parar' })}
              </button>
            )}
          </div>
        )}

        {/* This run's agent output, in any task state */}
        {(logText || processing) && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">{tx({ en: 'Agent output', pt: 'Saída do agente' })}</span>
            <pre className="factory-log" ref={logRef}>
              {logText || tx({ en: 'Waiting for the agent\'s first output...', pt: 'Aguardando a primeira saída do agente...' })}
            </pre>
          </div>
        )}

        {/* CASE 0: THE ANALYST HAS QUESTIONS ONLY THE DEVELOPER CAN ANSWER */}
        {isWaitingClarification && spec && (
          <div className="card card-pad stack" style={{ gap: 12 }}>
            <span className="eyebrow" style={{ color: 'var(--signal)' }}>{tx({ en: 'Analyst\'s questions', pt: 'Dúvidas do Analyst' })}</span>
            {spec.summary && <Markdown>{spec.summary}</Markdown>}
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {spec.openQuestions.map(q => <li key={q} style={{ marginBottom: 6 }}>{q}</li>)}
            </ol>
            <textarea
              className="textarea"
              rows={5}
              placeholder={tx({ en: 'Answer the questions in order. The answers go into the spec and the plan.', pt: 'Responda às perguntas na ordem. As respostas entram na especificação e no plano.' })}
              value={answers}
              onChange={e => setAnswers(e.target.value)}
              disabled={processing}
            />
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn" onClick={handleDelete} disabled={processing}>
                <Trash2 size={15} style={{ color: 'var(--crit)' }} /> {tx({ en: 'Discard', pt: 'Descartar' })}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAnswer} disabled={processing || !answers.trim()}>
                <Play size={15} /> {processing ? tx({ en: 'Planning again...', pt: 'Replanejando...' }) : tx({ en: 'Answer and plan', pt: 'Responder e Planejar' })}
              </button>
            </div>
          </div>
        )}

        {/* CASE 1: WAITING FOR PLAN APPROVAL */}
        {isWaitingApproval && (
          <div className="stack" style={{ gap: 16 }}>
            {spec && spec.acceptanceCriteria.length > 0 && (
              <div className="card card-pad stack" style={{ gap: 8 }}>
                <span className="eyebrow">{tx({ en: 'Analyst\'s acceptance criteria', pt: 'Critérios de aceite do Analyst' })}</span>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {spec.acceptanceCriteria.map(c => <li key={c} style={{ marginBottom: 4 }}>{c}</li>)}
                </ul>
                {spec.outOfScope.length > 0 && (
                  <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'Out of scope: ', pt: 'Fora do escopo: ' })}{spec.outOfScope.join('; ')}</span>
                )}
              </div>
            )}
            <div className="card card-pad stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="eyebrow" style={{ color: 'var(--signal)' }}>{tx({ en: 'Architect\'s technical plan', pt: 'Plano Técnico do Architect' })}</span>
                {task.handoffs?.plan?.targetFiles && task.handoffs.plan.targetFiles.length > 0 && (
                  <span className="muted" style={{ fontSize: 11 }}>
                    {tx({ en: `${task.handoffs.plan.targetFiles.length} files mapped`, pt: `${task.handoffs.plan.targetFiles.length} arquivos mapeados` })}
                  </span>
                )}
              </div>
              {editedPlan !== null ? (
                <textarea className="textarea mono" rows={16} value={editedPlan} onChange={e => setEditedPlan(e.target.value)} disabled={processing} />
              ) : task.plan ? (
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  <Markdown>{task.plan}</Markdown>
                </div>
              ) : (
                <span className="muted">{tx({ en: 'No detailed plan available.', pt: 'Nenhum plano detalhado disponível.' })}</span>
              )}
              {task.plan && (
                <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={processing}
                  onClick={() => setEditedPlan(editedPlan === null ? task.plan ?? '' : null)}>
                  {editedPlan === null ? tx({ en: 'Edit the plan before approving', pt: 'Editar plano antes de aprovar' }) : tx({ en: 'Discard the edit', pt: 'Descartar edição' })}
                </button>
              )}
            </div>

            {/* Planning phase timeline */}
            {task.spans && task.spans.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <TraceTimeline spans={task.spans} />
              </div>
            )}

            <div className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <button type="button" className="btn" onClick={handleDelete} disabled={processing}>
                <Trash2 size={15} style={{ color: 'var(--crit)' }} /> {tx({ en: 'Discard', pt: 'Descartar' })}
              </button>

              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-primary" onClick={handleApprovePlan} disabled={processing}>
                  <Play size={15} /> {processing ? tx({ en: 'Building...', pt: 'Construindo...' }) : tx({ en: 'Approve and build', pt: 'Aprovar e Construir na Worktree' })}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CASE 2: TASK IN REVIEW (DIFF, QA, SECURITY, TRACE) */}
        {isReview && (
          <div className="stack" style={{ gap: 16 }}>
            {/* Inspection tabs */}
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'diff'}
                onClick={() => setTab('diff')}
              >
                <GitCommit size={14} /> {tx({ en: 'Code diff', pt: 'Diff de Código' })}
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
                <CheckCircle2 size={14} /> {tx({ en: 'QA & tests', pt: 'QA & Testes' })}
                {task.qaReport?.passed && <span style={{ color: 'var(--ok)', marginLeft: 4 }}>✓</span>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'security'}
                onClick={() => setTab('security')}
              >
                <ShieldAlert size={14} /> {tx({ en: 'Review and security', pt: 'Revisão e Segurança' })}
                {task.securityReport && !task.securityReport.passed && <span style={{ color: 'var(--crit)', marginLeft: 4 }}>!</span>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'trace'}
                onClick={() => setTab('trace')}
              >
                <Activity size={14} /> {tx({ en: 'Timeline (trace)', pt: 'Linha do Tempo (Trace)' })}
                {task.spans && task.spans.length > 0 && (
                  <span className="badge" style={{ fontSize: 10, marginLeft: 4 }}>
                    {task.spans.length}
                  </span>
                )}
              </button>
            </div>

            {/* Diff tab */}
            {tab === 'diff' && (
              <div className="stack" style={{ gap: 8 }}>
                {task.diffStat && (
                  <div className="row" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    <span>{tx({ en: `${task.diffStat.filesChanged} files changed`, pt: `${task.diffStat.filesChanged} arquivos alterados` })}</span>
                    <span>·</span>
                    <span style={{ color: 'var(--ok)' }}>{tx({ en: `+${task.diffStat.insertions} additions`, pt: `+${task.diffStat.insertions} adições` })}</span>
                    <span>·</span>
                    <span style={{ color: 'var(--crit)' }}>{tx({ en: `-${task.diffStat.deletions} deletions`, pt: `-${task.diffStat.deletions} remoções` })}</span>
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
                    : tx({ en: 'No difference found against the base branch.', pt: 'Nenhuma diferença identificada contra a branch base.' })}
                </div>
              </div>
            )}

            {/* QA tab */}
            {tab === 'qa' && (
              <div className="stack card card-pad" style={{ maxHeight: 360, overflowY: 'auto', gap: 8 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="eyebrow">{tx({ en: 'Tester report and test gate', pt: 'Relatório do Tester e Portão de Testes' })}</span>
                  <span className={`badge ${task.qaReport?.passed ? 'badge-ok' : 'badge-crit'}`}>
                    {task.qaReport?.passed ? tx({ en: 'Tests passed', pt: 'Testes Passaram' }) : tx({ en: 'Check the tests', pt: 'Atenção aos Testes' })}
                  </span>
                </div>
                {task.qaReport?.output && (
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {tx({ en: 'Verification output', pt: 'Saída da verificação' })}
                      {task.qaReport.testsRan ? <> (<span className="mono">{task.qaReport.testsRan}</span>{tx({ en: ', run in the sandbox', pt: ', executada no sandbox' })})</> : ''}:
                    </span>
                    <pre style={{ margin: 0, padding: 8, background: 'var(--surface-3)', borderRadius: 4, fontSize: 11, maxHeight: 160, overflowY: 'auto' }}>
                      {task.qaReport.output}
                    </pre>
                  </div>
                )}
                {task.qaReport?.summary ? (
                  <Markdown>{task.qaReport.summary}</Markdown>
                ) : (
                  <span className="muted">{tx({ en: 'No QA report recorded.', pt: 'Nenhum relatório de QA gravado.' })}</span>
                )}
              </div>
            )}

            {/* Review tab: the verdict is computed in code from the findings and criteria */}
            {tab === 'security' && (
              <div className="stack card card-pad" style={{ maxHeight: 420, overflowY: 'auto', gap: 12 }}>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span className="eyebrow">{tx({ en: 'Reviewer and Security', pt: 'Reviewer e Security' })}</span>
                  <span className={`badge ${task.securityReport?.passed ? 'badge-ok' : 'badge-crit'}`}>
                    {task.securityReport?.passed ? tx({ en: 'No blockers', pt: 'Sem bloqueios' }) : tx({ en: 'Blocked', pt: 'Há bloqueios' })}
                  </span>
                  {Boolean(task.securityReport?.fixRounds) && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {tx({ en: `${task.securityReport?.fixRounds} automatic fix round(s) already applied`, pt: `${task.securityReport?.fixRounds} rodada(s) automática(s) de correção já aplicada(s)` })}
                    </span>
                  )}
                </div>

                {task.securityReport?.criteria && task.securityReport.criteria.length > 0 && (
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="eyebrow">{tx({ en: 'Acceptance criteria', pt: 'Critérios de aceite' })}</span>
                    {task.securityReport.criteria.map(c => (
                      <div key={c.criterion} className="row" style={{ gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                        <span className={`badge ${c.met ? 'badge-ok' : 'badge-crit'}`}>{c.met ? tx({ en: 'met', pt: 'atendido' }) : tx({ en: 'not met', pt: 'não atendido' })}</span>
                        <span>{c.criterion}<span className="muted"> {c.evidence}</span></span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="stack" style={{ gap: 6 }}>
                  <span className="eyebrow">{tx({ en: `Findings (${task.securityReport?.findings.length ?? 0})`, pt: `Achados (${task.securityReport?.findings.length ?? 0})` })}</span>
                  {(task.securityReport?.findings ?? []).map((f, i) => (
                    <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start', fontSize: 13, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                      <span className={`badge ${f.severity === 'critical' || f.severity === 'high' ? 'badge-crit' : f.severity === 'medium' ? 'badge-warn' : ''}`}>{f.severity}</span>
                      <div className="stack" style={{ gap: 2, flex: 1 }}>
                        <span>{f.description}</span>
                        <span className="muted mono" style={{ fontSize: 11 }}>
                          {f.agentId ? AGENT_UI[f.agentId].name : ''}
                          {f.file ? ` · ${f.file}${f.line !== undefined ? `:${f.line}` : ''}` : ''}
                          {f.confidence !== undefined ? tx({ en: ` · confidence ${f.confidence}`, pt: ` · confiança ${f.confidence}` }) : ''}
                        </span>
                      </div>
                      <button type="button" className="btn btn-sm" onClick={() => askFix(f)} disabled={processing} title={tx({ en: 'Fills the adjustment request with this finding', pt: 'Preenche o pedido de ajuste com este achado' })}>
                        {tx({ en: 'Ask for a fix', pt: 'Pedir correção' })}
                      </button>
                    </div>
                  ))}
                </div>

                {task.securityReport?.summary && <Markdown>{task.securityReport.summary}</Markdown>}
              </div>
            )}

            {/* Trace tab */}
            {tab === 'trace' && (
              <div className="stack" style={{ maxHeight: 420, overflowY: 'auto' }}>
                <TraceTimeline spans={task.spans} />
              </div>
            )}

            {/* Human-in-the-loop section */}
            <div className="card card-pad stack" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
              <span className="eyebrow">{tx({ en: 'Your call: adjustments and decision', pt: 'Sua decisão: ajustes e entrega' })}</span>

              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder={tx({ en: 'Need changes? Type the adjustment for the Implementer...', pt: 'Precisa de alterações? Digite o ajuste para o Implementer...' })}
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
                  <MessageSquare size={14} /> {tx({ en: 'Request adjustment', pt: 'Solicitar Ajuste' })}
                </button>
              </div>

              <div className="row" style={{ justifyContent: 'space-between', marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-sm" onClick={handleOpenEditor} title={tx({ en: 'Opens the worktree in VS Code or the default editor', pt: 'Abre a worktree no VS Code ou editor padrão' })}>
                    <ExternalLink size={13} /> {tx({ en: 'Open in editor', pt: 'Abrir no Editor' })}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={handleDelete} disabled={processing}>
                    <Trash2 size={13} style={{ color: 'var(--crit)' }} /> {tx({ en: 'Discard', pt: 'Descartar' })}
                  </button>
                </div>

                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => handleFinish('local_merge')}
                    disabled={processing}
                    title={tx({ en: 'Merges the branch into your local base branch and cleans up the worktree', pt: 'Mescla a branch na sua branch base local e limpa a worktree' })}
                  >
                    <Check size={14} /> {tx({ en: 'Local merge', pt: 'Merge Local' })}
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => handleFinish('mr')}
                    disabled={processing}
                    title={tx({ en: 'Pushes the branch and opens the remote Pull/Merge Request', pt: 'Envia a branch e abre o Pull/Merge Request remoto' })}
                  >
                    <GitPullRequest size={14} /> {tx({ en: 'Create MR/PR', pt: 'Criar MR/PR Remoto' })}
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
