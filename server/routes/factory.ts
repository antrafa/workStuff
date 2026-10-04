// Rotas Express da Fábrica de Software e Agentes Especializados.

import { Router, type Response } from 'express'
import { openInEditor, pickFolder } from '../lib/desktop.ts'
import { openSse } from '../lib/sse.ts'
import { repoInfo } from '../lib/review/git.ts'
import { defaultFactoryStore } from '../lib/factory/store.ts'
import { createWorktree, getWorktreeDiff, removeWorktree, commitWorktree, mergeWorktreeLocal, pushWorktreeBranch } from '../lib/factory/worktree.ts'
import { SPECIALIZED_AGENTS } from '../lib/factory/agents.ts'
import { runFactoryAgent } from '../lib/factory/runner.ts'
import type { FactoryTask, SpecializedAgentId } from '../lib/factory/types.ts'
import { listSources, resolveToken } from '../lib/repos/sources.ts'
import { call, type Conn } from '../lib/repos/providers.ts'
import { readSettings } from '../lib/settingsStore.ts'
import { gateArtifactsExist, gateDiffNotEmpty, gateTestsPass } from '../lib/factory/gates.ts'
import {
  beginExecution,
  cancelExecution,
  endExecution,
  isExecuting,
  waitForIdle,
  stateAfterCancel,
  throwIfCancelled,
  RUNNING_STATES,
  ExecutionCancelledError,
  type ExecutionKind,
} from '../lib/factory/executions.ts'
import {
  formatPlanPrompt,
  formatBuildPrompt,
  formatRepairPrompt,
  formatTestPrompt,
  formatReviewPrompt,
  parsePlanEnvelope,
  parseBuildEnvelope,
  parseTestEnvelope,
  parseReviewEnvelope,
} from '../lib/factory/envelopes.ts'

export const factoryRouter = Router()

// ── Execution core ──────────────────────────────────────────────────────────
// Every agent pipeline runs through runExecution: it owns the AbortSignal
// (registry, not the HTTP connection), always closes the SSE stream, and turns
// a user stop into a resumable state instead of a generic error.

type ExecContext = {
  taskId: string
  signal: AbortSignal
  send: (event: object) => void
}

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
  const ctx: ExecContext = { taskId, signal, send: sse.send }

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
        state: cancelled ? stateAfterCancel(kind) : 'error',
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

// Runs one agent step: refuses to start if already cancelled, records events
// and tool calls uniformly, and converts a stopped CLI into a cancellation
// (spawnCli resolves with stopped=true instead of rejecting).
async function runAgentStep(
  ctx: ExecContext,
  options: Omit<Parameters<typeof runFactoryAgent>[0], 'signal' | 'onEvent'>,
) {
  throwIfCancelled(ctx.signal)
  const result = await runFactoryAgent({
    ...options,
    signal: ctx.signal,
    onEvent: event => {
      ctx.send(event)
      defaultFactoryStore.appendSessionEvent(ctx.taskId, event).catch(() => {})
      if (event.type === 'tool') {
        defaultFactoryStore.recordToolCall(ctx.taskId, {
          id: event.id,
          tool: event.tool,
          input: event.input,
        }).catch(() => {})
      }
    },
  })
  if (result.stopped || ctx.signal.aborted) throw new ExecutionCancelledError()
  return result
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
      provider: b.provider || task.provider,
      model: b.model !== undefined ? b.model : task.model,
      updatedAt: new Date().toISOString(),
    }
    await defaultFactoryStore.saveTask(updated)
    res.json(updated)
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
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

    const settings = readSettings()
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
      provider: b.provider || settings.provider || 'claude',
      model: b.model || settings.model,
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
  const issues: Array<{ id: string; title: string; number: number; url: string; repo: string; provider: string; repoPath?: string }> = []

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

