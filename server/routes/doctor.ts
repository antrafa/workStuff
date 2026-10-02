import { Router } from 'express'
import { fileURLToPath } from 'node:url'
import { diagnose } from '../lib/doctor/checks.ts'
import { FixRefused, resolveFix, runFix } from '../lib/doctor/fix.ts'
import { DEFAULTS, parseDoctorConfig, readDoctorConfig, saveDoctorConfig } from '../lib/doctor/config.ts'
import { openSse } from '../lib/sse.ts'
import { PLATFORM } from '../lib/platform.ts'

export const doctorRouter = Router()

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url))

doctorRouter.get('/', async (_req, res) => {
  const items = await diagnose()
  const count = (s: string) => items.filter(i => i.status === s).length
  res.json({ items, platform: PLATFORM, resumo: { ok: count('ok'), falta: count('falta'), aviso: count('aviso') } })
})

// Cadastro do que é específico do seu contexto (registries, endereços, versões), em ~/.workstuff.
doctorRouter.get('/config', (_req, res) => {
  res.json({ config: readDoctorConfig(), defaults: DEFAULTS })
})

doctorRouter.put('/config', (req, res) => {
  try {
    const config = parseDoctorConfig(req.body)
    saveDoctorConfig(config)
    res.json({ config })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

// Aplica a correção de UM item marcado como automático. A saída do comando chega por SSE.
doctorRouter.post('/fix', async (req, res) => {
  let fix
  try {
    fix = await resolveFix(req.body?.grupo, req.body?.item)
  } catch (e) {
    if (!(e instanceof FixRefused)) throw e
    res.status(400).json({ error: e.message })
    return
  }
  const sse = openSse(res)
  sse.send({ type: 'line', text: `$ ${fix.correcao}` })
  try {
    const code = await runFix(fix, PROJECT_ROOT, text => sse.send({ type: 'line', text }), sse.signal)
    sse.send({ type: 'done', ok: code === 0, code })
  } catch (e) {
    sse.send({ type: 'done', ok: false, code: -1, error: (e as Error).message })
  } finally {
    sse.end()
  }
})
