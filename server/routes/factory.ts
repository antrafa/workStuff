// Rotas Express da Fábrica de Software e Agentes Especializados.

import { Router, type Response } from 'express'
import { openInEditor, pickFolder } from '../lib/desktop.ts'
import { openSse } from '../lib/sse.ts'
import { originUrl, repoInfo, validRef } from '../lib/review/git.ts'
import { sourceForRemote } from '../lib/repos/remote.ts'
import { which } from '../lib/run.ts'
import { detectVerifyCommands } from '../lib/factory/gates.ts'
import { defaultFactoryStore } from '../lib/factory/store.ts'
import { defaultProjectStore } from '../lib/factory/projects.ts'
import { existsSync } from 'node:fs'
import { getWorktreeDiff, removeWorktree, mergeWorktreeLocal, pushWorktreeBranch, resetWorktree, targetBranchOf } from '../lib/factory/worktree.ts'
import { SPECIALIZED_AGENTS } from '../lib/factory/agents.ts'
import { runFactoryAgent } from '../lib/factory/runner.ts'
import { adjustTask, buildTask, planTask, reverifyOnNewBase, type ExecContext } from '../lib/factory/pipeline.ts'
import { assessDelivery, canAutoMr } from '../lib/factory/readiness.ts'
import { AGENT_ORDER, type FactoryTask, type FactoryTaskState, type SpecializedAgentId } from '../lib/factory/types.ts'
import { listSources, resolveToken } from '../lib/repos/sources.ts'
import { call, type Conn } from '../lib/repos/providers.ts'
import { readSettings } from '../lib/settingsStore.ts'
import { isProviderId } from '../lib/aiProviders.ts'
import {
  beginExecution,
  cancelExecution,
  endExecution,
  isExecuting,
  waitForIdle,
  stateAfterCancel,
  RUNNING_STATES,
  ExecutionCancelledError,
  type ExecutionKind,
} from '../lib/factory/executions.ts'
import { say } from '../lib/i18n.ts'
import type { Pair } from '../lib/lang.ts'

export const factoryRouter = Router()

const NOT_FOUND = () => say({ en: 'task not found', pt: 'tarefa não encontrada' })
const NO_WORKTREE = () => say({ en: 'task or worktree not found', pt: 'tarefa ou worktree não encontrada' })

// ── Execution core ──────────────────────────────────────────────────────────
// Every agent pipeline runs through runExecution: it owns the AbortSignal
// (registry, not the HTTP connection), always closes the SSE stream, and turns
// a user stop into a resumable state instead of a generic error.

async function runExecution(
  taskId: string,
  kind: ExecutionKind,
  res: Response,
  work: (ctx: ExecContext) => Promise<void>,
): Promise<void> {
  let signal: AbortSignal
  try {
    signal = beginExecution(taskId, kind)
  } catch (e) {
    res.status(409).json({ error: (e as Error).message })
    return
  }

  // The SSE abort signal is intentionally ignored: closing the console or the
  // tab only stops *watching*; stopping the run is an explicit action.
  const sse = openSse(res)
  // Status lines are persisted too: the session file is what every console reads,
  // so a console opened mid-run (or reopened) shows the same progress as the stream.
  const send = (event: object) => {
    sse.send(event)
    if ((event as { type?: string }).type === 'status') defaultFactoryStore.appendSessionEvent(taskId, event).catch(() => {})
  }
  const ctx: ExecContext = { taskId, signal, send }

  try {
    await work(ctx)
  } catch (e) {
    const cancelled = e instanceof ExecutionCancelledError || signal.aborted
    const msg = cancelled ? new ExecutionCancelledError().message : (e as Error).message
    await defaultFactoryStore.failRunningSpans(taskId, msg)
    const current = await defaultFactoryStore.getTask(taskId)
    if (current) {
      await defaultFactoryStore.saveTask({
        ...current,
        // A failed adjust goes back to review: the committed work is intact, and from 'error'
        // the UI offers "retry", which calls approve-plan and rebuilds the worktree from scratch.
        state: cancelled || kind === 'adjust' ? stateAfterCancel(kind, current) : 'error',
        error: cancelled ? undefined : msg,
        updatedAt: new Date().toISOString(),
      })
    }
    const event = cancelled ? { type: 'cancelled', message: msg } : { type: 'error', message: msg }
    defaultFactoryStore.appendSessionEvent(taskId, cancelled ? { type: 'status', message: msg } : event).catch(() => {})
    sse.send(event)
  } finally {
    endExecution(taskId, signal)
    sse.end()
  }
}

