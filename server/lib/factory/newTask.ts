// A new factory task record, shared by the New task form and the ideation dispatch.

import { originUrl, repoInfo, validRef } from '../review/git.ts'
import { say } from '../i18n.ts'
import type { FactoryTask } from './types.ts'

let lastStamp = 0

// fac-<ms>, never repeated in this process: a dispatch creates several tasks in the same millisecond.
export function newTaskId(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return `fac-${lastStamp}`
}

export type NewTaskInput = Omit<FactoryTask, 'id' | 'state' | 'baseBranch' | 'branchName' | 'createdAt' | 'updatedAt' | 'spans'> & { baseBranch?: string }

// Resolves the base branch (the repository default when empty) and the origin remote.
export async function createTaskRecord(input: NewTaskInput): Promise<FactoryTask> {
  const info = await repoInfo(input.source.repoPath).catch(() => null)
  const baseBranch = input.baseBranch || info?.defaultBase || info?.current || 'main'
  // The base branch reaches git as a bare argument: a leading '-' would be read as an option
  if (!validRef(baseBranch)) throw new Error(say({ en: `invalid base branch: ${baseBranch}`, pt: `branch base inválida: ${baseBranch}` }))
  const id = newTaskId()
  const now = new Date().toISOString()
  return {
    ...input,
    id,
    source: {
      ...input.source,
      // Finds the Repositórios connection when the MR is opened
      remoteUrl: input.source.remoteUrl || (await originUrl(input.source.repoPath)),
    },
    state: 'intake',
    baseBranch,
    branchName: `factory/${id}`,
    createdAt: now,
    updatedAt: now,
    spans: [],
  }
}
