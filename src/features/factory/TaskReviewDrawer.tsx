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
    startAction('approve-plan', 'Iniciando esteira determinística de construção...', 'Construção, portões de teste e auditoria finalizados!',
      editedPlan !== null && editedPlan.trim() ? { plan: editedPlan } : undefined)
  const handleAnswer = () =>
    startAction('plan', 'Replanejando com as suas respostas...', 'Especificação e plano gerados com as respostas.', { answers })
  const askFix = (f: SecurityFinding) =>
    setFeedback(`Corrija: ${f.description}${f.file ? ` (${f.file}${f.line !== undefined ? `:${f.line}` : ''})` : ''}`)
  // Only from 'error', with the board's rule (retryActionOf). In review (a failed adjust) the work
  // is intact and the way forward is a new adjust; in done there is nothing to retry.
  const retry = task.state !== 'error' ? null : retryActionOf(task) === 'approve-plan' ? handleApprovePlan : handleRetryPlan

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
          title={`Descartar "${task.title}"?`}
          action="descartar tarefa"
          confirmLabel="Descartar"
          icon={Trash2}
          effects={['Para a execução em andamento, se houver.', `Remove a worktree e a branch ${task.branchName}.`]}
          losses={['O código gerado que não virou MR nem merge.', 'O histórico de spans e a sessão dos agentes.']}
          onConfirm={deleteTask}
          onClose={() => setConfirming(null)}
        />
      )}
      {confirming === 'merge' && (
        <ConfirmModal
          title={`Mesclar ${task.branchName} no seu repositório?`}
          action="merge local"
          confirmLabel="Mesclar"
          icon={Check}
          command={`git merge --no-ff ${task.branchName}`}
          effects={[`Faz checkout de ${task.baseBranch.replace(/^origin\//, '')} em ${task.source.repoPath}, mescla e volta para a branch onde você estava.`, 'Não faz push.']}
          losses={['Nada: o merge pode ser desfeito com git reset na branch base. Exige o repositório sem alterações pendentes.']}
          onConfirm={() => finish('local_merge')}
          onClose={() => setConfirming(null)}
        />
      )}
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
          {(usage.costUsd !== null || usage.tokens > 0) && (
            <>
              <span>·</span>
              <span className="mono" title="Somado do que os CLIs informaram em cada execução de agente">
                {usage.costUsd !== null ? `US$ ${usage.costUsd.toFixed(2)}` : ''}
                {task.budgetUsd ? ` de US$ ${task.budgetUsd.toFixed(2)}` : ''}
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
              <GitPullRequest size={12} /> Abrir MR/PR <ExternalLink size={10} />
            </a>
          )}
        </div>

        {notice && <div className="callout callout-warn">{notice}</div>}

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
                  <span className="muted" style={{ fontSize: 12 }}>Teto US$:</span>
                  <input
                    className="input mono"
                    type="number"
                    min="0.01"
                    step="0.01"
                    style={{ width: 90, padding: '4px 8px', fontSize: 12 }}
                    placeholder="sem teto"
                    value={budgetDraft}
                    onChange={e => setBudgetDraft(e.target.value)}
                    disabled={isExecuting}
                  />
                  <button type="button" className="btn btn-sm" onClick={handleBudgetSave} disabled={isExecuting}>Salvar</button>
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

        {/* CASO 0: O ANALYST TEM DÚVIDAS QUE SÓ O DESENVOLVEDOR RESPONDE */}
        {isWaitingClarification && spec && (
          <div className="card card-pad stack" style={{ gap: 12 }}>
            <span className="eyebrow" style={{ color: 'var(--signal)' }}>Dúvidas do Analyst</span>
            {spec.summary && <Markdown>{spec.summary}</Markdown>}
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {spec.openQuestions.map(q => <li key={q} style={{ marginBottom: 6 }}>{q}</li>)}
            </ol>
            <textarea
              className="textarea"
              rows={5}
              placeholder="Responda às perguntas na ordem. As respostas entram na especificação e no plano."
              value={answers}
              onChange={e => setAnswers(e.target.value)}
              disabled={processing}
            />
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn" onClick={handleDelete} disabled={processing}>
                <Trash2 size={15} style={{ color: 'var(--crit)' }} /> Descartar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAnswer} disabled={processing || !answers.trim()}>
                <Play size={15} /> {processing ? 'Replanejando...' : 'Responder e Planejar'}
              </button>
            </div>
          </div>
        )}

        {/* CASO 1: AGUARDANDO APROVAÇÃO DO PLANO */}
        {isWaitingApproval && (
          <div className="stack" style={{ gap: 16 }}>
            {spec && spec.acceptanceCriteria.length > 0 && (
              <div className="card card-pad stack" style={{ gap: 8 }}>
                <span className="eyebrow">Critérios de aceite do Analyst</span>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {spec.acceptanceCriteria.map(c => <li key={c} style={{ marginBottom: 4 }}>{c}</li>)}
                </ul>
                {spec.outOfScope.length > 0 && (
                  <span className="muted" style={{ fontSize: 12 }}>Fora do escopo: {spec.outOfScope.join('; ')}</span>
                )}
              </div>
            )}
            <div className="card card-pad stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="eyebrow" style={{ color: 'var(--signal)' }}>Plano Técnico do Architect</span>
                {task.handoffs?.plan?.targetFiles && task.handoffs.plan.targetFiles.length > 0 && (
                  <span className="muted" style={{ fontSize: 11 }}>
                    {task.handoffs.plan.targetFiles.length} arquivos mapeados
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
                <span className="muted">Nenhum plano detalhado disponível.</span>
              )}
              {task.plan && (
                <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={processing}
                  onClick={() => setEditedPlan(editedPlan === null ? task.plan ?? '' : null)}>
                  {editedPlan === null ? 'Editar plano antes de aprovar' : 'Descartar edição'}
                </button>
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
                <ShieldAlert size={14} /> Revisão e Segurança
                {task.securityReport && !task.securityReport.passed && <span style={{ color: 'var(--crit)', marginLeft: 4 }}>!</span>}
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
                    <span className="muted" style={{ fontSize: 11 }}>
                      Saída da verificação{task.qaReport.testsRan ? <> (<span className="mono">{task.qaReport.testsRan}</span>, executada no sandbox)</> : ''}:
                    </span>
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

            {/* Conteúdo da Aba Revisão: veredito calculado em código a partir dos achados e critérios */}
            {tab === 'security' && (
              <div className="stack card card-pad" style={{ maxHeight: 420, overflowY: 'auto', gap: 12 }}>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span className="eyebrow">Reviewer e Security</span>
                  <span className={`badge ${task.securityReport?.passed ? 'badge-ok' : 'badge-crit'}`}>
                    {task.securityReport?.passed ? 'Sem bloqueios' : 'Há bloqueios'}
                  </span>
                  {Boolean(task.securityReport?.fixRounds) && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {task.securityReport?.fixRounds} rodada(s) automática(s) de correção já aplicada(s)
                    </span>
                  )}
                </div>

                {task.securityReport?.criteria && task.securityReport.criteria.length > 0 && (
                  <div className="stack" style={{ gap: 4 }}>
                    <span className="eyebrow">Critérios de aceite</span>
                    {task.securityReport.criteria.map(c => (
                      <div key={c.criterion} className="row" style={{ gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                        <span className={`badge ${c.met ? 'badge-ok' : 'badge-crit'}`}>{c.met ? 'atendido' : 'não atendido'}</span>
                        <span>{c.criterion}<span className="muted"> {c.evidence}</span></span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="stack" style={{ gap: 6 }}>
                  <span className="eyebrow">Achados ({task.securityReport?.findings.length ?? 0})</span>
                  {(task.securityReport?.findings ?? []).map((f, i) => (
                    <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start', fontSize: 13, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                      <span className={`badge ${f.severity === 'critical' || f.severity === 'high' ? 'badge-crit' : f.severity === 'medium' ? 'badge-warn' : ''}`}>{f.severity}</span>
                      <div className="stack" style={{ gap: 2, flex: 1 }}>
                        <span>{f.description}</span>
                        <span className="muted mono" style={{ fontSize: 11 }}>
                          {f.agentId ? AGENT_UI[f.agentId].name : ''}
                          {f.file ? ` · ${f.file}${f.line !== undefined ? `:${f.line}` : ''}` : ''}
                          {f.confidence !== undefined ? ` · confiança ${f.confidence}` : ''}
                        </span>
                      </div>
                      <button type="button" className="btn btn-sm" onClick={() => askFix(f)} disabled={processing} title="Preenche o pedido de ajuste com este achado">
                        Pedir correção
                      </button>
                    </div>
                  ))}
                </div>

                {task.securityReport?.summary && <Markdown>{task.securityReport.summary}</Markdown>}
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