// Each action only makes sense from some states; anything else is a stale button
// or a double click, and running it would rebuild a worktree or merge the wrong thing.
function refuseState(res: Response, task: FactoryTask, allowed: FactoryTaskState[], action: Pair): boolean {
  if (allowed.includes(task.state) && !isExecuting(task.id)) return false
  res.status(409).json({ error: say({ en: `cannot ${action.en} with the task in state "${task.state}"`, pt: `não é possível ${action.pt} com a tarefa no estado "${task.state}"` }) })
  return true
}

// A task stuck in a running state with no live execution (server restarted,
// node --watch reload, crash) is moved to 'error' so the user can retry. One that had been
// reviewed (an adjust was running) goes back to that review instead: "retry" from 'error'
// rebuilds the worktree from scratch and would throw the reviewed work away.
async function reconcileTask(task: FactoryTask): Promise<FactoryTask> {
  const executing = isExecuting(task.id)
  // Reviewed before readiness existed: computed on read so the drawer shows what the finish will ask
  if (task.state === 'review' && !task.readiness) return { ...task, executing, readiness: assessDelivery(task) }
  if (executing || !RUNNING_STATES.includes(task.state)) return { ...task, executing }

  await defaultFactoryStore.failRunningSpans(task.id, say({ en: 'Run interrupted: the server was restarted.', pt: 'Execução interrompida: o servidor foi reiniciado.' }))
  // Re-read: building from `task` would put back the spans just closed
  const fresh = (await defaultFactoryStore.getTask(task.id)) ?? task
  const backToReview = await restoreReviewedWork(fresh)
  const fixed: FactoryTask = {
    ...fresh,
    state: backToReview ? 'review' : 'error',
    error: backToReview
      ? say({ en: 'The server restarted during the adjustment: the worktree went back to the last review. Ask for the adjustment again.', pt: 'O servidor foi reiniciado durante o ajuste: a worktree voltou ao ponto da última revisão. Peça o ajuste de novo.' })
      : say({ en: 'Run interrupted: the server restarted during processing. Try again.', pt: 'Execução interrompida: o servidor foi reiniciado durante o processamento. Tente novamente.' }),
    updatedAt: new Date().toISOString(),
  }
  await defaultFactoryStore.saveTask(fixed)
  return { ...fixed, executing: false }
}

async function restoreReviewedWork(task: FactoryTask): Promise<boolean> {
  if (!task.reviewedHead || !task.worktreePath || !existsSync(task.worktreePath)) return false
  try {
    await resetWorktree(task.worktreePath, task.reviewedHead)
    return true
  } catch (e) {
    console.error(`[factory] could not put ${task.id} back on its last review:`, e)
    return false
  }
}

// Provider and model become CLI arguments later: validate them here, at the boundary.
const MODEL_ID = /^[\w.:/-]{1,200}$/
function agentModelsOf(raw: unknown): FactoryTask['agentModels'] {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw !== 'object') throw new Error(say({ en: 'invalid per-agent models', pt: 'modelos por agente inválidos' }))
  const out: NonNullable<FactoryTask['agentModels']> = {}
  for (const [id, model] of Object.entries(raw)) {
    if (!AGENT_ORDER.includes(id as SpecializedAgentId)) throw new Error(say({ en: `unknown agent: ${id}`, pt: `agente desconhecido: ${id}` }))
    if (!model) continue
    if (!MODEL_ID.test(String(model))) throw new Error(say({ en: `invalid model id for ${id}`, pt: `id de modelo inválido para ${id}` }))
    out[id as SpecializedAgentId] = String(model)
  }
  return Object.keys(out).length ? out : undefined
}

