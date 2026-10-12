import { useState } from 'react'
import { GitBranch, Pencil, Rocket, Shield, Swords, Workflow } from 'lucide-react'
import { parse, stringify } from 'yaml'
import { Markdown } from '@/ui'
import { api } from '@/lib/api'
import { tx } from '@/lib/i18n'
import type { FactoryProjectView, FactoryTask } from '../../../../server/lib/factory/types.ts'
import type { AttackDecision, ChallengeAttack, ExecutableTask, IdeaView, MasterTask } from '../../../../server/lib/ideation/types.ts'
import { FactoryStatusChip } from '../timeline/FactoryStatusChip'
import { EVIDENCE_UI, ideasPath, SEVERITY_UI, STANCE_UI, type useIdeaRun } from './ideationApi'

type Agent = ReturnType<typeof useIdeaRun>
type PanelProps = { project: FactoryProjectView; idea: IdeaView; agent: Agent; busy: boolean; onIdea: (idea: IdeaView) => void }

const SEVERITY_BADGE = { alta: 'badge-crit', media: 'badge-warn', baixa: '' } as const

// help: what the choice does to the idea, shown on hover
const DECISIONS: { id: AttackDecision; label: string; help: string }[] = [
  { id: 'mitigate', label: tx({ en: 'Adopt the mitigation', pt: 'Adotar a mitigação' }), help: tx({ en: 'The blue team\'s way to reduce the risk becomes a requirement of the idea', pt: 'O jeito que o blue team propôs para reduzir o risco vira um requisito da ideia' }) },
  { id: 'accept', label: tx({ en: 'Accept the risk', pt: 'Aceitar o risco' }), help: tx({ en: 'The risk is real, but you go on knowing it; it is recorded in the document', pt: 'O risco existe, mas você segue sabendo dele; ele fica registrado no documento' }) },
  { id: 'discard', label: tx({ en: 'Does not apply', pt: 'Não procede' }), help: tx({ en: 'The criticism does not apply to this idea; it is set aside', pt: 'A crítica não vale para esta ideia; ela é deixada de lado' }) },
  { id: 'kill', label: tx({ en: 'Ends the idea', pt: 'Encerra a ideia' }), help: tx({ en: 'The criticism is fatal: the idea is dropped (you can reopen it later)', pt: 'A crítica é fatal: a ideia é encerrada (dá para reabrir depois)' }) },
]

// ── Challenge ────────────────────────────────────────────────────────────────

export function ChallengePanel({ project, idea, agent, busy, onIdea }: PanelProps) {
  const [error, setError] = useState<string | null>(null)
  const rounds = idea.challenge ?? []
  const undecided = rounds.flatMap(r => r.attacks).filter(a => !a.decision).length

  const decide = async (round: number, attack: ChallengeAttack, decision: AttackDecision, note?: string) => {
    setError(null)
    try {
      onIdea(await api.post<IdeaView>(`${ideasPath(project.id, idea.id)}/decisions`, { decisions: [{ round, id: attack.id, decision, note }] }))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <span className="eyebrow">{tx({ en: 'Criticisms and defenses', pt: 'Críticas e defesas' })}</span>
        <div className="spacer" />
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || undecided > 0 || rounds.length >= 2} onClick={() => agent.run('challenge')}
          title={rounds.length >= 2 ? tx({ en: 'The challenge has at most 2 rounds', pt: 'O desafio tem no máximo 2 rodadas' }) : undecided ? tx({ en: 'Decide every attack of this round first', pt: 'Decida todos os ataques desta rodada antes' }) : undefined}>
          <Swords size={14} /> {rounds.length ? tx({ en: 'Round 2: attack the mitigated version', pt: 'Rodada 2: atacar a versão mitigada' }) : tx({ en: 'Run the challenge', pt: 'Rodar o desafio' })}
        </button>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        {tx({ en: 'The red team (the devil\'s advocate) lists what can go wrong with the idea, and the blue team (the defender) answers each point. You decide what to do with each attack: hover a choice to see what it does. A second round attacks the idea again, now with your decisions in it. At most 2 rounds.', pt: 'O red team (o advogado do diabo) lista o que pode dar errado com a ideia, e o blue team (o defensor) responde a cada ponto. Você decide o que fazer com cada ataque: passe o mouse sobre uma opção para ver o que ela faz. Uma segunda rodada ataca a ideia de novo, já com as suas decisões. No máximo 2 rodadas.' })}
      </span>
      {error && <div className="callout callout-crit">{error}</div>}
      {rounds.map(r => (
        <div key={r.round} className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">{tx({ en: `Round ${r.round}`, pt: `Rodada ${r.round}` })}</span>
          {r.attacks.map(a => <AttackCard key={a.id} attack={a} disabled={busy} onDecide={(d, note) => decide(r.round, a, d, note)} />)}
        </div>
      ))}
    </div>
  )
}

