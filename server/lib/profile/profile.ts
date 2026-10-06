// Perfil de equipe: o que uma pessoa precisa para trabalhar igual a outra (versões e registries do
// Máquina, conexões de repositório, pastas e itens ativos do Catálogo), num arquivo que dá para passar
// adiante. Token nunca entra no arquivo; o arquivo importado é entrada não confiável e passa pelos
// mesmos validadores das telas.
// Autoteste: node server/lib/profile/profile.ts --selfcheck

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { expandHome, tildify } from '../paths.ts'
import { parseDoctorConfig, type DoctorConfig } from '../doctor/config.ts'
import { validateInput, type Source } from '../repos/sources.ts'
import { say } from '../i18n.ts'

export const PROFILE_VERSION = 1

export type ProfileRepo = Pick<Source, 'provider' | 'url' | 'label' | 'protocol' | 'tokenSource' | 'basePath' | 'workspace'>
export type ProfileActivation = { kind: string; slug: string; agents: string[] }
export type Profile = {
  workstuffProfile: number
  exportedAt: string
  doctor: DoctorConfig
  repos: ProfileRepo[]
  catalog: { roots: string[]; active: ProfileActivation[] }
}

// Token digitado (stored) não viaja: a conexão chega sem token, e quem importa escolhe a origem dele.
export function exportRepo(s: Source): ProfileRepo {
  return { provider: s.provider, url: s.url, label: s.label, protocol: s.protocol, tokenSource: s.tokenSource === 'stored' ? 'none' : s.tokenSource, basePath: s.basePath, workspace: tildify(s.workspace) }
}

export type Current = { doctor: DoctorConfig; repos: Source[]; roots: string[]; localItems: { kind: string; slug: string }[] }

export type Plan = {
  doctor: { changed: (keyof DoctorConfig)[]; next: DoctorConfig }
  repos: { add: ReturnType<typeof validateInput>[]; existing: string[]; invalid: string[] }
  roots: { add: string[]; missing: string[]; existing: string[] }
  activations: (ProfileActivation & { foundLocally: boolean })[]
}

const sameRepo = (a: { provider: string; url: string; basePath: string }, b: typeof a) => a.provider === b.provider && a.url === b.url && a.basePath === b.basePath

export function planImport(raw: unknown, current: Current, exists: (p: string) => boolean = existsSync): Plan {
  const p = raw as Partial<Profile>
  if (!p || typeof p !== 'object' || p.workstuffProfile !== PROFILE_VERSION) throw new Error(say({ en: 'the file is not a workStuff profile (or it is from a version this panel does not know)', pt: 'arquivo não é um perfil do workStuff (ou é de uma versão que este painel não conhece)' }))

  const next = parseDoctorConfig(p.doctor)
  const changed = (Object.keys(next) as (keyof DoctorConfig)[]).filter(k => JSON.stringify(next[k]) !== JSON.stringify(current.doctor[k]))

  const add: Plan['repos']['add'] = []
  const existing: string[] = []
  const invalid: string[] = []
  for (const r of Array.isArray(p.repos) ? p.repos.slice(0, 50) : []) {
    try {
      // "stored" sem token não é importável; vira "sem token" e a pessoa ajusta depois.
      const input = validateInput({ ...r, tokenSource: r.tokenSource === 'stored' ? 'none' : r.tokenSource, token: undefined })
      if (current.repos.some(c => sameRepo(c, input)) || add.some(a => sameRepo(a, input))) existing.push(input.label)
      else add.push(input)
    } catch (e) {
      invalid.push(`${String((r as ProfileRepo)?.label ?? (r as ProfileRepo)?.url ?? '?').slice(0, 60)}: ${(e as Error).message}`)
    }
  }

  const roots = { add: [] as string[], missing: [] as string[], existing: [] as string[] }
  for (const r of Array.isArray(p.catalog?.roots) ? p.catalog.roots.slice(0, 50) : []) {
    const path = expandHome(String(r))
    if (current.roots.includes(path)) roots.existing.push(tildify(path))
    else if (exists(path)) roots.add.push(path)
    else roots.missing.push(tildify(path))
  }

  const activations = (Array.isArray(p.catalog?.active) ? p.catalog.active.slice(0, 500) : [])
    .filter(a => typeof a?.kind === 'string' && typeof a?.slug === 'string' && Array.isArray(a.agents))
    .map(a => ({
      kind: a.kind.slice(0, 40), slug: a.slug.slice(0, 120), agents: a.agents.map(String).slice(0, 4),
      foundLocally: current.localItems.some(i => i.kind === a.kind && i.slug === a.slug),
    }))

  return { doctor: { changed, next }, repos: { add, existing, invalid }, roots, activations }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const doctor: DoctorConfig = { mavenRegistries: [], npmScopes: [], urls: [], javaVersions: ['21.0.8-zulu'], mavenVersions: ['3.9.6'], nodeVersions: ['22'] }
  const mine: Source = { id: '1', provider: 'gitlab', url: 'https://gitlab.exemplo.com', label: 'GitLab · time', protocol: 'ssh', tokenSource: 'stored', basePath: 'time', workspace: '/home/eu/ws' }
  assert.equal(exportRepo(mine).tokenSource, 'none', 'token digitado não viaja')
  assert.ok(!('id' in exportRepo(mine)))

  const profile: Profile = {
    workstuffProfile: 1, exportedAt: '2026-10-02T00:00:00Z',
    doctor: { ...doctor, npmScopes: ['@time'], nodeVersions: ['22', '24'] },
    repos: [
      exportRepo(mine),
      { provider: 'github', url: 'https://github.com', label: 'GitHub', protocol: 'https', tokenSource: 'gh', basePath: '', workspace: '~/ws' },
      { provider: 'github', url: 'https://github.com', label: 'dup', protocol: 'https', tokenSource: 'gh', basePath: '', workspace: '~/outro' },
      { provider: 'gitlab', url: 'http://inseguro', label: 'ruim', protocol: 'ssh', tokenSource: 'none', basePath: '', workspace: '~/x' },
    ],
    catalog: { roots: ['~/skills', '/nao/existe'], active: [{ kind: 'skill', slug: 'revisao', agents: ['claude'] }, { kind: 'rule', slug: 'outra', agents: ['codex'] }] },
  }
  const current: Current = { doctor, repos: [mine], roots: [], localItems: [{ kind: 'skill', slug: 'revisao' }] }
  const plan = planImport(profile, current, p => p.endsWith('/skills'))
  assert.deepEqual(plan.doctor.changed, ['npmScopes', 'nodeVersions'])
  assert.deepEqual(plan.repos.add.map(r => r.label), ['GitHub'], 'a conexão que já existe e a duplicada ficam de fora')
  assert.deepEqual(plan.repos.existing, ['GitLab · time', 'dup'])
  assert.equal(plan.repos.invalid.length, 1, 'URL http passa pelo mesmo validador da tela')
  assert.equal(plan.roots.add.length, 1)
  assert.deepEqual(plan.roots.missing, ['/nao/existe'])
  assert.deepEqual(plan.activations.map(a => a.foundLocally), [true, false])

  assert.throws(() => planImport({ workstuffProfile: 9 }, current), /not a workStuff profile/)
  assert.throws(() => planImport({ ...profile, doctor: { ...doctor, javaVersions: ['17; rm -rf ~'] } }, current), /invalid/, 'versão com caractere de shell é recusada')
  console.log('profile selfcheck: ok')
}