// Planning phase with the Architect (SSE)
factoryRouter.post('/tasks/:id/plan', async (req, res) => {
  const task = await defaultFactoryStore.getTask(req.params.id as string)
  if (!task) {
    res.status(404).json({ error: 'tarefa nao encontrada' })
    return
  }

  await runExecution(task.id, 'plan', res, async ctx => {
    await defaultFactoryStore.saveTask({ ...task, state: 'planning', error: undefined, updatedAt: new Date().toISOString() })

    const spanPlan = await defaultFactoryStore.startSpan(task.id, {
      name: 'Planejamento Arquitetural',
      phase: 'planning',
      kind: 'agent',
      agentId: 'architect',
    })

    const result = await runAgentStep(ctx, {
      agentId: 'architect',
      prompt: formatPlanPrompt(task),
      cwd: task.source.repoPath,
      provider: task.provider,
      model: task.model,
    })

    const planEnv = parsePlanEnvelope(result.text)
    await defaultFactoryStore.finishSpan(task.id, spanPlan, { status: 'success', envelope: planEnv })

    const currentInDb = (await defaultFactoryStore.getTask(task.id)) || task
    const updatedTask: FactoryTask = {
      ...currentInDb,
      state: 'waiting_approval',
      plan: planEnv.plan || result.text,
      handoffs: { ...(currentInDb.handoffs ?? {}), plan: planEnv },
      error: undefined,
      updatedAt: new Date().toISOString(),
    }
    await defaultFactoryStore.saveTask(updatedTask)
    ctx.send({ type: 'done', plan: updatedTask.plan, task: updatedTask })
  })
})