function budgetOf(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0 || n > 10_000) throw new Error(say({ en: 'invalid cost cap: use a USD value greater than zero', pt: 'teto de custo inválido: use um valor em US$ maior que zero' }))
  return n
}

type TaskOptions = Pick<FactoryTask, 'provider' | 'model' | 'verifyCommand' | 'smokeCommand' | 'autoMr' | 'agentModels' | 'budgetUsd'>
function taskOptions(b: Record<string, any>, current?: FactoryTask): TaskOptions {
  if (b.provider !== undefined && !isProviderId(b.provider)) throw new Error(say({ en: 'invalid provider: use claude, agy or codex', pt: 'provedor inválido: use claude, agy ou codex' }))
  if (b.model && !MODEL_ID.test(String(b.model))) throw new Error(say({ en: 'invalid model id', pt: 'id de modelo inválido' }))
  const settings = readSettings()
  return {
    provider: b.provider ?? current?.provider ?? settings.provider,
    model: b.model !== undefined ? String(b.model) || undefined : current?.model ?? settings.model,
    // The developer's own command, run inside the jail like the autodetected one
    verifyCommand: b.verifyCommand !== undefined ? String(b.verifyCommand).trim() || undefined : current?.verifyCommand,
    smokeCommand: b.smokeCommand !== undefined ? String(b.smokeCommand).trim() || undefined : current?.smokeCommand,
    autoMr: b.autoMr !== undefined ? b.autoMr === true : current?.autoMr,
    // undefined in the body keeps the current value; null or '' clears it
    agentModels: 'agentModels' in b ? agentModelsOf(b.agentModels) : current?.agentModels,
    budgetUsd: 'budgetUsd' in b ? budgetOf(b.budgetUsd) : current?.budgetUsd,
  }
}

