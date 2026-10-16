import { Router } from 'express'
import { run, which } from '../lib/run.ts'
import { runningCount } from '../lib/factory/executions.ts'
import { tunnels } from '../lib/local/tunnels.ts'
import { say } from '../lib/i18n.ts'

export const statusRouter = Router()

type Tool = { name: string; version: string | null }

// Versão curta de cada ferramenta para a barra de rodapé; null quando não está instalada.
const TOOLS: { name: string; bin: string; args: string[]; pick: RegExp }[] = [
  { name: 'kubectl', bin: 'kubectl', args: ['version', '--client'], pick: /v(\d+\.\d+)/ },
  { name: 'docker', bin: 'docker', args: ['--version'], pick: /(\d+\.\d+)/ },
  { name: 'git', bin: 'git', args: ['--version'], pick: /(\d+\.\d+)/ },
]
const AGENTS = ['claude', 'codex', 'agy']

const versionOf = async (t: (typeof TOOLS)[number]): Promise<Tool> => {
  try {
    return { name: t.name, version: (await run(t.bin, t.args, 5_000)).match(t.pick)?.[1] ?? '?' }
  } catch {
    return { name: t.name, version: null }
  }
}

// ponytail: cache de 5 min em memória; instalar algo novo aparece no máximo 5 min depois.
let cached: { at: number; body: Record<string, unknown> } | null = null

statusRouter.get('/', async (_req, res) => {
  if (!cached || Date.now() - cached.at > 300_000) {
    const [tools, agents] = await Promise.all([
      Promise.all(TOOLS.map(versionOf)),
      Promise.all(AGENTS.map(async name => ({ name, installed: Boolean(await which(name)) }))),
    ])
    cached = { at: Date.now(), body: { tools, agents, port: Number(process.env.PORT ?? 3101) } }
  }
  res.json({ ...cached.body, tunnels: tunnels.activeSummary() })
})

// Stops the whole process group this server runs in: the `npm run dev` job in a terminal, or the
// group the launcher starts it in. No pid file, so a stale or reused pid can never be signalled.
// ponytail: assumes its own group holds only workStuff; a supervisor sharing the group would stop too.
statusRouter.post('/shutdown', (_req, res) => {
  const busy = runningCount()
  if (busy > 0) {
    res.status(409).json({ error: say({ en: `${busy} factory run(s) in progress: stop them before shutting down.`, pt: `${busy} execução(ões) da fábrica em andamento: pare-as antes de encerrar.` }) })
    return
  }
  res.json({ ok: true, message: say({ en: 'workStuff is shutting down...', pt: 'encerrando o workStuff...' }) })
  console.log('[status] shutdown requested from the panel')
  setTimeout(() => process.kill(0, 'SIGTERM'), 350)
})
