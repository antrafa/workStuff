// Rotas Express da Fábrica de Software e Agentes Especializados.

import { Router, type Response } from 'express'
import { openInEditor, pickFolder } from '../lib/desktop.ts'
import { openSse } from '../lib/sse.ts'
import { repoInfo } from '../lib/review/git.ts'
import { defaultFactoryStore } from '../lib/factory/store.ts'
import { getWorktreeDiff, removeWorktree, mergeWorktreeLocal, pushWorktreeBranch } from '../lib/factory/worktree.ts'
import { SPECIALIZED_AGENTS } from '../lib/factory/agents.ts'
import { runFactoryAgent } from '../lib/factory/runner.ts'
import { adjustTask, buildTask, planTask, type ExecContext } from '../lib/factory/pipeline.ts'
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

export const factoryRouter = Router()

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
        state: cancelled || kind === 'adjust' ? stateAfterCancel(kind) : 'error',
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
function refuseState(res: Response, task: FactoryTask, allowed: FactoryTaskState[], action: string): boolean {
  if (allowed.includes(task.state) && !isExecuting(task.id)) return false
  res.status(409).json({ error: `não é possível ${action} com a tarefa no estado "${task.state}"` })
  return true
}

// A task stuck in a running state with no live execution (server restarted,
// node --watch reload, crash) is moved to 'error' so the user can retry.
async function reconcileTask(task: FactoryTask): Promise<FactoryTask> {
  const executing = isExecuting(task.id)
  if (!executing && RUNNING_STATES.includes(task.state)) {
    const msg = 'Execução interrompida: o servidor foi reiniciado durante o processamento. Tente novamente.'
    await defaultFactoryStore.failRunningSpans(task.id, msg)
    const fixed: FactoryTask = { ...task, state: 'error', error: msg, updatedAt: new Date().toISOString() }
    await defaultFactoryStore.saveTask(fixed)
    return { ...((await defaultFactoryStore.getTask(task.id)) ?? fixed), executing: false }
  }
  return { ...task, executing }
}

// Provider and model become CLI arguments later: validate them here, at the boundary.
const MODEL_ID = /^[\w.:/-]{1,200}$/
function agentModelsOf(raw: unknown): FactoryTask['agentModels'] {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw !== 'object') throw new Error('modelos por agente inválidos')
  const out: NonNullable<FactoryTask['agentModels']> = {}
  for (const [id, model] of Object.entries(raw)) {
    if (!AGENT_ORDER.includes(id as SpecializedAgentId)) throw new Error(`agente desconhecido: ${id}`)
    if (!model) continue
    if (!MODEL_ID.test(String(model))) throw new Error(`id de modelo inválido para ${id}`)
    out[id as SpecializedAgentId] = String(model)
  }
  return Object.keys(out).length ? out : undefined
}

function budgetOf(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0 || n > 10_000) throw new Error('teto de custo inválido: use um valor em US$ maior que zero')
  return n
}

