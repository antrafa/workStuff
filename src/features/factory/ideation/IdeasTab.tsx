import { useState } from 'react'
import { Lightbulb, Plus, Trash2 } from 'lucide-react'
import { Async, ConfirmModal, Empty, Modal } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { tx } from '@/lib/i18n'
import type { FactoryProjectView, FactoryTask } from '../../../../server/lib/factory/types.ts'
import type { IdeaView } from '../../../../server/lib/ideation/types.ts'
import { ideasPath, PHASE_UI } from './ideationApi'
import { IdeaScreen } from './IdeaScreen'

type Props = {
  project: FactoryProjectView
  tasks: FactoryTask[]
  onTasksChanged: () => void
}

export function IdeasTab({ project, tasks, onTasksChanged }: Props) {
  const ideas = useAsync(() => api.get<IdeaView[]>(ideasPath(project.id)), [project.id])
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<IdeaView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const remove = async (idea: IdeaView) => {
    setDeleting(null)
    setError(null)
    try {
      await api.delete(ideasPath(project.id, idea.id))
      ideas.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (openId) {
    return (
      <IdeaScreen
        project={project}
        ideaId={openId}
        tasks={tasks}
        onBack={() => {
          setOpenId(null)
          ideas.reload()
        }}
        onTasksChanged={onTasksChanged}
      />
    )
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <span className="muted" style={{ fontSize: 13 }}>
          {tx({ en: 'Bring an idea: the factory helps refine it, challenges it, plans it and splits it into tasks for the board.', pt: 'Traga uma ideia: a fábrica ajuda a refinar, desafia, planeja e quebra em tarefas para o quadro.' })}
        </span>
        <div className="spacer" />
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> {tx({ en: 'New idea', pt: 'Nova ideia' })}
        </button>
      </div>

      <Async state={ideas}>
        {list =>
          list.length === 0 ? (
            <Empty icon={Lightbulb} title={tx({ en: 'No idea in this project yet', pt: 'Nenhuma ideia neste projeto ainda' })} />
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {list.map(idea => (
                <div key={idea.id} className="row" style={{ gap: 6 }}>
                  <button type="button" className="card card-pad interactive row" style={{ textAlign: 'left', gap: 12, flex: 1 }} onClick={() => setOpenId(idea.id)}>
                    <Lightbulb size={16} />
                    <span className="stack" style={{ gap: 2, flex: 1 }}>
                      <b>{idea.title}</b>
                      <span className="muted" style={{ fontSize: 12 }}>{PHASE_UI[idea.phase].hint}</span>
                    </span>
                    {idea.executing && <span className="live-dot" title={tx({ en: 'an agent is running', pt: 'um agente está rodando' })} />}
                    <span className={`badge ${idea.phase === 'dispatched' ? 'badge-ok' : idea.phase === 'dropped' ? 'badge-warn' : 'badge-info'}`}>{PHASE_UI[idea.phase].label}</span>
                    <span className="muted mono" style={{ fontSize: 11 }}>{idea.updatedAt.slice(0, 10)}</span>
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" title={tx({ en: 'Delete idea', pt: 'Excluir ideia' })} aria-label={tx({ en: `Delete ${idea.title}`, pt: `Excluir ${idea.title}` })} onClick={() => setDeleting(idea)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )
        }
      </Async>

      {error && <div className="callout callout-crit">{error}</div>}

      {deleting && (
        <ConfirmModal
          title={tx({ en: `Delete the idea "${deleting.title}"?`, pt: `Excluir a ideia "${deleting.title}"?` })}
          confirmLabel={tx({ en: 'Delete idea', pt: 'Excluir ideia' })}
          icon={Trash2}
          action={tx({ en: 'delete idea', pt: 'excluir ideia' })}
          effects={[tx({ en: 'Stops its agent, if one is running. Tasks already sent to the factory stay on the board.', pt: 'Para o agente dela, se houver um rodando. Tarefas já enviadas à fábrica continuam no quadro.' })]}
          losses={[tx({ en: 'The conversation, the living document, the plan and the split.', pt: 'A conversa, o documento vivo, o plano e o split.' })]}
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}

      {creating && (
        <NewIdeaModal
          projectId={project.id}
          onClose={() => setCreating(false)}
          onCreated={idea => {
            setCreating(false)
            setOpenId(idea.id)
          }}
        />
      )}
    </div>
  )
}

function NewIdeaModal({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: (idea: IdeaView) => void }) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onCreated(await api.post<IdeaView>(ideasPath(projectId), { title, text }))
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <Modal title={tx({ en: 'New idea', pt: 'Nova ideia' })} onClose={onClose}>
      <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
        <label className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">{tx({ en: 'Title', pt: 'Título' })}</span>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} required />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">{tx({ en: 'The idea, in your words', pt: 'A ideia, com as suas palavras' })}</span>
          <textarea className="textarea" rows={6} value={text} onChange={e => setText(e.target.value)} required
            placeholder={tx({ en: 'What you want, for whom, and why now. Rough is fine: the next step is to refine it.', pt: 'O que você quer, para quem e por que agora. Pode ser cru: o próximo passo é refinar.' })} />
        </label>
        {error && <div className="callout callout-crit">{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>{tx({ en: 'Cancel', pt: 'Cancelar' })}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}><Lightbulb size={15} /> {tx({ en: 'Start', pt: 'Começar' })}</button>
        </div>
      </form>
    </Modal>
  )
}
