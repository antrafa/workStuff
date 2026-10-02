import { Router } from 'express'
import { PLATFORM } from '../lib/platform.ts'
import { checkAction, composeAction, containerAction, dockerAvailable, listCompose, listContainers, listPorts } from '../lib/local/services.ts'

export const localRouter = Router()

localRouter.get('/services', async (_req, res) => {
  try {
    const docker = await dockerAvailable()
    const [ports, containers, compose] = await Promise.all([
      listPorts(),
      docker ? listContainers() : Promise.resolve([]),
      docker ? listCompose() : Promise.resolve([]),
    ])
    res.json({ platform: PLATFORM.label, ports, docker, containers, compose })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

// Escrita local, confirmada na tela. O alvo só vale se estiver na listagem atual (conferido em services.ts).
localRouter.post('/containers/:id/:action', async (req, res) => {
  try {
    const action = checkAction(req.params.action)
    const c = await containerAction(String(req.params.id), action)
    console.log(`[local] docker ${action} ${c.name}`)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message.split('\n').slice(-2).join(' ').slice(0, 400) })
  }
})

localRouter.post('/compose/:name/:action', async (req, res) => {
  try {
    const action = checkAction(req.params.action)
    const p = await composeAction(String(req.params.name), action)
    console.log(`[local] docker compose ${action} ${p.name}`)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message.split('\n').slice(-2).join(' ').slice(0, 400) })
  }
})
