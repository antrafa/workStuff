import { Router } from 'express'
import { PLATFORM } from '../lib/platform.ts'
import {
  checkAction, composeAction, containerAction, dockerAvailable, isPanelProcess, killCommand, killPortOwner, listCompose, listContainers, listImages, listPorts, listVolumes,
  removeContainer, removeImage, removeVolume,
} from '../lib/local/services.ts'
import { say } from '../lib/i18n.ts'
import { openSse } from '../lib/sse.ts'
import { apps, checkInput } from '../lib/local/apps.ts'
import { checkTunnelInput, tunnels } from '../lib/local/tunnels.ts'

export const localRouter = Router()

localRouter.get('/services', async (_req, res) => {
  try {
    const docker = await dockerAvailable()
    const [ports, containers, compose, volumes] = await Promise.all([
      listPorts(),
      docker ? listContainers() : Promise.resolve([]),
      docker ? listCompose() : Promise.resolve([]),
      docker ? listVolumes() : Promise.resolve([]),
    ])
    const images = docker ? await listImages(containers) : []
    // panel: processo do próprio painel, que a tela não oferece encerrar; os: para mostrar o comando certo.
    res.json({ platform: PLATFORM.label, os: PLATFORM.os, ports: ports.map(p => ({ ...p, panel: isPanelProcess(p.pid) })), docker, containers, compose, images, volumes })
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

// Docker refusals in the interface language; the rest keeps the original message, shortened.
function explainDocker(msg: string) {
  if (/volume is in use/i.test(msg)) return say({ en: 'Docker refused: the volume is mounted in a container; delete the container first', pt: 'o Docker recusou: o volume está montado em algum container; apague o container antes' })
  if (/image is being used|image has dependent child|unable to remove repository reference|conflict: unable to (delete|remove)/i.test(msg)) return say({ en: 'Docker refused: the image is used by a container (or another image); delete what depends on it first', pt: 'o Docker recusou: a imagem é usada por algum container (ou por outra imagem); apague o que depende dela antes' })
  if (/cannot remove a running container|container is running/i.test(msg)) return say({ en: 'the container is running; stop it before deleting', pt: 'o container está rodando; pare antes de apagar' })
  return msg.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 400)
}

const fail = (res: import('express').Response, e: unknown) => res.status(400).json({ error: explainDocker((e as Error).message) })

// Encerrar o processo dono de uma porta. force: KILL no Linux/macOS, taskkill /F no Windows.
localRouter.post('/ports/:pid/kill', async (req, res) => {
  try {
    const pid = Number(req.params.pid)
    const force = req.body?.force === true
    const { port, stillAlive } = await killPortOwner(pid, force)
    console.log(`[local] ${killCommand(PLATFORM.os, pid, force).join(' ')} (porta ${port.port}, ${port.process ?? 'processo'}) → ${stillAlive ? 'ainda vivo' : 'encerrado'}`)
    res.json({ ok: true, stillAlive })
  } catch (e) {
    fail(res, e)
  }
})

// Apagar container, imagem ou volume. Sem -f de propósito: o Docker recusa o que está em uso.
localRouter.delete('/containers/:id', async (req, res) => {
  try {
    console.log(`[local] docker rm ${await removeContainer(String(req.params.id))}`)
    res.json({ ok: true })
  } catch (e) {
    fail(res, e)
  }
})

localRouter.delete('/images/:id', async (req, res) => {
  try {
    console.log(`[local] docker image rm ${await removeImage(String(req.params.id))}`)
    res.json({ ok: true })
  } catch (e) {
    fail(res, e)
  }
})

localRouter.delete('/volumes/:name', async (req, res) => {
  try {
    console.log(`[local] docker volume rm ${await removeVolume(String(req.params.name))}`)
    res.json({ ok: true })
  } catch (e) {
    fail(res, e)
  }
})

// ── Aplicações cadastradas ──
// O estado cruza o PID gravado no start com as portas em escuta: porta ocupada por outro PID
// é a aplicação subida fora do painel (ou outra coisa no lugar dela).
localRouter.get('/apps', async (_req, res) => {
  try {
    const ports = await listPorts()
    res.json(apps.list().map(app => {
      const pid = apps.pidOf(app.id)
      const owner = app.port ? ports.find(p => p.port === app.port) : undefined
      return { ...app, pid, portOpen: Boolean(owner), portPid: owner?.pid ?? null }
    }))
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

localRouter.post('/apps', (req, res) => {
  try {
    res.json(apps.create(checkInput(req.body)))
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

localRouter.put('/apps/:id', (req, res) => {
  try {
    res.json(apps.update(String(req.params.id), checkInput(req.body)))
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

localRouter.delete('/apps/:id', (req, res) => {
  try {
    apps.remove(String(req.params.id))
    console.log(`[apps] excluída ${req.params.id}`)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

localRouter.post('/apps/:id/:action', async (req, res) => {
  const id = String(req.params.id)
  try {
    if (req.params.action === 'start') return res.json({ pid: await apps.start(id) })
    if (req.params.action === 'restart') return res.json({ pid: await apps.restart(id) })
    if (req.params.action === 'stop') return res.json(await apps.stop(id, req.body?.force === true))
    res.status(400).json({ error: say({ en: 'invalid action', pt: 'ação inválida' }) })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

// Segue o log: manda o fim do arquivo e depois o que for acrescentado, conferindo a cada segundo.
localRouter.get('/apps/:id/logs', (req, res) => {
  const id = String(req.params.id)
  try {
    apps.find(id)
  } catch (e) {
    return res.status(404).json({ error: (e as Error).message })
  }
  const sse = openSse(res)
  const tail = apps.readLog(id)
  let offset = tail.offset
  sse.send({ type: 'chunk', text: tail.text, reset: true })
  const timer = setInterval(() => {
    const next = apps.readLog(id, offset)
    offset = next.offset
    if (next.text || next.reset) sse.send({ type: 'chunk', text: next.text, reset: next.reset })
  }, 1000)
  sse.signal.addEventListener('abort', () => clearInterval(timer))
})

// ── Túneis Kubernetes (kubectl port-forward) ──
localRouter.get('/tunnels', async (_req, res) => {
  try {
    const ports = await listPorts()
    const map = new Map<number, number | null>()
    for (const p of ports) if (!map.has(p.port)) map.set(p.port, p.pid)
    res.json(tunnels.statusList(map))
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
})

localRouter.post('/tunnels', (req, res) => {
  try {
    res.json(tunnels.create(checkTunnelInput(req.body)))
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

localRouter.put('/tunnels/:id', (req, res) => {
  try {
    res.json(tunnels.update(String(req.params.id), checkTunnelInput(req.body)))
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

localRouter.delete('/tunnels/:id', (req, res) => {
  try {
    tunnels.remove(String(req.params.id))
    console.log(`[tunnels] excluído ${req.params.id}`)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

localRouter.post('/tunnels/profile/:action', async (req, res) => {
  const profile = typeof req.body?.profile === 'string' ? req.body.profile.trim() : ''
  const confirmSensitive = req.body?.confirmSensitive === true
  if (!profile) return res.status(400).json({ error: say({ en: 'profile name is required', pt: 'o nome do perfil é obrigatório' }) })
  if (req.params.action !== 'start' && req.params.action !== 'stop') return res.status(400).json({ error: say({ en: 'invalid action', pt: 'ação inválida' }) })
  const items = tunnels.list().filter(t => t.profile === profile)
  const started: string[] = []
  const stopped: string[] = []
  const errors: string[] = []
  for (const t of items) {
    try {
      if (req.params.action === 'start') {
        if (!tunnels.pidOf(t.id)) {
          await tunnels.start(t.id, { confirmSensitive })
          started.push(t.name)
        }
      } else if (req.params.action === 'stop') {
        if (tunnels.pidOf(t.id)) {
          const { stillAlive } = await tunnels.stop(t.id, req.body?.force === true)
          if (stillAlive) errors.push(`${t.name}: ${say({ en: 'the process did not stop', pt: 'o processo não parou' })}`)
          else stopped.push(t.name)
        }
      }
    } catch (e) {
      errors.push(`${t.name}: ${(e as Error).message}`)
    }
  }
  res.json({ started, stopped, errors })
})

localRouter.post('/tunnels/:id/:action', async (req, res) => {
  const id = String(req.params.id)
  const confirmSensitive = req.body?.confirmSensitive === true
  try {
    if (req.params.action === 'start') return res.json({ pid: await tunnels.start(id, { confirmSensitive }) })
    if (req.params.action === 'restart') return res.json({ pid: await tunnels.restart(id, { confirmSensitive }) })
    if (req.params.action === 'stop') return res.json(await tunnels.stop(id, req.body?.force === true))
    res.status(400).json({ error: say({ en: 'invalid action', pt: 'ação inválida' }) })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

localRouter.get('/tunnels/:id/logs', (req, res) => {
  const id = String(req.params.id)
  try {
    tunnels.find(id)
  } catch (e) {
    return res.status(404).json({ error: (e as Error).message })
  }
  const sse = openSse(res)
  const tail = tunnels.readLog(id)
  let offset = tail.offset
  sse.send({ type: 'chunk', text: tail.text, reset: true })
  const timer = setInterval(() => {
    const next = tunnels.readLog(id, offset)
    offset = next.offset
    if (next.text || next.reset) sse.send({ type: 'chunk', text: next.text, reset: next.reset })
  }, 1000)
  sse.signal.addEventListener('abort', () => clearInterval(timer))
})

