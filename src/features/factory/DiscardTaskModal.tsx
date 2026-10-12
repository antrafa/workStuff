import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ConfirmModal } from '@/ui'
import { api } from '@/lib/api'
import { tx } from '@/lib/i18n'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'

type Props = {
  task: FactoryTask
  onDiscarded: () => void
  onError: (message: string) => void
  onClose: () => void
}

// The one confirmation for discarding a task, from the drawer or straight from a board card.
export function DiscardTaskModal({ task, onDiscarded, onError, onClose }: Props) {
  const [busy, setBusy] = useState(false)

  const discard = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.delete(`/factory/tasks/${task.id}`)
      onDiscarded()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
      onClose()
    }
  }

  return (
    <ConfirmModal
      title={tx({ en: `Discard "${task.title}"?`, pt: `Descartar "${task.title}"?` })}
      action={tx({ en: 'discard task', pt: 'descartar tarefa' })}
      confirmLabel={tx({ en: 'Discard', pt: 'Descartar' })}
      icon={Trash2}
      effects={[
        tx({ en: 'Stops the run in progress, if any.', pt: 'Para a execução em andamento, se houver.' }),
        tx({ en: `Removes the worktree and the branch ${task.branchName}.`, pt: `Remove a worktree e a branch ${task.branchName}.` }),
        ...(task.origin ? [tx({ en: 'Tasks that depend on it stop waiting for it.', pt: 'Tarefas que dependem dela deixam de esperar por ela.' })] : []),
      ]}
      losses={[
        tx({ en: 'The generated code that did not become an MR or a merge.', pt: 'O código gerado que não virou MR nem merge.' }),
        tx({ en: 'The spans history and the agents\' session.', pt: 'O histórico de spans e a sessão dos agentes.' }),
      ]}
      onConfirm={discard}
      onClose={onClose}
    />
  )
}