function AttackCard({ attack, disabled, onDecide }: { attack: ChallengeAttack; disabled: boolean; onDecide: (d: AttackDecision, note?: string) => void }) {
  const [note, setNote] = useState(attack.note ?? '')
  return (
    <div className="card stack" style={{ gap: 6, padding: 10 }}>
      <div className="idea-turn stack" style={{ ['--turn-color' as string]: 'var(--fx-redteam)', gap: 2 }}>
        <span className="row" style={{ gap: 6, fontSize: 12 }}>
          <b style={{ color: 'var(--fx-redteam)' }}>{attack.id}</b>
          <span className={`badge ${SEVERITY_BADGE[attack.severity]}`}>{SEVERITY_UI[attack.severity] ?? attack.severity}</span>
          <span className="muted" title={tx({ en: 'How much backs this criticism: strong (data, facts), weak (one person\'s opinion) or none', pt: 'O quanto sustenta esta crítica: forte (dados, fatos), fraca (a opinião de uma pessoa) ou nenhuma' })}>{EVIDENCE_UI[attack.evidence] ?? attack.evidence}</span>
          <span className="muted">· {tx({ en: 'about', pt: 'sobre' })}: {attack.target}</span>
        </span>
        <span style={{ fontSize: 13 }}>{attack.attack}</span>
      </div>
      {attack.stance && (
        <div className="idea-turn stack" style={{ ['--turn-color' as string]: 'var(--fx-blueteam)', gap: 2 }}>
          <span className="row" style={{ gap: 6, fontSize: 12 }}><Shield size={12} style={{ color: 'var(--fx-blueteam)' }} /> <b>{STANCE_UI[attack.stance] ?? attack.stance}</b></span>
          <span style={{ fontSize: 13 }}>{attack.argument}</span>
          {attack.mitigation && <span style={{ fontSize: 13 }}><b>{tx({ en: 'Mitigation', pt: 'Mitigação' })}:</b> {attack.mitigation}</span>}
        </div>
      )}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 160 }} value={note} onChange={e => setNote(e.target.value)} placeholder={tx({ en: 'why you decided this (optional)', pt: 'por que você decidiu assim (opcional)' })} />
        {DECISIONS.map(d => (
          <button key={d.id} type="button" className="chip" aria-pressed={attack.decision === d.id} disabled={disabled} title={d.help} onClick={() => onDecide(d.id, note)}>{d.label}</button>
        ))}
      </div>
    </div>
  )
}

// ── YAML editor shared by plan and split ─────────────────────────────────────

function YamlEditor<T>({ value, onSave, onClose }: { value: T[]; onSave: (items: T[]) => Promise<void>; onClose: () => void }) {
  const [text, setText] = useState(() => stringify(value))
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setError(null)
    try {
      const parsed = parse(text)
      if (!Array.isArray(parsed)) throw new Error(tx({ en: 'the YAML must be a list', pt: 'o YAML precisa ser uma lista' }))
      await onSave(parsed)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <textarea className="textarea mono" rows={18} value={text} onChange={e => setText(e.target.value)} spellCheck={false} />
      {error && <div className="callout callout-crit">{error}</div>}
      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-sm" onClick={onClose}>{tx({ en: 'Cancel', pt: 'Cancelar' })}</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={save}>{tx({ en: 'Save', pt: 'Salvar' })}</button>
      </div>
    </div>
  )
}