// Plan approval: worktree + Implementer + Gates + Tester + Reviewer (SSE)
factoryRouter.post('/tasks/:id/approve-plan', async (req, res) => {
  const task = await defaultFactoryStore.getTask(req.params.id as string)
  if (!task) {
    res.status(404).json({ error: 'tarefa nao encontrada' })
    return
  }

  await runExecution(task.id, 'build', res, async ctx => {
    const { signal } = ctx

    // 1. Code phase: isolated Git worktree
    ctx.send({ type: 'status', message: 'Fase de Código: Criando Git Worktree isolada...' })
    await defaultFactoryStore.saveTask({ ...task, state: 'building', error: undefined, updatedAt: new Date().toISOString() })
    const spanWorktree = await defaultFactoryStore.startSpan(task.id, {
      name: 'Criação da Git Worktree',
      phase: 'building',
      kind: 'code',
    })
    const { worktreePath, branchName } = await createWorktree(task.source.repoPath, task.id, task.baseBranch)
    await defaultFactoryStore.finishSpan(task.id, spanWorktree, { status: 'success' })

    let currentTask: FactoryTask = {
      ...((await defaultFactoryStore.getTask(task.id)) ?? task),
      worktreePath,
      branchName,
      state: 'building',
      error: undefined,
      updatedAt: new Date().toISOString(),
    }
    await defaultFactoryStore.saveTask(currentTask)

    // 2. Agent phase: Implementer
    ctx.send({ type: 'status', message: 'Implementer: codificando a solução na worktree...' })
    const spanImplementer = await defaultFactoryStore.startSpan(task.id, {
      name: 'Implementação da Solução',
      phase: 'building',
      kind: 'agent',
      agentId: 'implementer',
    })
    const planEnv = currentTask.handoffs?.plan || parsePlanEnvelope(currentTask.plan || currentTask.description)
    const implementerResult = await runAgentStep(ctx, {
      agentId: 'implementer',
      prompt: formatBuildPrompt(currentTask, planEnv),
      cwd: worktreePath,
      provider: currentTask.provider,
      model: currentTask.model,
    })
    const buildEnv = parseBuildEnvelope(implementerResult.text)
    await defaultFactoryStore.finishSpan(task.id, spanImplementer, { status: 'success', envelope: buildEnv })

    // 3. Acceptance gate: claimed artifacts must exist on disk
    if (buildEnv.changedFiles && buildEnv.changedFiles.length > 0) {
      throwIfCancelled(signal)
      const spanArtifactsGate = await defaultFactoryStore.startSpan(task.id, {
        name: 'Portão de Aceitação: Existência de Arquivos',
        phase: 'qa_security',
        kind: 'gate',
      })
      const artifactsGate = gateArtifactsExist(worktreePath, buildEnv.changedFiles)
      if (!artifactsGate.passed) {
        await defaultFactoryStore.finishSpan(task.id, spanArtifactsGate, {
          status: 'failed',
          error: artifactsGate.reason,
        })
        throw new Error(`Portão de aceitação falhou: ${artifactsGate.reason}`)
      }
      await defaultFactoryStore.finishSpan(task.id, spanArtifactsGate, { status: 'success' })
    }

    // 4. Acceptance gate: diff must not be empty
    throwIfCancelled(signal)
    ctx.send({ type: 'status', message: 'Portão de Aceitação: validando alterações no repositório...' })
    const spanDiffGate = await defaultFactoryStore.startSpan(task.id, {
      name: 'Portão de Aceitação: Verificação de Arquivos',
      phase: 'qa_security',
      kind: 'gate',
    })
    const diffGate = await gateDiffNotEmpty(worktreePath, task.baseBranch)
    if (!diffGate.passed) {
      await defaultFactoryStore.finishSpan(task.id, spanDiffGate, { status: 'failed', error: diffGate.reason })
      throw new Error(`Portão de aceitação falhou: ${diffGate.reason}`)
    }
    await defaultFactoryStore.finishSpan(task.id, spanDiffGate, { status: 'success' })

    // 4. Acceptance gate: deterministic test suite
    currentTask = { ...((await defaultFactoryStore.getTask(task.id)) ?? currentTask), state: 'qa_security', updatedAt: new Date().toISOString() }
    await defaultFactoryStore.saveTask(currentTask)
    ctx.send({ type: 'status', message: 'Portão de Testes: executando suíte determinística do projeto...' })
    let spanTestGate = await defaultFactoryStore.startSpan(task.id, {
      name: 'Portão: Execução de Testes',
      phase: 'qa_security',
      kind: 'gate',
    })
    let testGateResult = await gateTestsPass(worktreePath, undefined, signal)
    throwIfCancelled(signal)

    // Self-repair loop when tests fail
    if (!testGateResult.passed && !testGateResult.skipped) {
      await defaultFactoryStore.finishSpan(task.id, spanTestGate, { status: 'failed', error: testGateResult.reason })
      ctx.send({ type: 'status', message: 'Testes falharam. Disparando ciclo de auto-reparo com o Implementer...' })
      const spanRepair = await defaultFactoryStore.startSpan(task.id, {
        name: 'Ciclo de Auto-Reparo de Testes',
        phase: 'building',
        kind: 'agent',
        agentId: 'implementer',
      })
      await runAgentStep(ctx, {
        agentId: 'implementer',
        prompt: formatRepairPrompt(currentTask, testGateResult.output),
        cwd: worktreePath,
        provider: currentTask.provider,
        model: currentTask.model,
      })
      await defaultFactoryStore.finishSpan(task.id, spanRepair, { status: 'success' })

      spanTestGate = await defaultFactoryStore.startSpan(task.id, {
        name: 'Portão: Re-execução de Testes após Reparo',
        phase: 'qa_security',
        kind: 'gate',
      })
      testGateResult = await gateTestsPass(worktreePath, undefined, signal)
      throwIfCancelled(signal)
    }

    await defaultFactoryStore.finishSpan(task.id, spanTestGate, {
      status: testGateResult.passed ? 'success' : 'failed',
      error: testGateResult.passed ? undefined : testGateResult.reason,
      details: { command: testGateResult.command, output: testGateResult.output },
    })

    // 5. Code phase: commit & diff
    throwIfCancelled(signal)
    const spanCommit = await defaultFactoryStore.startSpan(task.id, {
      name: 'Git Commit e Cálculo de Diff',
      phase: 'qa_security',
      kind: 'code',
    })
    await commitWorktree(worktreePath, buildEnv.commitMessage || `feat(${task.id}): ${task.title}`)
    const { diff, stat } = await getWorktreeDiff(worktreePath, task.baseBranch)
    await defaultFactoryStore.finishSpan(task.id, spanCommit, { status: 'success' })

    // 6. Agent phase: Tester
    ctx.send({ type: 'status', message: 'Tester: avaliando cobertura e cenários de teste...' })
    const spanTester = await defaultFactoryStore.startSpan(task.id, {
      name: 'Avaliação de QA e Cobertura',
      phase: 'qa_security',
      kind: 'agent',
      agentId: 'tester',
    })
    const testAgentResult = await runAgentStep(ctx, {
      agentId: 'tester',
      prompt: formatTestPrompt(currentTask, {
        command: testGateResult.command,
        output: testGateResult.output,
        passed: testGateResult.passed,
      }),
      cwd: worktreePath,
      provider: currentTask.provider,
      model: currentTask.model,
    })
    const testEnv = parseTestEnvelope(testAgentResult.text, testGateResult.passed)
    await defaultFactoryStore.finishSpan(task.id, spanTester, { status: 'success', envelope: testEnv })

    // 7. Agent phase: Reviewer
    ctx.send({ type: 'status', message: 'Reviewer: auditando segurança e gerando resumo do MR...' })
    const spanReviewer = await defaultFactoryStore.startSpan(task.id, {
      name: 'Auditoria de Segurança e Resumo do MR',
      phase: 'qa_security',
      kind: 'agent',
      agentId: 'reviewer',
    })
    const reviewerResult = await runAgentStep(ctx, {
      agentId: 'reviewer',
      prompt: formatReviewPrompt(currentTask, diff),
      cwd: worktreePath,
      provider: currentTask.provider,
      model: currentTask.model,
    })
    const reviewEnv = parseReviewEnvelope(reviewerResult.text)
    await defaultFactoryStore.finishSpan(task.id, spanReviewer, { status: 'success', envelope: reviewEnv })

    const finalTask: FactoryTask = {
      ...((await defaultFactoryStore.getTask(task.id)) || currentTask),
      state: 'review',
      diffContent: diff,
      diffStat: stat,
      qaReport: {
        passed: testEnv.testSuitePassed,
        summary: testEnv.details || testAgentResult.text,
        output: testGateResult.output,
      },
      securityReport: {
        passed: reviewEnv.securityPassed,
        findings: reviewEnv.findings,
        summary: reviewEnv.summary || reviewerResult.text,
      },
      handoffs: { plan: planEnv, build: buildEnv, test: testEnv, review: reviewEnv },
      updatedAt: new Date().toISOString(),
    }
    await defaultFactoryStore.saveTask(finalTask)
    ctx.send({ type: 'done', task: finalTask })
  })
})

