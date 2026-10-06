import { Router, type Request, type Response } from 'express'
import { readFileSync } from 'node:fs'
import { runAi } from '../lib/ai/runner.ts'
import { pickFolder } from '../lib/desktop.ts'
import { openSse } from '../lib/sse.ts'
import { readSettings } from '../lib/settingsStore.ts'
import { readArchitectPersona } from '../lib/analysis/persona.ts'
import { REPORT_PROMPT, buildChatPrompt, buildChatSystemPrompt, buildReportSystemPrompt, sanitizeReport, type ChatTurn } from '../lib/analysis/prompts.ts'
import {
  AnalysisError, deleteEntry, gitCommit, graphHtmlPath, listReports, readHistory, resolveProject, saveEntry, writeReportFile,
} from '../lib/analysis/store.ts'
import { say } from '../lib/i18n.ts'

export const analysisRouter = Router()

function handle(res: Response, fn: () => unknown) {
  Promise.resolve()
    .then(fn)
    .then(data => res.json(data ?? { ok: true }))
    .catch(e => {
      if (!(e instanceof AnalysisError)) throw e
      res.status(e.status).json({ error: e.message })
    })
    .catch(e => {
      console.error('[analysis]', e)
      res.status(500).json({ error: say({ en: 'internal server error; see the npm run dev terminal', pt: 'erro interno no servidor; veja o terminal do npm run dev' }) })
    })
}

// Opens the SSE only after validating the input: a validation error comes back as JSON with a status.
function withProject(req: Request, res: Response) {
  try {
    return resolveProject(req.body?.projectPath ?? req.query.projectPath)
  } catch (e) {
    if (!(e instanceof AnalysisError)) throw e
    res.status(e.status).json({ error: e.message })
    return null
  }
}

const describeTool = (input: Record<string, unknown>) => String(input.file_path ?? input.path ?? input.pattern ?? input.command ?? '')

analysisRouter.get('/reports', (_req, res) => handle(res, async () => ({ items: await listReports() })))

analysisRouter.get('/report', (req, res) =>
  handle(res, async () => {
    const projectPath = resolveProject(req.query.projectPath)
    const entry = readHistory()[projectPath] ?? null
    const current = await gitCommit(projectPath)
    return { entry, stale: Boolean(entry?.gitCommit && current && current !== entry.gitCommit) }
  }),
)

analysisRouter.delete('/report', (req, res) =>
  handle(res, () => {
    const projectPath = String(req.query.projectPath ?? '')
    if (!deleteEntry(projectPath)) throw new AnalysisError(say({ en: 'analysis not found', pt: 'análise não encontrada' }), 404)
  }),
)

analysisRouter.post('/pick-folder', async (_req, res) => {
  res.json({ path: await pickFolder(say({ en: 'Project folder to analyze', pt: 'Pasta do projeto para analisar' })) })
})

analysisRouter.post('/save-to-project', (req, res) =>
  handle(res, () => {
    const projectPath = resolveProject(req.body?.projectPath)
    const entry = readHistory()[projectPath]
    if (!entry) throw new AnalysisError(say({ en: 'generate the report before saving', pt: 'gere o relatório antes de gravar' }), 404)
    return { relativePath: writeReportFile(projectPath, entry) }
  }),
)