function Errors({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div className="callout callout-warn">
      <b>{tx({ en: 'Still to fix before going on (the agent already tried to fix it on its own; ask it in the instructions or edit by hand): ', pt: 'Ainda falta corrigir antes de seguir (o agente já tentou corrigir sozinho; peça nas instruções ou edite à mão): ' })}</b>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{items.map(e => <li key={e}>{e}</li>)}</ul>
    </div>
  )
}

const bullets = (items: string[]) => items.map(i => `- ${i}`).join('\n')

// ── Plan ─────────────────────────────────────────────────────────────────────

export function PlanPanel({ project, idea, agent, busy, onIdea }: PanelProps) {
  const [instructions, setInstructions] = useState('')
  const [editing, setEditing] = useState(false)
  const masters = idea.masters ?? []

  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <span className="eyebrow">{tx({ en: 'Steps of the work (master tasks)', pt: 'Etapas do trabalho (tarefas master)' })}</span>
        <div className="spacer" />
        {masters.length > 0 && !editing && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setEditing(true)} title={tx({ en: 'Edit the plan by hand, as structured text (YAML)', pt: 'Editar o plano à mão, como texto estruturado (YAML)' })}><Pencil size={13} /> {tx({ en: 'Edit (YAML)', pt: 'Editar (YAML)' })}</button>}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        {tx({ en: 'Each step is a large delivery that works on its own. The first one, marked "walking skeleton", is the simplest version that already works end to end; the others build on it. Each step lists the scenarios that say when it is done.', pt: 'Cada etapa é uma entrega grande que funciona sozinha. A primeira, marcada como "walking skeleton", é a versão mais simples que já funciona de ponta a ponta; as outras crescem a partir dela. Cada etapa traz os cenários que dizem quando ela está pronta.' })}
      </span>
      <textarea className="textarea" rows={2} value={instructions} disabled={busy} onChange={e => setInstructions(e.target.value)}
        placeholder={tx({ en: 'Instructions for the Planner (optional): "split M2 in two", "the admin comes later"…', pt: 'Instruções para o Planner (opcional): "divida a M2 em duas", "o admin fica para depois"…' })} />
      <div className="row">
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => agent.run('plan', { instructions })}>
          <Workflow size={14} /> {masters.length ? tx({ en: 'Redo the plan', pt: 'Refazer o plano' }) : tx({ en: 'Generate the plan', pt: 'Gerar o plano' })}
        </button>
      </div>
      <Errors items={agent.errors} />
      {editing ? (
        <YamlEditor<MasterTask> value={masters} onClose={() => setEditing(false)}
          onSave={async items => onIdea(await api.put<IdeaView>(`${ideasPath(project.id, idea.id)}/masters`, { masters: items }))} />
      ) : (
        masters.map(m => (
          <details key={m.key} className="card" style={{ padding: 10 }} open={masters.length <= 3}>
            <summary style={{ cursor: 'pointer' }}>
              <b>{m.key}</b> · {m.title}
              {m.walkingSkeleton && <span className="badge badge-signal" style={{ marginLeft: 6 }} title={tx({ en: 'The simplest version that already works end to end: everything else builds on it', pt: 'A versão mais simples que já funciona de ponta a ponta: todo o resto cresce a partir dela' })}>walking skeleton</span>}
              {m.dependsOn.length > 0 && <span className="muted" style={{ fontSize: 12 }}> · {tx({ en: 'after', pt: 'depois de' })} {m.dependsOn.join(', ')}</span>}
            </summary>
            <Markdown>{[
              m.objective,
              `**${tx({ en: 'Repositories', pt: 'Repositórios' })}:** ${m.repos.join(', ')}${m.newRepos?.length ? ` (${tx({ en: 'new', pt: 'novos' })}: ${m.newRepos.join(', ')})` : ''}`,
              m.inScope.length ? `**${tx({ en: 'In scope', pt: 'No escopo' })}**\n${bullets(m.inScope)}` : '',
              m.outOfScope.length ? `**${tx({ en: 'Out of scope', pt: 'Fora do escopo' })}**\n${bullets(m.outOfScope)}` : '',
              m.scenarios.length ? `**${tx({ en: 'When it is done (acceptance scenarios)', pt: 'Quando está pronta (cenários de aceite)' })}**\n\n` + '```gherkin\n' + m.scenarios.join('\n\n') + '\n```' : '',
            ].filter(Boolean).join('\n\n')}</Markdown>
          </details>
        ))
      )}
    </div>
  )
}

