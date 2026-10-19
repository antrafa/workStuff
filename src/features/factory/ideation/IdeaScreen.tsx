import { useEffect, useState } from 'react'
import { ArrowLeft, Check, CheckCircle2, Download, RotateCcw, Send, Square, Trash2, Undo2, Zap } from 'lucide-react'
import { Async, ConfirmModal, Markdown, SkeletonRows } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { tx } from '@/lib/i18n'
import type { FactoryProjectView, FactoryTask } from '../../../../server/lib/factory/types.ts'
import { DOC_SECTIONS, PHASE_ORDER, type IdeaView } from '../../../../server/lib/ideation/types.ts'
import { IDEA_AGENT_UI, ideasPath, PHASE_UI, useIdeaRun } from './ideationApi'
import { ChallengePanel, DispatchedPanel, PlanPanel, SplitPanel } from './IdeaPanels'

type Props = {
  project: FactoryProjectView
  ideaId: string
  tasks: FactoryTask[]
  onBack: () => void
  onTasksChanged: () => void
}

export function IdeaScreen({ project, ideaId, tasks, onBack, onTasksChanged }: Props) {
  const loader = useAsync(() => api.get<IdeaView>(ideasPath(project.id, ideaId)), [ideaId])
  return (
    <Async state={loader}>
      {idea => <IdeaBody project={project} idea={idea} tasks={tasks} onIdea={loader.setData} onBack={onBack} onTasksChanged={onTasksChanged} />}
    </Async>
  )
}

