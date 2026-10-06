import { Router, type Request, type Response } from 'express'
import { pickFolder } from '../lib/desktop.ts'
import { dataFile, tildify } from '../lib/paths.ts'
import { readJson, writeJson } from '../lib/jsonFile.ts'
import { resolveProject } from '../lib/analysis/store.ts'
import { scanProject, type ScanResult } from '../lib/vulns/scan.ts'
import { runTrivy, trivyAvailable, validImage } from '../lib/vulns/trivy.ts'
import { say } from '../lib/i18n.ts'

export const vulnsRouter = Router()

// Última varredura de cada projeto: reabrir a tela não refaz centenas de consultas.
const HISTORY = dataFile('vulns-history.json')
const MAX_HISTORY = 30

const readHistory = () => readJson<ScanResult[]>(HISTORY, [])

function remember(result: ScanResult) {
  writeJson(HISTORY, [result, ...readHistory().filter(r => r.path !== result.path)].slice(0, MAX_HISTORY))
}

const handle = (fn: (req: Request) => unknown) => async (req: Request, res: Response) => {
  try {
    res.json((await fn(req)) ?? { ok: true })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
}

vulnsRouter.get('/status', handle(async () => ({ trivy: await trivyAvailable() })))
vulnsRouter.post('/pick-folder', handle(async () => ({ path: await pickFolder(say({ en: 'Project folder to check', pt: 'Pasta do projeto para verificar' })) })))

vulnsRouter.get('/history', handle(() => readHistory().map(r => ({
  path: r.path, label: tildify(r.path), scannedAt: r.scannedAt, bySeverity: r.bySeverity, dependencies: r.dependencies.length,
}))))

vulnsRouter.get('/history/scan', handle(req => {
  const found = readHistory().find(r => r.path === String(req.query.path ?? ''))
  if (!found) throw new Error(say({ en: 'no saved scan for that folder', pt: 'nenhuma varredura salva para essa pasta' }))
  return found
}))

vulnsRouter.post('/scan', handle(async req => {
  const path = resolveProject(req.body?.path)
  const result = await scanProject(path)
  if (!result.files.length) throw new Error(say({ en: 'no package.json or pom.xml found up to 4 levels below that folder', pt: 'nenhum package.json ou pom.xml encontrado até 4 níveis abaixo dessa pasta' }))
  remember(result)
  console.log(`[vulns] ${tildify(path)}: ${result.dependencies.length} dependências, ${JSON.stringify(result.bySeverity)}`)
  return result
}))

vulnsRouter.post('/trivy', handle(async req => {
  if (typeof req.body?.image === 'string') {
    const image = req.body.image.trim()
    if (!validImage(image)) throw new Error(say({ en: 'invalid image reference (e.g. nginx:1.27 or registry.example.com/team/api:v1)', pt: 'referência de imagem inválida (ex.: nginx:1.27 ou registry.exemplo.com/time/api:v1)' }))
    return { target: image, findings: await runTrivy({ kind: 'image', image }) }
  }
  const path = resolveProject(req.body?.path)
  return { target: tildify(path), findings: await runTrivy({ kind: 'fs', path }) }
}))