// ── Split ────────────────────────────────────────────────────────────────────

type DispatchOut = { idea: IdeaView; created: FactoryTask[]; skipped: { key: string; reason: string }[] }

export function SplitPanel({ project, idea, agent, busy, onIdea, onTasksChanged }: PanelProps & { onTasksChanged: () => void }) {
  const [instructions, setInstructions] = useState('')
  const [editing, setEditing] = useState(false)
  const [sent, setSent] = useState<DispatchOut | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tasks = idea.tasks ?? []

  const dispatch = async () => {
    setError(null)
    try {
      const out = await api.post<DispatchOut>(`${ideasPath(project.id, idea.id)}/dispatch`)
      setSent(out)
      onIdea(out.idea)
      onTasksChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <span className="eyebrow">{tx({ en: 'Tasks for the factory', pt: 'Tarefas para a fábrica' })}</span>
        <div className="spacer" />
        {tasks.length > 0 && !editing && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setEditing(true)} title={tx({ en: 'Edit the tasks by hand, as structured text (YAML)', pt: 'Editar as tarefas à mão, como texto estruturado (YAML)' })}><Pencil size={13} /> {tx({ en: 'Edit (YAML)', pt: 'Editar (YAML)' })}</button>}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        {tx({ en: 'Each task touches one repository and one technology (backend, frontend, mobile, infra or docs), small enough to review at once. When two tasks meet (an endpoint, an event), both write down what was agreed. "after" says which task has to be done first.', pt: 'Cada tarefa mexe num só repositório e numa só tecnologia (backend, frontend, mobile, infra ou docs), pequena o bastante para revisar de uma vez. Quando duas tarefas se encontram (um endpoint, um evento), as duas registram o que foi combinado. "depois de" diz qual tarefa precisa estar pronta antes.' })}
      </span>
      <textarea className="textarea" rows={2} value={instructions} disabled={busy} onChange={e => setInstructions(e.target.value)}
        placeholder={tx({ en: 'Instructions for the Splitter (optional): "keep the migration in its own task"…', pt: 'Instruções para o Splitter (opcional): "deixe a migração numa tarefa só dela"…' })} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => agent.run('split', { instructions })}>
          <GitBranch size={14} /> {tasks.length ? tx({ en: 'Break every step down again', pt: 'Quebrar todas as etapas de novo' }) : tx({ en: 'Break the steps into tasks', pt: 'Quebrar as etapas em tarefas' })}
        </button>
        {tasks.length > 0 && (idea.masters ?? []).map(m => (
          <button key={m.key} type="button" className="btn btn-sm" disabled={busy} title={tx({ en: `Breaks only step ${m.key} down again; the other tasks stay`, pt: `Quebra de novo só a etapa ${m.key}; as outras tarefas ficam` })} onClick={() => agent.run('split', { instructions, master: m.key })}>{tx({ en: `Redo ${m.key}`, pt: `Refazer ${m.key}` })}</button>
        ))}
        <div className="spacer" />
        {tasks.length > 0 && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || idea.gate.length > 0} onClick={dispatch}
            title={idea.gate.length ? idea.gate.join('\n') : tx({ en: 'Puts each task on the Board as a factory task, the ones others wait for first', pt: 'Põe cada tarefa no Quadro como uma tarefa da fábrica, primeiro as que as outras esperam' })}>
            <Rocket size={14} /> {tx({ en: 'Send to the factory', pt: 'Enviar à fábrica' })}
          </button>
        )}
      </div>
      <Errors items={agent.errors.length ? agent.errors : tasks.length ? idea.gate : []} />
      {error && <div className="callout callout-crit">{error}</div>}
      {sent?.skipped.length ? (
        <div className="callout callout-warn">
          {tx({ en: 'Waiting for a later send:', pt: 'Aguardando um próximo envio:' })}
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{sent.skipped.map(s => <li key={s.key}><b>{s.key}</b>: {s.reason}</li>)}</ul>
        </div>
      ) : null}
      {editing ? (
        <YamlEditor<ExecutableTask> value={tasks} onClose={() => setEditing(false)}
          onSave={async items => onIdea(await api.put<IdeaView>(`${ideasPath(project.id, idea.id)}/tasks`, { tasks: items }))} />
      ) : (
        (idea.masters ?? []).map(m => (
          <div key={m.key} className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">{m.key} · {m.title}</span>
            {tasks.filter(t => t.masterKey === m.key).map(t => <TaskCard key={t.key} task={t} factoryId={idea.dispatched?.[t.key]} />)}
          </div>
        ))
      )}
    </div>
  )
}

