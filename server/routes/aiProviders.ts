import { Router } from 'express'
import { getProvider, isProviderId } from '../lib/aiProviders.ts'
import { say } from '../lib/i18n.ts'

export const aiProvidersRouter = Router()

// Runs the CLI's list command again and returns the current catalog.
aiProvidersRouter.post('/:id/models/refresh', async (req, res) => {
  const { id } = req.params
  if (!isProviderId(id)) {
    res.status(404).json({ error: say({ en: `unknown provider: ${id}`, pt: `provedor desconhecido: ${id}` }) })
    return
  }
  const provider = await getProvider(id, { refresh: true })
  if (!provider.installed) {
    res.status(409).json({ error: say({ en: `${provider.bin} is not installed on this machine`, pt: `${provider.bin} não está instalado nesta máquina` }) })
    return
  }
  res.json(provider)
})
