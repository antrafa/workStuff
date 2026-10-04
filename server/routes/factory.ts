// Rotas Express da Fábrica de Software e Agentes Especializados.

import { Router } from 'express'
import { openInEditor, pickFolder } from '../lib/desktop.ts'
import { openSse } from '../lib/sse.ts'
import { repoInfo } from '../lib/review/git.ts'
import { defaultFactoryStore } from '../lib/factory/store.ts'
import { createWorktree, getWorktreeDiff, removeWorktree, commitWorktree, mergeWorktreeLocal } from '../lib/factory/worktree.ts'
import { SPECIALIZED_AGENTS } from '../lib/factory/agents.ts'
import { runFactoryAgent } from '../lib/factory/runner.ts'
import type { FactoryTask, SpecializedAgentId } from '../lib/factory/types.ts'
import { listSources, resolveToken } from '../lib/repos/sources.ts'
import { call, type Conn } from '../lib/repos/providers.ts'

export const factoryRouter = Router()

// Lista todas as tarefas cadastradas
factoryRouter.get('/tasks', async (_req, res) => {
  try {
    const tasks = await defaultFactoryStore.getTasks()
    res.json(tasks)
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
    res.json(task)
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
      provider: b.provider || 'claude',
      model: b.model,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

// Disparo da fase de planejamento com o Architect (SSE)
factoryRouter.post('/tasks/:id/plan', async (req, res) => {
  const task = await defaultFactoryStore.getTask(req.params.id as string)
  if (!task) {
    res.status(404).json({ error: 'tarefa nao encontrada' })
    return
  }

  const sse = openSse(res)
  await defaultFactoryStore.saveTask({ ...task, state: 'planning', error: undefined })

  try {
    const prompt = [
      `Analise o repositório e elabore um plano técnico para a seguinte demanda:`,
      `Título: ${task.title}`,
      `Descrição:\n${task.description || 'Sem descrição adicional.'}`,
      task.source.issueUrl ? `Issue original: ${task.source.issueUrl}` : '',
      `Branch base: ${task.baseBranch}`,
      `Gere um plano claro com:`,
      `1. Visão geral e diagnóstico dos arquivos existentes`,
      `2. Lista numerada de passos de implementação`,
      `3. Cenários de teste e critérios de aceitação`,
      `4. Riscos técnicos e impactos`,
    ].filter(Boolean).join('\n\n')

    const result = await runFactoryAgent({
      agentId: 'architect',
      prompt,
      cwd: task.source.repoPath,
      provider: task.provider,
      model: task.model,
      signal: sse.signal,
      onEvent: event => {
        sse.send(event)
        defaultFactoryStore.appendSessionEvent(task.id, event).catch(() => {})
      },
    })

    const updatedTask: FactoryTask = {
      ...task,
      state: 'waiting_approval',
      plan: result.text,
      updatedAt: new Date().toISOString(),
    }
    await defaultFactoryStore.saveTask(updatedTask)

    sse.send({ type: 'done', plan: result.text })
  } catch (e) {
    const msg = (e as Error).message
    await defaultFactoryStore.saveTask({ ...task, state: 'error', error: msg })
    sse.send({ type: 'error', message: msg })
  }
})

// Aprovação do plano: criação de worktree + Implementer + Tester + Reviewer (SSE)
factoryRouter.post('/tasks/:id/approve-plan', async (req, res) => {
  const task = await defaultFactoryStore.getTask(req.params.id as string)
  if (!task) {
    res.status(404).json({ error: 'tarefa nao encontrada' })
    return
  }

  const sse = openSse(res)

  try {
    sse.send({ type: 'status', message: 'Criando Git Worktree isolada...' })
    const { worktreePath, branchName } = await createWorktree(task.source.repoPath, task.id, task.baseBranch)

    let currentTask: FactoryTask = {
      ...task,
      worktreePath,
      branchName,
      state: 'building',
      error: undefined,
    }
    await defaultFactoryStore.saveTask(currentTask)

    // 1. Fase de Construção (Implementer)
    sse.send({ type: 'status', message: 'Implementer: codificando a solucao na worktree...' })
    const buildPrompt = [
      `Implemente a solução na worktree atual seguindo o plano técnico aprovado:`,
      `Plano aprovado:\n${task.plan ?? task.description}`,
      `Instruções: Faça as alterações de código necessárias, mantendo o padrão do repositório.`,
    ].join('\n\n')

    await runFactoryAgent({
      agentId: 'implementer',
      prompt: buildPrompt,
      cwd: worktreePath,
      provider: task.provider,
      model: task.model,
      signal: sse.signal,
      onEvent: event => {
        sse.send(event)
        defaultFactoryStore.appendSessionEvent(task.id, event).catch(() => {})
      },
    })

    // 2. Fase de QA e Testes (Tester)
    currentTask = { ...currentTask, state: 'qa_security' }
    await defaultFactoryStore.saveTask(currentTask)
    sse.send({ type: 'status', message: 'Tester: validando testes e executando suite de QA...' })

    const testPrompt = [
      `Valide o código implementado na worktree:`,
      `1. Verifique se os testes existentes passam.`,
      `2. Crie testes adicionais para os novos fluxos e casos de borda.`,
      `3. Execute a suíte de testes (npm test, pytest, mvn test, etc.) e emita o resultado resumido.`,
    ].join('\n\n')

    const testResult = await runFactoryAgent({
      agentId: 'tester',
      prompt: testPrompt,
      cwd: worktreePath,
      provider: task.provider,
      model: task.model,
      signal: sse.signal,
      onEvent: event => {
        sse.send(event)
        defaultFactoryStore.appendSessionEvent(task.id, event).catch(() => {})
      },
    })

    await commitWorktree(worktreePath, `feat(${task.id}): ${task.title}`)
    const { diff, stat } = await getWorktreeDiff(worktreePath, task.baseBranch)

    // 3. Fase de Auditoria de Segurança e Resumo (Reviewer)
    sse.send({ type: 'status', message: 'Reviewer: auditando seguranca e gerando resumo do MR...' })
    const reviewPrompt = [
      `Revise as alterações finais da branch contra a base ${task.baseBranch}:`,
      `Diff das alterações:\n\`\`\`diff\n${diff.slice(0, 100_000)}\n\`\`\``,
      `Audite se há vulnerabilidades de segurança ou credenciais expostas. Produza um resumo das mudanças.`,
    ].join('\n\n')

    const reviewResult = await runFactoryAgent({
      agentId: 'reviewer',
      prompt: reviewPrompt,
      cwd: worktreePath,
      provider: task.provider,
      model: task.model,
      signal: sse.signal,
      onEvent: event => {
        sse.send(event)
        defaultFactoryStore.appendSessionEvent(task.id, event).catch(() => {})
      },
    })

    const finalTask: FactoryTask = {
      ...currentTask,
      state: 'review',
      diffContent: diff,
      diffStat: stat,
      qaReport: {
        passed: !testResult.text.toLowerCase().includes('failed') && !testResult.text.toLowerCase().includes('falhou'),
        summary: testResult.text,
      },
      securityReport: {
        passed: !reviewResult.text.toLowerCase().includes('vulnerabilidade crítica'),
        findings: [],
        summary: reviewResult.text,
      },
      updatedAt: new Date().toISOString(),
    }

    await defaultFactoryStore.saveTask(finalTask)
    sse.send({ type: 'done', task: finalTask })
  } catch (e) {
    const msg = (e as Error).message
    await defaultFactoryStore.saveTask({ ...task, state: 'error', error: msg })
    sse.send({ type: 'error', message: msg })
  }
})

// Ajuste com feedback humano na mesma worktree (SSE)
factoryRouter.post('/tasks/:id/adjust', async (req, res) => {
  const task = await defaultFactoryStore.getTask(req.params.id as string)
  if (!task || !task.worktreePath) {
    res.status(404).json({ error: 'tarefa ou worktree nao encontrada' })
    return
  }

  const feedback = String(req.body?.feedback ?? '').trim()
  if (!feedback) {
    res.status(400).json({ error: 'feedback e obrigatorio' })
    return
  }

  const sse = openSse(res)

  try {
    sse.send({ type: 'status', message: 'Aplicando ajustes na worktree...' })
    await defaultFactoryStore.saveTask({ ...task, state: 'building', error: undefined })

    const adjustPrompt = [
      `O desenvolvedor solicitou os seguintes ajustes no código da worktree:`,
      `"${feedback}"`,
      `Altere os arquivos necessários na pasta atual e certifique-se de que a implementação atende ao pedido.`,
    ].join('\n\n')

    await runFactoryAgent({
      agentId: 'implementer',
      prompt: adjustPrompt,
      cwd: task.worktreePath,
      provider: task.provider,
      model: task.model,
      signal: sse.signal,
      onEvent: event => {
        sse.send(event)
        defaultFactoryStore.appendSessionEvent(task.id, event).catch(() => {})
      },
    })

    await commitWorktree(task.worktreePath, `fix(${task.id}): ajuste conforme feedback do revisor`)
    const { diff, stat } = await getWorktreeDiff(task.worktreePath, task.baseBranch)

    const updatedTask: FactoryTask = {
      ...task,
      state: 'review',
      diffContent: diff,
      diffStat: stat,
      updatedAt: new Date().toISOString(),
    }
    await defaultFactoryStore.saveTask(updatedTask)

    sse.send({ type: 'done', task: updatedTask })
  } catch (e) {
    const msg = (e as Error).message
    await defaultFactoryStore.saveTask({ ...task, state: 'error', error: msg })
    sse.send({ type: 'error', message: msg })
  }
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

    if (mode === 'local_merge') {
      await mergeWorktreeLocal(task.source.repoPath, task.branchName, task.baseBranch)
    }

    if (task.worktreePath) {
      await removeWorktree(task.source.repoPath, task.worktreePath, mode === 'local_merge' ? task.branchName : undefined)
    }

    const updatedTask: FactoryTask = {
      ...task,
      state: 'done',
      worktreePath: undefined,
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
    const task = await defaultFactoryStore.getTask(req.params.id as string)
    if (task && task.worktreePath) {
      await removeWorktree(task.source.repoPath, task.worktreePath, task.branchName)
    }
    await defaultFactoryStore.deleteTask(req.params.id as string)
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
