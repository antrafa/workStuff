import { useState } from 'react'
import { FolderInput, GitBranch, Trash2 } from 'lucide-react'
import { ConfirmModal, useToast } from '@/ui'
import { api } from '@/lib/api'
import { tx } from '@/lib/i18n'
import type { FactoryProjectView } from '../../../../server/lib/factory/types.ts'

type Props = {
  project: FactoryProjectView
  taskCount: number
  onChanged: () => void
  onRemoved: () => void
}

export function ProjectHeader({ project, taskCount, onChanged, onRemoved }: Props) {
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const adopt = async () => {
    try {
      const { adopted } = await api.post<{ adopted: number }>(`/factory/projects/${project.id}/adopt-tasks`)
      toast(tx({ en: `${adopted} loose task(s) brought into the project`, pt: `${adopted} tarefa(s) avulsa(s) trazida(s) para o projeto` }))
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async () => {
    setConfirming(false)
    try {
      await api.delete(`/factory/projects/${project.id}`)
      onRemoved()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <b>{project.name}</b>
        <span className="muted mono" style={{ fontSize: 12 }}>{project.rootPath}</span>
        <div className="spacer" />
        <button type="button" className="btn btn-sm" onClick={adopt} title={tx({ en: 'Tasks with no project whose repository is inside this folder', pt: 'Tarefas sem projeto cujo repositório está dentro desta pasta' })}>
          <FolderInput size={14} /> {tx({ en: 'Bring loose tasks', pt: 'Trazer tarefas avulsas' })}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setConfirming(true)}>
          <Trash2 size={14} /> {tx({ en: 'Remove project', pt: 'Excluir projeto' })}
        </button>
      </div>
      {project.missing ? (
        <div className="callout callout-warn">{tx({ en: 'The project folder no longer exists.', pt: 'A pasta do projeto não existe mais.' })}</div>
      ) : (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {project.repos.length === 0 && <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'No git repository in the folder yet.', pt: 'Nenhum repositório git na pasta ainda.' })}</span>}
          {project.repos.map(r => (
            <span key={r.path} className="badge badge-info" title={r.path}><GitBranch size={11} /> {r.name}</span>
          ))}
        </div>
      )}
      {error && <div className="callout callout-crit">{error}</div>}

      {confirming && (
        <ConfirmModal
          title={tx({ en: `Remove the project "${project.name}"?`, pt: `Excluir o projeto "${project.name}"?` })}
          confirmLabel={tx({ en: 'Remove project', pt: 'Excluir projeto' })}
          icon={Trash2}
          action={tx({ en: 'remove project', pt: 'excluir projeto' })}
          effects={[
            tx({ en: `Its ${taskCount} task(s) become loose tasks; worktrees and branches stay.`, pt: `As ${taskCount} tarefa(s) dele viram avulsas; worktrees e branches ficam.` }),
            tx({ en: 'The folder on disk is not touched.', pt: 'A pasta no disco não é tocada.' }),
          ]}
          losses={[tx({ en: 'The ideas of the project, with their conversations and plans.', pt: 'As ideias do projeto, com conversas e planos.' })]}
          typeToConfirm={project.name}
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