function TaskCard({ task, factoryId }: { task: ExecutableTask; factoryId?: string }) {
  return (
    <details className="card" style={{ padding: 10 }}>
      <summary style={{ cursor: 'pointer' }}>
        <b>{task.key}</b> · {task.title}{' '}
        <span className="badge badge-info">{task.repo}</span> <span className="badge">{task.stack}</span>
        {task.dependsOn.length > 0 && <span className="muted" style={{ fontSize: 12 }}> · {tx({ en: 'after', pt: 'depois de' })} {task.dependsOn.join(', ')}</span>}
        {factoryId && <span className="badge badge-ok" style={{ marginLeft: 6 }}>{tx({ en: 'sent', pt: 'enviada' })}</span>}
      </summary>
      <Markdown>{[
        task.objective,
        task.inScope.length ? `**${tx({ en: 'In scope', pt: 'No escopo' })}**\n${bullets(task.inScope)}` : '',
        task.outOfScope.length ? `**${tx({ en: 'Out of scope', pt: 'Fora do escopo' })}**\n${bullets(task.outOfScope)}` : '',
        task.contracts.length ? `**${tx({ en: 'Agreed with the other tasks (contracts)', pt: 'Combinado com as outras tarefas (contratos)' })}**\n${bullets(task.contracts)}` : '',
        task.scenarios.length ? `**${tx({ en: 'When it is done (acceptance scenarios)', pt: 'Quando está pronta (cenários de aceite)' })}**\n\n` + '```gherkin\n' + task.scenarios.join('\n\n') + '\n```' : '',
        task.verifyHint ? `**${tx({ en: 'Command that checks it', pt: 'Comando que confere' })}:** \`${task.verifyHint}\`` : '',
      ].filter(Boolean).join('\n\n')}</Markdown>
    </details>
  )
}

// ── Dispatched ───────────────────────────────────────────────────────────────

export function DispatchedPanel({ idea, tasks }: { idea: IdeaView; tasks: FactoryTask[] }) {
  const sent = Object.entries(idea.dispatched ?? {})
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <span className="eyebrow">{tx({ en: 'On the board', pt: 'No quadro' })}</span>
      {sent.map(([key, id]) => {
        const task = tasks.find(t => t.id === id)
        return (
          <div key={key} className="row" style={{ gap: 8, fontSize: 13 }}>
            <b className="mono">{key}</b>
            <span style={{ flex: 1 }}>{task?.title ?? tx({ en: 'removed from the board', pt: 'removida do quadro' })}</span>
            {task && <FactoryStatusChip state={task.state} />}
          </div>
        )
      })}
    </div>
  )
}
