import { Router } from 'express'
import { tildify } from '../lib/paths.ts'
import { listCatalog, setRoots } from '../lib/catalog/catalog.ts'
import { readConfig } from '../lib/catalog/store.ts'
import { readDoctorConfig, saveDoctorConfig } from '../lib/doctor/config.ts'
import { listSources, saveSource } from '../lib/repos/sources.ts'
import { PROFILE_VERSION, exportRepo, planImport, type Current, type Profile } from '../lib/profile/profile.ts'

export const profileRouter = Router()

function current(): Current {
  return {
    doctor: readDoctorConfig(),
    repos: listSources(),
    roots: readConfig().roots,
    localItems: listCatalog().items.map(i => ({ kind: i.kind, slug: i.slug })),
  }
}

profileRouter.get('/export', (_req, res) => {
  const catalog = listCatalog()
  const profile: Profile = {
    workstuffProfile: PROFILE_VERSION,
    exportedAt: new Date().toISOString(),
    doctor: readDoctorConfig(),
    repos: listSources().map(exportRepo),
    catalog: {
      roots: readConfig().roots.map(tildify),
      active: catalog.items
        .map(i => ({ kind: i.kind, slug: i.slug, agents: Object.entries(i.agents).filter(([, s]) => s.state === 'on').map(([a]) => a) }))
        .filter(a => a.agents.length),
    },
  }
  res.setHeader('Content-Disposition', `attachment; filename="workstuff-perfil-${profile.exportedAt.slice(0, 10)}.json"`)
  res.json(profile)
})

profileRouter.post('/preview', (req, res) => {
  try {
    const plan = planImport(req.body?.profile, current())
    res.json({ ...plan, roots: { ...plan.roots, add: plan.roots.add.map(tildify) } })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})

// Aplica as partes escolhidas. O plano é refeito aqui a partir do arquivo, nunca aceito pronto da tela.
// Ativações do Catálogo não são aplicadas: escrevem em ~/.claude e afins, e ficam para a tela Catálogo.
profileRouter.post('/apply', (req, res) => {
  try {
    const now = current()
    const plan = planImport(req.body?.profile, now)
    const parts = (req.body?.parts ?? {}) as { doctor?: boolean; repos?: boolean; roots?: boolean }
    if (parts.doctor && plan.doctor.changed.length) saveDoctorConfig(plan.doctor.next)
    if (parts.repos) plan.repos.add.forEach(r => saveSource(r))
    if (parts.roots && plan.roots.add.length) setRoots([...now.roots, ...plan.roots.add])
    console.log(`[profile] importado: máquina=${Boolean(parts.doctor && plan.doctor.changed.length)} conexões=${parts.repos ? plan.repos.add.length : 0} pastas=${parts.roots ? plan.roots.add.length : 0}`)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
})
