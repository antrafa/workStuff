import { Router } from 'express'
import { getProvider, isProviderId } from '../lib/aiProviders.ts'

export const aiProvidersRouter = Router()

// Roda de novo o comando de listagem do CLI e devolve o catálogo atual.
aiProvidersRouter.post('/:id/models/refresh', async (req, res) => {
  const { id } = req.params
  if (!isProviderId(id)) {
    res.status(404).json({ error: `provedor desconhecido: ${id}` })
    return
  }
  const provider = await getProvider(id, { refresh: true })
  if (!provider.installed) {
    res.status(409).json({ error: `${provider.bin} não está instalado nesta máquina` })
    return
  }
  res.json(provider)
})