function IdeaBody({ project, idea, tasks, onIdea, onBack, onTasksChanged }: Omit<Props, 'ideaId'> & { idea: IdeaView; onIdea: (idea: IdeaView) => void }) {
  const agent = useIdeaRun(project.id, idea.id, onIdea)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const busy = agent.running || idea.executing
  const canAdvance = ['explore', 'challenge', 'refine', 'plan'].includes(idea.phase)
  const canGoBack = ['challenge', 'refine', 'plan', 'split', 'dropped'].includes(idea.phase)
  const canAutopilot = canAdvance || idea.phase === 'split'

  const act = async (action: 'advance' | 'back') => {
    setActionError(null)
    try {
      onIdea(await api.post<IdeaView>(`${ideasPath(project.id, idea.id)}/${action}`))
    } catch (e) {
      setActionError((e as Error).message)
    }
  }

  const remove = async () => {
    setConfirmDelete(false)
    try {
      await api.delete(ideasPath(project.id, idea.id))
      onBack()
    } catch (e) {
      setActionError((e as Error).message)
    }
  }

  const nextPhase = PHASE_ORDER[PHASE_ORDER.indexOf(idea.phase) + 1]
  const advanceLabel = idea.phase === 'refine' && idea.recommendation === 'pivot'
    ? tx({ en: 'Change course (pivot): back to Explore', pt: 'Mudar o rumo (pivot): voltar a Explorar' })
    : idea.phase === 'refine' && idea.recommendation === 'stop'
      ? tx({ en: 'Stop: drop the idea', pt: 'Parar (stop): encerrar a ideia' })
      : tx({ en: `Approve and go to ${PHASE_UI[nextPhase]?.label}`, pt: `Aprovar e ir para ${PHASE_UI[nextPhase]?.label}` })

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" onClick={onBack}><ArrowLeft size={14} /> {tx({ en: 'Ideas', pt: 'Ideias' })}</button>
        <b style={{ fontSize: 16 }}>{idea.title}</b>
        <div className="spacer" />
        <a className="btn btn-sm" href={`/api${ideasPath(project.id, idea.id)}/markdown`} title={tx({ en: 'Download the living document as Markdown', pt: 'Baixar o documento vivo em Markdown' })}>
          <Download size={14} /> {tx({ en: 'Export', pt: 'Exportar' })}
        </a>
        <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> {tx({ en: 'Delete', pt: 'Excluir' })}</button>
      </div>

      <div className="idea-steps">
        {PHASE_ORDER.map((p, i) => (
          <span key={p} className={`badge ${p === idea.phase ? 'badge-signal' : PHASE_ORDER.indexOf(idea.phase) > i ? 'badge-ok' : ''}`} aria-current={p === idea.phase ? 'step' : undefined} title={PHASE_UI[p].hint}>
            {i + 1}. {PHASE_UI[p].label}{idea.stale?.includes(p) ? ' ⟲' : ''}
          </span>
        ))}
        {idea.phase === 'dropped' && <span className="badge badge-warn" aria-current="step">{PHASE_UI.dropped.label}</span>}
      </div>

      {idea.phase === 'dropped' && (
        <div className="callout callout-warn">{tx({ en: 'Dropped: ', pt: 'Encerrada: ' })}{idea.droppedReason}</div>
      )}
      {Boolean(idea.stale?.length) && (
        <div className="callout callout-info">
          {tx({ en: 'Phases marked ⟲ were done before you went back to an earlier phase. What is in them is kept, but may be out of date: redo them when you get there.', pt: 'As fases marcadas com ⟲ foram feitas antes de você voltar a uma fase anterior. O que está nelas fica guardado, mas pode estar desatualizado: refaça quando chegar lá.' })}
        </div>
      )}

      <div className="callout callout-info stack" style={{ gap: 2 }}>
        <b style={{ fontSize: 13 }}>{PHASE_UI[idea.phase].label}: {PHASE_UI[idea.phase].hint.toLowerCase()}</b>
        <span style={{ fontSize: 13 }}><b>{tx({ en: 'What to do now: ', pt: 'O que fazer agora: ' })}</b>{PHASE_UI[idea.phase].guide}</span>
      </div>

      {(canAdvance || canGoBack || canAutopilot) && (
        <div className="card card-pad stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="eyebrow" title={tx({ en: 'The panel checks in code what the phase needs before letting you go on', pt: 'O painel confere em código o que a fase pede antes de deixar você seguir' })}>{tx({ en: 'To move on', pt: 'Para seguir' })}</span>
            <div className="spacer" />
            {canAutopilot && (
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => agent.run('autopilot')}
                title={tx({ en: 'Runs every phase up to the split, accepting the agents\' recommendations. It stops for you at a high-severity attack the blue team could not answer, at a pivot or stop, and before sending anything to the factory.', pt: 'Roda todas as fases até a quebra, aceitando as recomendações dos agentes. Para e chama você num ataque de gravidade alta que o blue team não rebateu, num pivot ou stop, e antes de enviar qualquer coisa à fábrica.' })}>
                <Zap size={14} /> {tx({ en: 'Autopilot', pt: 'Piloto automático' })}
              </button>
            )}
            {canGoBack && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => act('back')}><Undo2 size={14} /> {idea.phase === 'dropped' ? tx({ en: 'Reopen', pt: 'Reabrir' }) : tx({ en: 'Back one phase', pt: 'Voltar uma fase' })}</button>}
            {canAdvance && <button type="button" className="btn btn-sm btn-primary" disabled={busy || idea.gate.length > 0} onClick={() => act('advance')}><Check size={14} /> {advanceLabel}</button>}
          </div>
          {canAdvance && (idea.gate.length > 0 ? (
            <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }} aria-label={tx({ en: 'Still missing', pt: 'Ainda falta' })}>
              {idea.gate.map(g => <li key={g}>{g}</li>)}
            </ul>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--ok)' }}><CheckCircle2 size={13} /> {tx({ en: 'Everything this phase needs is there. Read the document on the right and, if it says what you mean, approve.', pt: 'Tudo o que a fase pede está lá. Leia o documento ao lado e, se ele diz o que você quer, aprove.' })}</span>
          ))}
        </div>
      )}
      {idea.phase !== 'plan' && idea.phase !== 'split' && agent.errors.length > 0 && (
        <div className="callout callout-warn">{agent.errors.join(' ')}</div>
      )}
      {actionError && <div className="callout callout-crit">{actionError}</div>}

      <div className="idea-layout">
        <Conversation idea={idea} agent={agent} busy={busy} />
        <div className="stack" style={{ gap: 12 }}>
          {idea.phase === 'challenge' && <ChallengePanel project={project} idea={idea} agent={agent} busy={busy} onIdea={onIdea} />}
          {idea.phase === 'plan' && <PlanPanel project={project} idea={idea} agent={agent} busy={busy} onIdea={onIdea} />}
          {idea.phase === 'split' && <SplitPanel project={project} idea={idea} agent={agent} busy={busy} onIdea={onIdea} onTasksChanged={onTasksChanged} />}
          {idea.phase === 'dispatched' && <DispatchedPanel idea={idea} tasks={tasks} />}
          <LivingDocument idea={idea} />
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={tx({ en: `Delete the idea "${idea.title}"?`, pt: `Excluir a ideia "${idea.title}"?` })}
          confirmLabel={tx({ en: 'Delete idea', pt: 'Excluir ideia' })}
          icon={Trash2}
          action={tx({ en: 'delete idea', pt: 'excluir ideia' })}
          effects={[tx({ en: 'Tasks already sent to the factory stay on the board.', pt: 'Tarefas já enviadas à fábrica continuam no quadro.' })]}
          losses={[tx({ en: 'The conversation, the living document, the plan and the split.', pt: 'A conversa, o documento vivo, o plano e o split.' })]}
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

type Agent = ReturnType<typeof useIdeaRun>

