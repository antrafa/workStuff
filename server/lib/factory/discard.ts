// Discarding a task: stop its run, remove its worktree and branch, then the record.

import { cancelExecution, waitForIdle } from './executions.ts'
import { defaultFactoryStore } from './store.ts'
import { removeWorktree } from './worktree.ts'
import { ProjectError } from './projects.ts'
import { say } from '../i18n.ts'

export async function discardTask(id: string): Promise<void> {
  cancelExecution(id)
  // Deleting while the run still writes would let it save the task back
  if (!(await waitForIdle(id, 5000))) {
    throw new ProjectError(say({ en: 'the run is still stopping; try deleting again in a few seconds', pt: 'a execução ainda está parando; tente excluir de novo em alguns segundos' }), 409)
  }
  const task = await defaultFactoryStore.getTask(id)
  if (task?.worktreePath) await removeWorktree(task.source.repoPath, task.worktreePath, task.branchName)
  await defaultFactoryStore.deleteTask(id)
}
