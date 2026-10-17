import { Router } from 'express'
import { getProviders } from '../lib/aiProviders.ts'
import { detectSandboxDriver } from '../lib/sandbox/sandbox.ts'
import { parseSettings, readSettings, saveSettings } from '../lib/settingsStore.ts'

export const settingsRouter = Router()

settingsRouter.get('/', async (_req, res) => {
  res.json({ settings: readSettings(), providers: await getProviders(), sandboxDriver: await detectSandboxDriver() })
})

settingsRouter.put('/', (req, res) => {
  let settings
  try {
    settings = parseSettings(req.body)
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
    return
  }
  res.json({ settings: saveSettings(settings) })
})