function Conversation({ idea, agent, busy }: { idea: IdeaView; agent: Agent; busy: boolean }) {
  const [message, setMessage] = useState('')
  const closed = idea.phase === 'dispatched' || idea.phase === 'dropped'
  const facilitatorSpoke = idea.turns.some(t => t.role === 'facilitator')

  // A draft written for one phase does not carry into the next
  useEffect(() => setMessage(''), [idea.phase])

  const send = (text: string) => {
    agent.run('message', { message: text })
    setMessage('')
  }

  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <span className="eyebrow">{tx({ en: 'Conversation', pt: 'Conversa' })}</span>
      <div className="stack" style={{ gap: 8, maxHeight: 620, overflowY: 'auto' }}>
        {idea.turns.length === 0 && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {tx({ en: 'Start the first round: the facilitator rewrites your idea as a problem and asks up to three questions, each with a recommended answer.', pt: 'Comece a primeira rodada: o facilitador reescreve a sua ideia como problema e faz até três perguntas, cada uma com a resposta recomendada.' })}
          </p>
        )}
        {idea.turns.map((t, i) => (
          <div key={i} className="idea-turn stack" style={{ ['--turn-color' as string]: IDEA_AGENT_UI[t.role].color, gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: IDEA_AGENT_UI[t.role].color }} title={IDEA_AGENT_UI[t.role].role || undefined}>{IDEA_AGENT_UI[t.role].name}</span>
            {t.role === 'system' ? <span className="muted" style={{ fontSize: 12 }}>{t.text}</span> : <Markdown>{t.text}</Markdown>}
            {t.questions?.map((q, qi) => (
              <div key={qi} className="callout callout-info stack" style={{ gap: 4 }}>
                <b style={{ fontSize: 13 }}>Q{qi + 1}. {q.question}</b>
                {q.recommendation && (
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ fontSize: 13, flex: 1 }}><b>{tx({ en: 'Recommended: ', pt: 'Recomendado: ' })}</b>{q.recommendation}</span>
                    {!closed && i === idea.turns.length - 1 && (
                      <button type="button" className="btn btn-sm" title={tx({ en: 'Copies this answer into your reply below; Send when you are done', pt: 'Copia esta resposta para a sua resposta abaixo; clique em Enviar quando terminar' })} onClick={() => setMessage(m => `${m}${m ? '\n' : ''}Q${qi + 1}: ${tx({ en: 'yes', pt: 'sim' })}, ${q.recommendation}`)}>
                        {tx({ en: 'Use this answer', pt: 'Usar esta resposta' })}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {agent.running && (
          <div className="idea-turn stack" style={{ ['--turn-color' as string]: agent.live.agentId ? IDEA_AGENT_UI[agent.live.agentId].color : undefined, gap: 4 }}>
            <span className="row muted" style={{ fontSize: 12, gap: 6 }}><span className="live-dot" /> {agent.live.status}</span>
            {agent.live.text ? <Markdown>{agent.live.text}</Markdown> : <SkeletonRows rows={3} height={16} />}
          </div>
        )}
      </div>
      {agent.error && <div className="callout callout-crit">{agent.error}</div>}

      {!closed && (
        <div className="stack" style={{ gap: 6 }}>
          <textarea className="textarea" rows={3} value={message} disabled={busy} onChange={e => setMessage(e.target.value)}
            placeholder={tx({ en: 'Answer the questions in your own words, correct the facilitator or ask something. Ctrl+Enter sends.', pt: 'Responda às perguntas com as suas palavras, corrija o facilitador ou pergunte algo. Ctrl+Enter envia.' })}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && message.trim()) send(message.trim())
            }} />
          <div className="row" style={{ gap: 8 }}>
            {agent.running ? (
              <button type="button" className="btn btn-sm" onClick={agent.stop}><Square size={12} /> {tx({ en: 'Stop', pt: 'Parar' })}</button>
            ) : (
              <>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => send('')} title={tx({ en: 'The facilitator opens the next round from where the document is', pt: 'O facilitador abre a próxima rodada a partir de onde o documento está' })}>
                  <RotateCcw size={13} /> {facilitatorSpoke ? tx({ en: 'Next round', pt: 'Próxima rodada' }) : tx({ en: 'Start', pt: 'Começar' })}
                </button>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => send(tx({ en: 'advance', pt: 'avançar' }))} title={tx({ en: 'The facilitator fills in what is missing in this phase with its recommended answers, marked as assumptions to confirm later', pt: 'O facilitador preenche o que falta nesta fase com as respostas que recomendou, marcadas como premissas a confirmar depois' })}>{tx({ en: 'Fill in the rest with the recommendations', pt: 'Completar com as recomendações' })}</button>
              </>
            )}
            <div className="spacer" />
            <button type="button" className="btn btn-sm btn-primary" disabled={busy || !message.trim()} onClick={() => send(message.trim())}><Send size={13} /> {tx({ en: 'Send', pt: 'Enviar' })}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function LivingDocument({ idea }: { idea: IdeaView }) {
  const body = DOC_SECTIONS.filter(([key]) => idea.doc[key]?.trim()).map(([key, pt, en]) => `## ${tx({ en, pt })}\n\n${idea.doc[key]}`).join('\n\n')
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <span className="eyebrow">{tx({ en: 'Living document', pt: 'Documento vivo' })}</span>
      <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'The summary of the idea, filled in by the conversation. It is what the plan is built from; Export downloads it.', pt: 'O resumo da ideia, preenchido pela conversa. É a partir dele que o plano é feito; Exportar baixa uma cópia.' })}</span>
      <Markdown>{body || tx({ en: '_Empty for now: it fills up as the conversation goes._', pt: '_Vazio por enquanto: ele se preenche conforme a conversa._' })}</Markdown>
    </div>
  )
}