// Retorna configurações ativas do workstuff (provedor padrão, modelo, esforço)
factoryRouter.get('/settings', async (_req, res) => {
  try {
    res.json(readSettings())
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// Lista todas as tarefas cadastradas
factoryRouter.get('/tasks', async (_req, res) => {
  try {
    const tasks = await defaultFactoryStore.getTasks()
    const reconciled = await Promise.all(tasks.map(t => reconcileTask(t)))
    res.json(reconciled)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// Busca uma tarefa específica
factoryRouter.get('/tasks/:id', async (req, res) => {
  try {
    const task = await defaultFactoryStore.getTask(req.params.id as string)
    if (!task) {
      res.status(404).json({ error: NOT_FOUND() })
      return
    }
    res.json(await reconcileTask(task))
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// Busca o histórico de eventos da sessão de uma tarefa
factoryRouter.get('/tasks/:id/session', async (req, res) => {
  try {
    const session = await defaultFactoryStore.getSession(req.params.id as string)
    res.json(session)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// Live session (SSE, GET so the browser's EventSource can reconnect on its own):
// first a snapshot of everything recorded, then each new event as it is written.
// Closing it only stops watching; the execution is not tied to this connection.
factoryRouter.get('/tasks/:id/events', async (req, res) => {
  const id = req.params.id as string
  const sse = openSse(res)
  // getSession reads the file synchronously when called, so reading and subscribing
  // happen in the same tick: nothing written in between is lost or duplicated.
  const snapshotRead = defaultFactoryStore.getSession(id)
  const queued: unknown[] = []
  let live = false
  const unfollow = defaultFactoryStore.followSession(id, e => (live ? sse.send(e as object) : queued.push(e)))
  sse.send({ type: 'snapshot', events: await snapshotRead })
  for (const e of queued) sse.send(e as object)
  live = true
  // Comment line every 25s so proxies do not drop an idle stream
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000)
  res.on('close', () => {
    clearInterval(heartbeat)
    unfollow()
  })
})

// Atualização de configurações da tarefa (ex: trocar provedor ou modelo)
factoryRouter.patch('/tasks/:id', async (req, res) => {
  try {
    const task = await defaultFactoryStore.getTask(req.params.id as string)
    if (!task) {
      res.status(404).json({ error: NOT_FOUND() })
      return
    }
    const b = req.body ?? {}
    const updated: FactoryTask = {
      ...task,
      title: b.title !== undefined ? String(b.title).trim() : task.title,
      description: b.description !== undefined ? String(b.description).trim() : task.description,
      ...taskOptions(b, task),
      updatedAt: new Date().toISOString(),
    }
    await defaultFactoryStore.saveTask(updated)
    res.json(updated)
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

// Criação de nova tarefa
factoryRouter.post('/tasks', async (req, res) => {
  try {
    const b = req.body ?? {}
    if (!b.title || !b.source?.repoPath) {
      res.status(400).json({ error: say({ en: 'title and repository path are required', pt: 'título e caminho do repositório são obrigatórios' }) })
      return
    }

    let options: TaskOptions
    try {
      options = taskOptions(b)
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
      return
    }
    const info = await repoInfo(b.source.repoPath).catch(() => null)
    const baseBranch = b.baseBranch || info?.defaultBase || info?.current || 'main'
    // The base branch reaches git as a bare argument: a leading '-' would be read as an option
    if (!validRef(baseBranch)) {
      res.status(400).json({ error: say({ en: `invalid base branch: ${baseBranch}`, pt: `branch base inválida: ${baseBranch}` }) })
      return
    }
    const projectId = b.projectId ? String(b.projectId) : undefined
    if (projectId) {
      try {
        defaultProjectStore.get(projectId)
      } catch (e) {
        res.status(400).json({ error: (e as Error).message })
        return
      }
    }
    const id = `fac-${Date.now()}`

    const task: FactoryTask = {
      id,
      projectId,
      title: String(b.title).trim(),
      description: String(b.description ?? '').trim(),
      source: {
        type: b.source.type || 'manual',
        repoPath: b.source.repoPath,
        // Finds the Repositórios connection when the MR is opened
        remoteUrl: b.source.remoteUrl || (await originUrl(b.source.repoPath)),
        issueIid: b.source.issueIid ? Number(b.source.issueIid) : undefined,
        issueUrl: b.source.issueUrl,
      },
      state: 'intake',
      baseBranch,
      branchName: `factory/${id}`,
      ...options,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      spans: [],
    }

    await defaultFactoryStore.saveTask(task)
    res.status(201).json(task)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// What the guided wizard checks before the first task: sandbox, AI CLIs and, when a folder is
// given, whether it is a git repo, its default base, pending changes and the verify command.
factoryRouter.get('/preflight', async (req, res) => {
  const repoPath = String(req.query.repoPath ?? '').trim()
  const [bwrap, claude, codex, agy] = await Promise.all(['bwrap', 'claude', 'codex', 'agy'].map(async b => Boolean(await which(b))))
  let repo: Record<string, unknown> | null = null
  if (repoPath) {
    try {
      const info = await repoInfo(repoPath)
      repo = { ok: true, current: info.current, defaultBase: info.defaultBase ?? info.current, dirty: info.dirty, verifyCommand: detectVerifyCommands(repoPath).join(' && ') || null }
    } catch (e) {
      repo = { ok: false, error: (e as Error).message }
    }
  }
  res.json({ bwrap, providers: { claude, codex, agy }, settings: readSettings(), repo })
})

// Seletor de pasta nativa
factoryRouter.post('/pick-folder', async (_req, res) => {
  try {
    res.json({ path: await pickFolder(say({ en: "Choose the project's repository", pt: "Escolha o repositório do projeto" })) })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

// Busca issues abertas de fontes conectadas no workstuff
factoryRouter.get('/issues', async (_req, res) => {
  const sources = listSources()
  const issues: Array<{ id: string; title: string; number: number; url: string; repo: string; provider: string; body?: string }> = []

  for (const s of sources) {
    try {
      const token = await resolveToken(s.provider, s.tokenSource, s.id)
      const conn: Conn = { provider: s.provider, url: s.url, token }
      if (s.provider === 'github') {
        const parts = s.basePath.split('/').filter(Boolean)
        if (parts.length >= 2) {
          const [owner, repo] = parts
          const { data } = await call(conn, `/repos/${owner}/${repo}/issues?state=open&per_page=30`).catch(() => ({ data: [] }))
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item.pull_request) continue
              issues.push({
                id: `gh-${item.id}`,
                title: item.title,
                number: item.number,
                url: item.html_url,
                repo: `${owner}/${repo}`,
                provider: 'github',
                body: item.body ?? undefined,
              })
            }
          }
        }
      } else if (s.provider === 'gitlab') {
        const encoded = encodeURIComponent(s.basePath.replace(/^\//, ''))
        const { data } = await call(conn, `/projects/${encoded}/issues?state=opened&per_page=30`).catch(() => ({ data: [] }))
        if (Array.isArray(data)) {
          for (const item of data) {
            issues.push({
              id: `gl-${item.id}`,
              title: item.title,
              number: item.iid,
              url: item.web_url,
              repo: s.basePath,
              provider: 'gitlab',
              body: item.description ?? undefined,
            })
          }
        }
      }
    } catch {
      // ignora conexões offline
    }
  }

  res.json(issues)
})

// Explicit stop of a running execution
factoryRouter.post('/tasks/:id/cancel', async (req, res) => {
  try {
    const id = req.params.id as string
    const task = await defaultFactoryStore.getTask(id)
    if (!task) {
      res.status(404).json({ error: NOT_FOUND() })
      return
    }
    if (cancelExecution(id)) {
      // Teardown (SIGTERM to the CLI, span cleanup, state rollback) happens in
      // runExecution; the client sees it via the stream or the next refresh.
      res.json({ ok: true, cancelled: true })
      return
    }
    // Nothing alive in this process: release an orphaned running state
    res.json({ ok: true, cancelled: false, task: await reconcileTask(task) })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// Planning: Analyst specifies, Architect plans (SSE). Answers to the Analyst's questions come in the body.
factoryRouter.post('/tasks/:id/plan', async (req, res) => {
  const task = await defaultFactoryStore.getTask(req.params.id as string)
  if (!task) {
    res.status(404).json({ error: NOT_FOUND() })
    return
  }
  if (refuseState(res, task, ['intake', 'waiting_clarification', 'waiting_approval', 'error'], { en: 'plan', pt: 'planejar' })) return
  const answers = String(req.body?.answers ?? '').trim()
  if (task.state === 'waiting_clarification' && !answers) {
    res.status(400).json({ error: say({ en: "answer the Analyst's questions before planning again", pt: "responda às dúvidas do Analyst antes de planejar de novo" }) })
    return
  }
  const questions = task.handoffs?.spec?.openQuestions ?? []
  const clarifications = answers
    ? [task.clarifications, `Perguntas:\n${questions.map(q => `- ${q}`).join('\n')}\nRespostas:\n${answers}`].filter(Boolean).join('\n\n')
    : task.clarifications

  await runExecution(task.id, 'plan', res, async ctx => {
    const planned = await planTask(ctx, { ...task, clarifications })
    ctx.send({ type: 'done', plan: planned.plan, task: planned })
  })
})

// Plan approval: worktree, Implementer with gates, Tester, review squad, Documenter (SSE).
// The developer may send an edited plan: it replaces the Architect's before the build starts.
factoryRouter.post('/tasks/:id/approve-plan', async (req, res) => {
  const task = await defaultFactoryStore.getTask(req.params.id as string)
  if (!task) {
    res.status(404).json({ error: NOT_FOUND() })
    return
  }
  if (refuseState(res, task, ['waiting_approval', 'error'], { en: 'approve the plan', pt: 'aprovar o plano' })) return
  const editedPlan = typeof req.body?.plan === 'string' ? req.body.plan.trim() : ''
  const plan = editedPlan || task.plan
  if (!plan) {
    res.status(409).json({ error: say({ en: 'the task has no approved plan yet; run planning first', pt: 'a tarefa ainda não tem plano aprovado; rode o planejamento antes' }) })
    return
  }
  const planEnv = task.handoffs?.plan
  const approved: FactoryTask = {
    ...task,
    plan,
    handoffs: { ...task.handoffs, plan: planEnv ? { ...planEnv, plan } : undefined },
  }

  await runExecution(task.id, 'build', res, async ctx => {
    const built = await buildTask(ctx, approved)
    ctx.send({ type: 'done', task: await autoFinish(ctx, built) })
  })
})

// Human feedback adjustment in the same worktree (SSE)
factoryRouter.post('/tasks/:id/adjust', async (req, res) => {
  const task = await defaultFactoryStore.getTask(req.params.id as string)
  if (!task || !task.worktreePath) {
    res.status(404).json({ error: NO_WORKTREE() })
    return
  }
  // Not from 'error': a build that died midway has no review to adjust, and a failed adjust lands in 'review'
  if (refuseState(res, task, ['review'], { en: 'request an adjustment', pt: 'pedir ajuste' })) return
  const feedback = String(req.body?.feedback ?? '').trim()
  if (!feedback) {
    res.status(400).json({ error: say({ en: 'feedback is required', pt: 'feedback é obrigatório' }) })
    return
  }

  await runExecution(task.id, 'adjust', res, async ctx => {
    const adjusted = await adjustTask(ctx, task, feedback)
    ctx.send({ type: 'done', task: await autoFinish(ctx, adjusted) })
  })
})

// Retorna diff consolidado da worktree
factoryRouter.get('/tasks/:id/diff', async (req, res) => {
  try {
    const task = await defaultFactoryStore.getTask(req.params.id as string)
    if (!task || !task.worktreePath) {
      res.status(404).json({ error: NO_WORKTREE() })
      return
    }
    const diffData = await getWorktreeDiff(task.worktreePath, task.baseBranch)
    res.json(diffData)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// Abre a pasta da worktree no editor local (VS Code / Cursor)
factoryRouter.post('/tasks/:id/open-editor', async (req, res) => {
  try {
    const task = await defaultFactoryStore.getTask(req.params.id as string)
    if (!task || !task.worktreePath) {
      res.status(404).json({ error: NO_WORKTREE() })
      return
    }
    await openInEditor(task.worktreePath)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// The developer asked for the MR to open by itself: only when nothing blocks and nothing needs a
// human eye (readiness.ts). Never a local merge: that writes to the developer's own checkout.
async function autoFinish(ctx: ExecContext, task: FactoryTask): Promise<FactoryTask> {
  if (!task.readiness || !canAutoMr(task, task.readiness)) return task
  ctx.send({ type: 'status', message: say({ en: 'Everything verified and nothing needs a look: opening the MR...', pt: 'Tudo verificado e nada pede atenção: abrindo o MR...' }) })
  // A failed push must not throw: the run would mark the reviewed task as 'error', and "retry"
  // from there rebuilds it from scratch. It stays in review for the developer instead.
  try {
    const { task: finished, warning } = await finishTask(task, 'mr')
    if (warning) ctx.send({ type: 'status', message: warning })
    return finished
  } catch (e) {
    const message = say({ en: `The automatic MR failed; the task waits for your review: ${(e as Error).message}`, pt: `O MR automático falhou; a tarefa espera a sua revisão: ${(e as Error).message}` })
    ctx.send({ type: 'status', message })
    return saveTaskError(task, message)
  }
}

async function saveTaskError(task: FactoryTask, error: string): Promise<FactoryTask> {
  const fresh = (await defaultFactoryStore.getTask(task.id)) ?? task
  const next = { ...fresh, error, updatedAt: new Date().toISOString() }
  await defaultFactoryStore.saveTask(next)
  return next
}

// Finish: remote MR or local merge. A base that moved is rebased and verified first, and blockers
// (failing verification, blocking findings, unmet criteria) refuse the finish unless the developer
// writes why; the reason is kept on the task.
const MIN_OVERRIDE = 10
factoryRouter.post('/tasks/:id/finish', async (req, res) => {
  try {
    const task = await defaultFactoryStore.getTask(req.params.id as string)
    if (!task) {
      res.status(404).json({ error: NOT_FOUND() })
      return
    }
    if (refuseState(res, task, ['review'], { en: 'finish', pt: 'finalizar' })) return
    const mode = req.body?.mode || 'local_merge'
    if (mode !== 'mr' && mode !== 'local_merge') {
      res.status(400).json({ error: say({ en: `invalid finish mode: ${mode}`, pt: `modo de finalização inválido: ${mode}` }) })
      return
    }
    const override = String(req.body?.override ?? '').trim()
    // Same tick as refuseState: a second click finds this execution and gets 409
    const signal = beginExecution(task.id, 'finish')
    try {
      const current = await reverifyOnNewBase({ taskId: task.id, signal, send: () => {} }, task)
      const { blockers } = assessDelivery(current)
      if (blockers.length && override.length < MIN_OVERRIDE) {
        res.status(409).json({
          error: say({ en: `The delivery has blockers; write why it goes anyway (at least ${MIN_OVERRIDE} characters): ${blockers.join(' ')}`, pt: `A entrega tem bloqueios; escreva por que ela segue mesmo assim (pelo menos ${MIN_OVERRIDE} caracteres): ${blockers.join(' ')}` }),
          blockers,
        })
        return
      }
      const withOverride = blockers.length ? { ...current, finishOverride: { reason: override, blockers, at: new Date().toISOString() } } : current
      const { task: finished, warning } = await finishTask(withOverride, mode)
      res.json({ ...finished, warning })
    } finally {
      endExecution(task.id, signal)
    }
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

async function finishTask(task: FactoryTask, mode: 'mr' | 'local_merge'): Promise<{ task: FactoryTask; warning?: string }> {
  let prUrl = task.prUrl
  let warning: string | undefined

  if (mode === 'local_merge') {
    await mergeWorktreeLocal(task.source.repoPath, task.branchName, task.baseBranch)
  } else if (mode === 'mr') {
    // 1. Envia a branch para o repositório remoto via git push
    if (task.worktreePath) {
      try {
        await pushWorktreeBranch(task.worktreePath, task.branchName)
      } catch (pushErr) {
        throw new Error(say({ en: `Failed to push the branch to the remote: ${(pushErr as Error).message}`, pt: `Falha ao enviar branch para o servidor remoto: ${(pushErr as Error).message}` }))
      }
    }

    // 2. Busca conexão Git ativa para tentar criar o Pull/Merge Request oficial
    // Tasks created before remoteUrl was filled in: read it from the repository now
    const remote = task.source.remoteUrl || (await originUrl(task.source.repoPath))
    const target = remote ? sourceForRemote(listSources(), remote) : null
    const src = target?.source

    if (src && target) {
      try {
        const token = await resolveToken(src.provider, src.tokenSource, src.id)
        const conn: Conn = { provider: src.provider, url: src.url, token }
        const title = task.title
        const summary = task.handoffs?.docs?.mrDescription || task.handoffs?.review?.mrDescription || task.description
        // Closes the originating issue when the MR is merged (GitLab and GitHub both read it)
        // Whoever reviews the MR sees what the factory could not verify and why it went anyway
        const override = task.finishOverride
          ? `\n\n## ${say({ en: 'Delivered with blockers', pt: 'Entregue com bloqueios' })}\n\n${task.finishOverride.blockers.map(b => `- ${b}`).join('\n')}\n\n> ${task.finishOverride.reason}`
          : ''
        const withOverride = `${summary}${override}`
        const description = task.source.issueIid && !summary.includes(`#${task.source.issueIid}`) ? `${withOverride}\n\nCloses #${task.source.issueIid}` : withOverride

        const apiBase = conn.provider === 'gitlab'
          ? `${conn.url}/api/v4`
          : conn.url === 'https://github.com'
            ? 'https://api.github.com'
            : `${conn.url}/api/v3`
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(conn.provider === 'gitlab'
            ? (conn.token ? { 'PRIVATE-TOKEN': conn.token } : {})
            : { Accept: 'application/vnd.github+json', ...(conn.token ? { Authorization: `Bearer ${conn.token}` } : {}) }),
        }

        if (src.provider === 'gitlab') {
          const encoded = encodeURIComponent(target.projectPath)
          const resp = await fetch(`${apiBase}/projects/${encoded}/merge_requests`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              source_branch: task.branchName,
              target_branch: targetBranchOf(task.baseBranch),
              title,
              description,
            }),
            signal: AbortSignal.timeout(20_000),
          })
          if (resp.ok) {
            const data = await resp.json() as { web_url?: string }
            prUrl = data.web_url
          } else {
            const body = (await resp.text()).slice(0, 300)
            warning = say({ en: `Branch pushed, but GitLab refused the MR (HTTP ${resp.status}): ${body}`, pt: `Branch enviada, mas o GitLab recusou o MR (HTTP ${resp.status}): ${body}` })
          }
        } else if (src.provider === 'github') {
          const parts = target.projectPath.split('/').filter(Boolean)
          if (parts.length >= 2) {
            const [owner, repo] = parts
            const resp = await fetch(`${apiBase}/repos/${owner}/${repo}/pulls`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                title,
                head: task.branchName,
                base: targetBranchOf(task.baseBranch),
                body: description,
              }),
              signal: AbortSignal.timeout(20_000),
            })
            if (resp.ok) {
              const data = await resp.json() as { html_url?: string }
              prUrl = data.html_url
            } else {
              const body = (await resp.text()).slice(0, 300)
              warning = say({ en: `Branch pushed, but GitHub refused the PR (HTTP ${resp.status}): ${body}`, pt: `Branch enviada, mas o GitHub recusou o PR (HTTP ${resp.status}): ${body}` })
            }
          }
        }
      } catch (e) {
        warning = say({ en: `Branch pushed, but opening the MR failed: ${(e as Error).message}`, pt: `Branch enviada, mas a abertura do MR falhou: ${(e as Error).message}` })
      }
    } else {
      warning = say({ en: `Branch ${task.branchName} pushed, but no Repositories connection matches this project; open the MR by hand.`, pt: `Branch ${task.branchName} enviada, mas nenhuma conexão de Repositórios corresponde a este projeto; abra o MR manualmente.` })
    }
  }

  if (task.worktreePath) {
    await removeWorktree(task.source.repoPath, task.worktreePath, mode === 'local_merge' ? task.branchName : undefined)
  }

  const updatedTask: FactoryTask = {
    ...task,
    state: 'done',
    worktreePath: undefined,
    prUrl: prUrl || task.prUrl,
    updatedAt: new Date().toISOString(),
  }
  await defaultFactoryStore.saveTask(updatedTask)
  return { task: updatedTask, warning }
}

// Exclui tarefa e limpa worktree
factoryRouter.delete('/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id as string
    cancelExecution(id)
    // Deleting while the run still writes would let it save the task back
    if (!(await waitForIdle(id, 5000))) {
      res.status(409).json({ error: say({ en: 'the run is still stopping; try deleting again in a few seconds', pt: 'a execução ainda está parando; tente excluir de novo em alguns segundos' }) })
      return
    }
    const task = await defaultFactoryStore.getTask(id)
    if (task && task.worktreePath) {
      await removeWorktree(task.source.repoPath, task.worktreePath, task.branchName)
    }
    await defaultFactoryStore.deleteTask(id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// Execução avulsa de um dos 4 agentes especializados (SSE)
factoryRouter.post('/agents/run', async (req, res) => {
  const b = req.body ?? {}
  const agentId = b.agentId as SpecializedAgentId
  const repoPath = String(b.repoPath ?? '').trim()
  const prompt = String(b.prompt ?? '').trim()

  if (!agentId || !SPECIALIZED_AGENTS[agentId]) {
    res.status(400).json({ error: say({ en: 'invalid agent', pt: 'agente inválido' }) })
    return
  }
  if (!repoPath || !prompt) {
    res.status(400).json({ error: say({ en: 'repository and prompt are required', pt: 'repositório e prompt são obrigatórios' }) })
    return
  }

  const sse = openSse(res)

  try {
    const result = await runFactoryAgent({
      agentId,
      prompt,
      cwd: repoPath,
      // This is the user's own checkout, not a worktree: every agent only reads here
      readOnly: true,
      provider: b.provider,
      model: b.model,
      signal: sse.signal,
      onEvent: sse.send,
    })

    sse.send({ type: 'done', text: result.text, durationMs: result.durationMs })
  } catch (e) {
    sse.send({ type: 'error', message: (e as Error).message })
  } finally {
    sse.end()
  }
})
