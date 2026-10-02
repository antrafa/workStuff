import { Router } from 'express'
import { run, which } from '../lib/run.ts'

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
let cached: { at: number; body: unknown } | null = null

statusRouter.get('/', async (_req, res) => {
  if (!cached || Date.now() - cached.at > 300_000) {
    const [tools, agents] = await Promise.all([
      Promise.all(TOOLS.map(versionOf)),
      Promise.all(AGENTS.map(async name => ({ name, installed: Boolean(await which(name)) }))),
    ])
    cached = { at: Date.now(), body: { tools, agents, port: Number(process.env.PORT ?? 3101) } }
  }
  res.json(cached.body)
})