type TaskOptions = Pick<FactoryTask, 'provider' | 'model' | 'verifyCommand' | 'agentModels' | 'budgetUsd'>
function taskOptions(b: Record<string, any>, current?: FactoryTask): TaskOptions {
  if (b.provider !== undefined && !isProviderId(b.provider)) throw new Error('provedor inválido: use claude, agy ou codex')
  if (b.model && !MODEL_ID.test(String(b.model))) throw new Error('id de modelo inválido')
  const settings = readSettings()
  return {
    provider: b.provider ?? current?.provider ?? settings.provider,
    model: b.model !== undefined ? String(b.model) || undefined : current?.model ?? settings.model,
    // The developer's own command, run inside the jail like the autodetected one
    verifyCommand: b.verifyCommand !== undefined ? String(b.verifyCommand).trim() || undefined : current?.verifyCommand,
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
      res.status(404).json({ error: 'tarefa nao encontrada' })
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
      res.status(404).json({ error: 'tarefa nao encontrada' })
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
      res.status(400).json({ error: 'titulo e caminho do repositorio sao obrigatorios' })
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
    const id = `fac-${Date.now()}`

    const task: FactoryTask = {
      id,
      title: String(b.title).trim(),
      description: String(b.description ?? '').trim(),
      source: {
        type: b.source.type || 'manual',
        repoPath: b.source.repoPath,
        remoteUrl: b.source.remoteUrl,
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

// Seletor de pasta nativa
factoryRouter.post('/pick-folder', async (_req, res) => {
  try {
    res.json({ path: await pickFolder('Escolha o repositório do projeto') })
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
      res.status(404).json({ error: 'tarefa nao encontrada' })
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
    res.status(404).json({ error: 'tarefa nao encontrada' })
    return
  }
  if (refuseState(res, task, ['intake', 'waiting_clarification', 'waiting_approval', 'error'], 'planejar')) return
  const answers = String(req.body?.answers ?? '').trim()
  if (task.state === 'waiting_clarification' && !answers) {
    res.status(400).json({ error: 'responda às dúvidas do Analyst antes de planejar de novo' })
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
    res.status(404).json({ error: 'tarefa nao encontrada' })
    return
  }
  if (refuseState(res, task, ['waiting_approval', 'error'], 'aprovar o plano')) return
  const editedPlan = typeof req.body?.plan === 'string' ? req.body.plan.trim() : ''
  const plan = editedPlan || task.plan
  if (!plan) {
    res.status(409).json({ error: 'a tarefa ainda não tem plano aprovado; rode o planejamento antes' })
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
    ctx.send({ type: 'done', task: built })
  })
})

// Human feedback adjustment in the same worktree (SSE)
factoryRouter.post('/tasks/:id/adjust', async (req, res) => {
  const task = await defaultFactoryStore.getTask(req.params.id as string)
  if (!task || !task.worktreePath) {
    res.status(404).json({ error: 'tarefa ou worktree nao encontrada' })
    return
  }
  if (refuseState(res, task, ['review', 'error'], 'pedir ajuste')) return
  const feedback = String(req.body?.feedback ?? '').trim()
  if (!feedback) {
    res.status(400).json({ error: 'feedback e obrigatorio' })
    return
  }

  await runExecution(task.id, 'adjust', res, async ctx => {
    const adjusted = await adjustTask(ctx, task, feedback)
    ctx.send({ type: 'done', task: adjusted })
  })
})

// Retorna diff consolidado da worktree
factoryRouter.get('/tasks/:id/diff', async (req, res) => {
  try {
    const task = await defaultFactoryStore.getTask(req.params.id as string)
    if (!task || !task.worktreePath) {
      res.status(404).json({ error: 'tarefa ou worktree nao encontrada' })
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
      res.status(404).json({ error: 'tarefa ou worktree nao encontrada' })
      return
    }
    await openInEditor(task.worktreePath)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// Finalização: aprovação para MR remoto ou merge local
factoryRouter.post('/tasks/:id/finish', async (req, res) => {
  try {
    const task = await defaultFactoryStore.getTask(req.params.id as string)
    if (!task) {
      res.status(404).json({ error: 'tarefa nao encontrada' })
      return
    }
    if (refuseState(res, task, ['review'], 'finalizar')) return

    const mode = req.body?.mode || 'local_merge'
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
          throw new Error(`Falha ao enviar branch para o servidor remoto: ${(pushErr as Error).message}`)
        }
      }

      // 2. Busca conexão Git ativa para tentar criar o Pull/Merge Request oficial
      const sources = listSources()
      const src = sources.find(s => {
        const remote = task.source.remoteUrl || task.source.issueUrl
        if (task.source.repoPath.includes(s.id) || (remote && s.basePath && remote.includes(s.basePath))) {
          return true
        }
        return false
      })

      if (src) {
        try {
          const token = await resolveToken(src.provider, src.tokenSource, src.id)
          const conn: Conn = { provider: src.provider, url: src.url, token }
          const title = task.title
          const summary = task.handoffs?.docs?.mrDescription || task.handoffs?.review?.mrDescription || task.description
          // Closes the originating issue when the MR is merged (GitLab and GitHub both read it)
          const description = task.source.issueIid && !summary.includes(`#${task.source.issueIid}`) ? `${summary}\n\nCloses #${task.source.issueIid}` : summary

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
            const encoded = encodeURIComponent(src.basePath.replace(/^\//, ''))
            const resp = await fetch(`${apiBase}/projects/${encoded}/merge_requests`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                source_branch: task.branchName,
                target_branch: task.baseBranch,
                title,
                description,
              }),
              signal: AbortSignal.timeout(20_000),
            })
            if (resp.ok) {
              const data = await resp.json() as { web_url?: string }
              prUrl = data.web_url
            } else {
              warning = `Branch enviada, mas o GitLab recusou o MR (HTTP ${resp.status}): ${(await resp.text()).slice(0, 300)}`
            }
          } else if (src.provider === 'github') {
            const parts = src.basePath.split('/').filter(Boolean)
            if (parts.length >= 2) {
              const [owner, repo] = parts
              const resp = await fetch(`${apiBase}/repos/${owner}/${repo}/pulls`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  title,
                  head: task.branchName,
                  base: task.baseBranch,
                  body: description,
                }),
                signal: AbortSignal.timeout(20_000),
              })
              if (resp.ok) {
                const data = await resp.json() as { html_url?: string }
                prUrl = data.html_url
              } else {
                warning = `Branch enviada, mas o GitHub recusou o PR (HTTP ${resp.status}): ${(await resp.text()).slice(0, 300)}`
              }
            }
          }
        } catch (e) {
          warning = `Branch enviada, mas a abertura do MR falhou: ${(e as Error).message}`
        }
      } else {
        warning = `Branch ${task.branchName} enviada, mas nenhuma conexão de Repositórios corresponde a este projeto; abra o MR manualmente.`
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

    res.json({ ...updatedTask, warning })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// Exclui tarefa e limpa worktree
factoryRouter.delete('/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id as string
    cancelExecution(id)
    await waitForIdle(id, 5000)
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
    res.status(400).json({ error: 'agente invalido' })
    return
  }
  if (!repoPath || !prompt) {
    res.status(400).json({ error: 'repositorio e prompt sao obrigatorios' })
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