// Commit igual ao da última análise devolve o relatório salvo sem chamar a IA.
// ponytail: sem --resume, reanalisar com commit diferente refaz a varredura inteira; retomar a
// sessão economizaria tempo quando o runner guardar session id.
analysisRouter.post('/run', async (req, res) => {
  const projectPath = withProject(req, res)
  if (!projectPath) return
  const force = req.body?.force === true
  const previous = readHistory()[projectPath]
  const commit = await gitCommit(projectPath)
  const sse = openSse(res)

  if (previous && commit && previous.gitCommit === commit && !force) {
    sse.send({ type: 'meta', mode: 'cached', generatedAt: previous.generatedAt, gitCommit: commit })
    sse.send({ type: 'text', text: previous.report })
    sse.send({ type: 'done', entry: previous })
    return sse.end()
  }

  const persona = readArchitectPersona()
  const { provider, model } = readSettings()
  sse.send({ type: 'meta', mode: 'full', provider, model, persona: Boolean(persona) })
  try {
    const result = await runAi({
      cwd: projectPath,
      prompt: REPORT_PROMPT,
      systemPrompt: buildReportSystemPrompt(persona),
      timeoutMs: 30 * 60_000,
      stallMs: 5 * 60_000,
      signal: sse.signal,
      onEvent: e => {
        if (e.type === 'text') sse.send(e)
        if (e.type === 'tool') sse.send({ type: 'tool', tool: e.tool, detail: describeTool(e.input as Record<string, unknown>) })
        if (e.type === 'status') sse.send(e)
      },
    })
    if (result.stopped || !result.text.trim()) {
      sse.send({ type: 'error', message: result.stopped ? say({ en: 'analysis stopped; nothing was saved', pt: 'análise parada; nada foi salvo' }) : say({ en: 'the agent finished without producing a report', pt: 'o agente terminou sem produzir relatório' }) })
      return
    }
    const entry = { report: sanitizeReport(result.text), generatedAt: new Date().toISOString(), gitCommit: commit, provider: result.provider, model: result.model, durationMs: result.durationMs }
    saveEntry(projectPath, entry)
    sse.send({ type: 'done', entry })
  } catch (e) {
    sse.send({ type: 'error', message: (e as Error).message })
  } finally {
    sse.end()
  }
})

function parseHistory(input: unknown): ChatTurn[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(t => (t?.role === 'user' || t?.role === 'ai') && typeof t.text === 'string')
    .map(t => ({ role: t.role, text: t.text.slice(0, 20_000) }))
}

analysisRouter.post('/chat', async (req, res) => {
  const projectPath = withProject(req, res)
  if (!projectPath) return
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : ''
  if (!question) {
    res.status(400).json({ error: say({ en: 'write the question', pt: 'escreva a pergunta' }) })
    return
  }
  const sse = openSse(res)
  try {
    const result = await runAi({
      cwd: projectPath,
      prompt: buildChatPrompt(parseHistory(req.body?.history), question),
      systemPrompt: buildChatSystemPrompt(readHistory()[projectPath]?.report ?? null),
      timeoutMs: 10 * 60_000,
      signal: sse.signal,
      onEvent: e => {
        if (e.type === 'text') sse.send(e)
        if (e.type === 'tool') sse.send({ type: 'tool', tool: e.tool, detail: describeTool(e.input as Record<string, unknown>) })
      },
    })
    sse.send({ type: 'done', provider: result.provider, model: result.model, durationMs: result.durationMs, stopped: result.stopped })
  } catch (e) {
    sse.send({ type: 'error', message: (e as Error).message })
  } finally {
    sse.end()
  }
})

// Grafo interativo gerado pelo graphify (graphify-out/graph.html), só de projeto já analisado.
// A tela o mostra num iframe sandbox sem same-origin: o HTML vem do projeto e não acessa o painel.
analysisRouter.get('/graph', (req, res) => {
  let projectPath: string
  try {
    projectPath = resolveProject(req.query.projectPath)
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
    return
  }
  if (!(projectPath in readHistory())) {
    res.status(403).json({ error: say({ en: 'project without a generated analysis', pt: 'projeto sem análise gerada' }) })
    return
  }
  try {
    const html = readFileSync(graphHtmlPath(projectPath), 'utf-8')
    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts')
    res.type('html').send(html)
  } catch {
    res.status(404).json({ error: say({ en: 'this project has no graphify-out/graph.html', pt: 'este projeto não tem graphify-out/graph.html' }) })
  }
})
