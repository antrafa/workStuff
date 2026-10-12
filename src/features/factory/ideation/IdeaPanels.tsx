import { useState } from 'react'
import { GitBranch, Pencil, Rocket, Shield, Swords, Workflow } from 'lucide-react'
import { parse, stringify } from 'yaml'
import { Markdown } from '@/ui'
import { api } from '@/lib/api'
import { tx } from '@/lib/i18n'
import type { FactoryProjectView, FactoryTask } from '../../../../server/lib/factory/types.ts'
import type { AttackDecision, ChallengeAttack, ExecutableTask, IdeaView, MasterTask } from '../../../../server/lib/ideation/types.ts'
import { FactoryStatusChip } from '../timeline/FactoryStatusChip'
import { ideasPath, type useIdeaRun } from './ideationApi'

type Agent = ReturnType<typeof useIdeaRun>
type PanelProps = { project: FactoryProjectView; idea: IdeaView; agent: Agent; busy: boolean; onIdea: (idea: IdeaView) => void }

const SEVERITY_BADGE = { alta: 'badge-crit', media: 'badge-warn', baixa: '' } as const

const DECISIONS: { id: AttackDecision; label: string }[] = [
  { id: 'mitigate', label: tx({ en: 'Mitigate', pt: 'Mitigar' }) },
  { id: 'accept', label: tx({ en: 'Accept the risk', pt: 'Aceitar o risco' }) },
  { id: 'discard', label: tx({ en: 'Discard', pt: 'Descartar' }) },
  { id: 'kill', label: tx({ en: 'Kills the idea', pt: 'Derruba a ideia' }) },
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
        <span className="eyebrow">{tx({ en: 'Red team × blue team', pt: 'Red team × blue team' })}</span>
        <div className="spacer" />
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || undecided > 0 || rounds.length >= 2} onClick={() => agent.run('challenge')}
          title={undecided ? tx({ en: 'Decide every attack first', pt: 'Decida todos os ataques antes' }) : undefined}>
          <Swords size={14} /> {rounds.length ? tx({ en: 'Round 2: attack the mitigated version', pt: 'Rodada 2: atacar a versão mitigada' }) : tx({ en: 'Run the challenge', pt: 'Rodar o desafio' })}
        </button>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        {tx({ en: 'The red team attacks the idea and the blue team answers each attack. They never talk to each other: you decide. At most 2 rounds.', pt: 'O red team ataca a ideia e o blue team responde a cada ataque. Eles não conversam entre si: quem decide é você. No máximo 2 rodadas.' })}
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
          <span className={`badge ${SEVERITY_BADGE[attack.severity]}`}>{attack.severity}</span>
          <span className="muted">{tx({ en: 'evidence', pt: 'evidência' })}: {attack.evidence}</span>
          <span className="muted">· {attack.target}</span>
        </span>
        <span style={{ fontSize: 13 }}>{attack.attack}</span>
      </div>
      {attack.stance && (
        <div className="idea-turn stack" style={{ ['--turn-color' as string]: 'var(--fx-blueteam)', gap: 2 }}>
          <span className="row" style={{ gap: 6, fontSize: 12 }}><Shield size={12} style={{ color: 'var(--fx-blueteam)' }} /> <b>{attack.stance}</b></span>
          <span style={{ fontSize: 13 }}>{attack.argument}</span>
          {attack.mitigation && <span style={{ fontSize: 13 }}><b>{tx({ en: 'Mitigation', pt: 'Mitigação' })}:</b> {attack.mitigation}</span>}
        </div>
      )}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 160 }} value={note} onChange={e => setNote(e.target.value)} placeholder={tx({ en: 'note (optional)', pt: 'nota (opcional)' })} />
        {DECISIONS.map(d => (
          <button key={d.id} type="button" className="chip" aria-pressed={attack.decision === d.id} disabled={disabled} onClick={() => onDecide(d.id, note)}>{d.label}</button>
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
      <b>{tx({ en: 'The check refused: ', pt: 'A verificação recusou: ' })}</b>
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
        <span className="eyebrow">{tx({ en: 'Master tasks', pt: 'Tarefas master' })}</span>
        <div className="spacer" />
        {masters.length > 0 && !editing && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setEditing(true)}><Pencil size={13} /> {tx({ en: 'Edit (YAML)', pt: 'Editar (YAML)' })}</button>}
      </div>
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
              {m.walkingSkeleton && <span className="badge badge-signal" style={{ marginLeft: 6 }}>walking skeleton</span>}
              {m.dependsOn.length > 0 && <span className="muted" style={{ fontSize: 12 }}> · {tx({ en: 'after', pt: 'depois de' })} {m.dependsOn.join(', ')}</span>}
            </summary>
            <Markdown>{[
              m.objective,
              `**${tx({ en: 'Repositories', pt: 'Repositórios' })}:** ${m.repos.join(', ')}${m.newRepos?.length ? ` (${tx({ en: 'new', pt: 'novos' })}: ${m.newRepos.join(', ')})` : ''}`,
              m.inScope.length ? `**${tx({ en: 'In scope', pt: 'No escopo' })}**\n${bullets(m.inScope)}` : '',
              m.outOfScope.length ? `**${tx({ en: 'Out of scope', pt: 'Fora do escopo' })}**\n${bullets(m.outOfScope)}` : '',
              m.scenarios.length ? '```gherkin\n' + m.scenarios.join('\n\n') + '\n```' : '',
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
        <span className="eyebrow">{tx({ en: 'Executable tasks', pt: 'Tarefas executáveis' })}</span>
        <div className="spacer" />
        {tasks.length > 0 && !editing && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setEditing(true)}><Pencil size={13} /> {tx({ en: 'Edit (YAML)', pt: 'Editar (YAML)' })}</button>}
      </div>
      <textarea className="textarea" rows={2} value={instructions} disabled={busy} onChange={e => setInstructions(e.target.value)}
        placeholder={tx({ en: 'Instructions for the Splitter (optional)', pt: 'Instruções para o Splitter (opcional)' })} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => agent.run('split', { instructions })}>
          <GitBranch size={14} /> {tasks.length ? tx({ en: 'Split every master again', pt: 'Quebrar todas de novo' }) : tx({ en: 'Split the masters', pt: 'Quebrar as masters' })}
        </button>
        {tasks.length > 0 && (idea.masters ?? []).map(m => (
          <button key={m.key} type="button" className="btn btn-sm" disabled={busy} onClick={() => agent.run('split', { instructions, master: m.key })}>{tx({ en: `Redo ${m.key}`, pt: `Refazer ${m.key}` })}</button>
        ))}
        <div className="spacer" />
        {tasks.length > 0 && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || idea.gate.length > 0} onClick={dispatch}
            title={idea.gate.length ? idea.gate.join('\n') : tx({ en: 'Creates one factory task per executable task, dependencies first', pt: 'Cria uma tarefa da fábrica por tarefa executável, dependências primeiro' })}>
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
        task.contracts.length ? `**${tx({ en: 'Contracts with sibling tasks', pt: 'Contratos com as irmãs' })}**\n${bullets(task.contracts)}` : '',
        task.scenarios.length ? '```gherkin\n' + task.scenarios.join('\n\n') + '\n```' : '',
        task.verifyHint ? `**${tx({ en: 'Verification', pt: 'Verificação' })}:** \`${task.verifyHint}\`` : '',
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