// Human feedback adjustment in the same worktree (SSE)
factoryRouter.post('/tasks/:id/adjust', async (req, res) => {
  const task = await defaultFactoryStore.getTask(req.params.id as string)
  if (!task || !task.worktreePath) {
    res.status(404).json({ error: 'tarefa ou worktree nao encontrada' })
    return
  }
  const worktreePath = task.worktreePath

  const feedback = String(req.body?.feedback ?? '').trim()
  if (!feedback) {
    res.status(400).json({ error: 'feedback e obrigatorio' })
    return
  }

  await runExecution(task.id, 'adjust', res, async ctx => {
    ctx.send({ type: 'status', message: 'Aplicando ajustes na worktree...' })
    await defaultFactoryStore.saveTask({ ...task, state: 'building', error: undefined, updatedAt: new Date().toISOString() })

    const spanAdjust = await defaultFactoryStore.startSpan(task.id, {
      name: 'Ajuste Solicitado pelo Usuário',
      phase: 'building',
      kind: 'agent',
      agentId: 'implementer',
    })

    await runAgentStep(ctx, {
      agentId: 'implementer',
      prompt: [
        `O desenvolvedor solicitou os seguintes ajustes no código da worktree:`,
        `"${feedback}"`,
        `Altere os arquivos necessários na pasta atual e certifique-se de que a implementação atende ao pedido.`,
      ].join('\n\n'),
      cwd: worktreePath,
      provider: task.provider,
      model: task.model,
    })
    await defaultFactoryStore.finishSpan(task.id, spanAdjust, { status: 'success' })

    const testGateResult = await gateTestsPass(worktreePath, undefined, ctx.signal)
    throwIfCancelled(ctx.signal)

    await commitWorktree(worktreePath, `fix(${task.id}): ajuste conforme feedback do revisor`)
    const { diff, stat } = await getWorktreeDiff(worktreePath, task.baseBranch)

    // Re-read so spans and tool calls recorded during this run are kept
    const updatedTask: FactoryTask = {
      ...((await defaultFactoryStore.getTask(task.id)) ?? task),
      state: 'review',
      diffContent: diff,
      diffStat: stat,
      qaReport: {
        passed: testGateResult.passed,
        summary: testGateResult.passed ? 'Todos os testes passaram após o ajuste.' : 'Houve falha nos testes.',
        output: testGateResult.output,
      },
      updatedAt: new Date().toISOString(),
    }
    await defaultFactoryStore.saveTask(updatedTask)
    ctx.send({ type: 'done', task: updatedTask })
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

    const mode = req.body?.mode || 'local_merge'
    let prUrl = task.prUrl

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
        if (task.source.repoPath.includes(s.id) || (task.source.remoteUrl && s.basePath && task.source.remoteUrl.includes(s.basePath))) {
          return true
        }
        return false
      })

      if (src) {
        try {
          const token = await resolveToken(src.provider, src.tokenSource, src.id)
          const conn: Conn = { provider: src.provider, url: src.url, token }
          const title = task.title
          const description = task.handoffs?.review?.mrDescription || task.securityReport?.summary || task.description

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
              }
            }
          }
        } catch {
          // Se falhar a abertura automática, a branch remota já está no servidor
        }
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

    res.json(updatedTask)
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
      provider: b.provider,
      model: b.model,
      signal: sse.signal,
      onEvent: sse.send,
    })

    sse.send({ type: 'done', text: result.text, durationMs: result.durationMs })
  } catch (e) {
    sse.send({ type: 'error', message: (e as Error).message })
  }
})
