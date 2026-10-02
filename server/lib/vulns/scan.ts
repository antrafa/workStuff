// Varredura de um projeto: dependências declaradas + falhas conhecidas (OSV) + última versão publicada.

import { readDependencies, type Dependency } from './manifests.ts'
import { mapLimit } from '../concurrency.ts'
import { PARALLEL, fetchVuln, latestVersion, majorsBehind, queryVulnIds, toAdvisory, type Advisory, type Severity } from './osv.ts'

export type ScannedDependency = Dependency & { advisories: Advisory[]; latest: string | null; majorsBehind: number | null }

export type ScanResult = {
  path: string
  scannedAt: string
  files: string[]
  errors: string[]
  dependencies: ScannedDependency[]
  bySeverity: Record<Severity, number>
}

// Teto de detalhes buscados: projeto muito desatualizado tem centenas de falhas, e a tela não ajuda com mais.
const MAX_ADVISORIES = 400
const keyOf = (d: Pick<Dependency, 'ecosystem' | 'name'>) => `${d.ecosystem}|${d.name}`

export async function scanProject(path: string): Promise<ScanResult> {
  const { files, dependencies, errors } = readDependencies(path)
  const queryable = dependencies.filter(d => d.version)
  // A mesma dependência aparece em vários módulos: uma consulta por nome+versão.
  const unique = [...new Map(queryable.map(d => [`${keyOf(d)}|${d.version}`, d])).values()]
  const ids = await queryVulnIds(unique)
  const idsByDep = new Map(unique.map((d, i) => [`${keyOf(d)}|${d.version}`, ids[i]]))

  const allIds = [...new Set(ids.flat())].slice(0, MAX_ADVISORIES)
  if (ids.flat().length > allIds.length) errors.push(`mais de ${MAX_ADVISORIES} falhas: só as primeiras foram detalhadas`)
  const details = new Map((await mapLimit(allIds, PARALLEL, async id => [id, await fetchVuln(id).catch(() => null)] as const)))

  const names = [...new Map(dependencies.map(d => [keyOf(d), d])).values()]
  const latest = new Map(await mapLimit(names, PARALLEL, async d => [keyOf(d), await latestVersion(d)] as const))

  const scanned = dependencies.map((d): ScannedDependency => {
    const advisories = (d.version ? idsByDep.get(`${keyOf(d)}|${d.version}`) ?? [] : [])
      .map(id => details.get(id))
      .filter(v => v != null)
      .map(v => toAdvisory(v, d))
    const last = latest.get(keyOf(d)) ?? null
    return { ...d, advisories, latest: last, majorsBehind: majorsBehind(d.version, last) }
  })

  const bySeverity: Record<Severity, number> = { crítica: 0, alta: 0, média: 0, baixa: 0, desconhecida: 0 }
  // Conta falha por dependência única: a mesma lib em três módulos não vira três problemas.
  const counted = new Set<string>()
  for (const d of scanned) {
    for (const a of d.advisories) {
      const k = `${keyOf(d)}|${d.version}|${a.id}`
      if (counted.has(k)) continue
      counted.add(k)
      bySeverity[a.severity]++
    }
  }
  return { path, scannedAt: new Date().toISOString(), files, errors, dependencies: scanned, bySeverity }
}
