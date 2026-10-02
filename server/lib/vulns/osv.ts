// Falhas conhecidas pela base pública OSV (https://osv.dev) e a última versão publicada de cada
// dependência (registry do npm e Maven Central). Só leitura, por HTTP.
// Autoteste: node server/lib/vulns/osv.ts --selfcheck

import assert from 'node:assert/strict'
import { mapLimit } from '../concurrency.ts'
import type { Dependency, Ecosystem } from './manifests.ts'

export type Severity = 'crítica' | 'alta' | 'média' | 'baixa' | 'desconhecida'

export type Advisory = {
  id: string
  aliases: string[]
  summary: string
  severity: Severity
  fixedIn: string[]
  url: string
}

const OSV = 'https://api.osv.dev/v1'
const TIMEOUT = 20_000
const BATCH = 500
export const PARALLEL = 8

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${new URL(url).host} respondeu ${res.status}`)
  return res.json()
}

// Ids das falhas que afetam cada dependência com versão conhecida. Mesma ordem da entrada.
export async function queryVulnIds(deps: Dependency[]): Promise<string[][]> {
  const out: string[][] = []
  for (let i = 0; i < deps.length; i += BATCH) {
    const queries = deps.slice(i, i + BATCH).map(d => ({ package: { name: d.name, ecosystem: d.ecosystem }, version: d.version }))
    const data = await getJson(`${OSV}/querybatch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries }) }) as { results: { vulns?: { id: string }[] }[] }
    out.push(...data.results.map(r => (r.vulns ?? []).map(v => v.id)))
  }
  return out
}

type OsvVuln = {
  id: string
  aliases?: string[]
  summary?: string
  details?: string
  database_specific?: { severity?: string }
  affected?: { package?: { name: string; ecosystem: string }; ranges?: { events: Record<string, string>[] }[] }[]
}

const SEVERITY: Record<string, Severity> = { CRITICAL: 'crítica', HIGH: 'alta', MODERATE: 'média', MEDIUM: 'média', LOW: 'baixa' }

export function toAdvisory(v: OsvVuln, pkg: { name: string; ecosystem: Ecosystem }): Advisory {
  const fixedIn = [...new Set((v.affected ?? [])
    .filter(a => a.package?.name === pkg.name && a.package?.ecosystem === pkg.ecosystem)
    .flatMap(a => a.ranges ?? [])
    .flatMap(r => r.events.map(e => e.fixed).filter(Boolean)))]
  return {
    id: v.id,
    aliases: v.aliases ?? [],
    summary: (v.summary || v.details?.split('\n')[0] || '').slice(0, 300),
    severity: SEVERITY[v.database_specific?.severity?.toUpperCase() ?? ''] ?? 'desconhecida',
    fixedIn,
    url: `https://osv.dev/vulnerability/${encodeURIComponent(v.id)}`,
  }
}

export const fetchVuln = (id: string) => getJson(`${OSV}/vulns/${encodeURIComponent(id)}`) as Promise<OsvVuln | null>

// Última versão estável publicada. Pacote de registry privado devolve null (não está no público).
export async function latestVersion(d: Pick<Dependency, 'ecosystem' | 'name'>): Promise<string | null> {
  try {
    if (d.ecosystem === 'npm') {
      const data = await getJson(`https://registry.npmjs.org/${d.name.replace('/', '%2F')}/latest`) as { version?: string } | null
      return data?.version ?? null
    }
    const [group, artifact] = d.name.split(':')
    const res = await fetch(`https://repo1.maven.org/maven2/${group.replace(/\./g, '/')}/${artifact}/maven-metadata.xml`, { signal: AbortSignal.timeout(TIMEOUT) })
    if (!res.ok) return null
    return mavenRelease(await res.text())
  } catch {
    return null // registry fora do ar não impede o resto da varredura
  }
}

const PRERELEASE = /SNAPSHOT|[.-](M|RC|CR)\d|alpha|beta|preview/i

// O <release> do Maven Central é só a última publicada, e pode ser beta (log4j 3.0.0-beta3):
// vale a última estável da lista, e o <release> só quando ela for estável também.
export function mavenRelease(metadata: string): string | null {
  const release = metadata.match(/<release>([^<]+)<\/release>/)?.[1]
  const stable = [...metadata.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]).filter(v => !PRERELEASE.test(v))
  return stable.at(-1) ?? (release && !PRERELEASE.test(release) ? release : null)
}

// Quantas versões "major" atrás: o número que importa para priorizar atualização.
export function majorsBehind(current: string | null, latest: string | null): number | null {
  const major = (v: string | null) => (v ? Number(v.match(/^(\d+)/)?.[1]) : NaN)
  const a = major(current), b = major(latest)
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.max(0, b - a)
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const vuln: OsvVuln = {
    id: 'GHSA-xxxx', aliases: ['CVE-2021-23337'], summary: 'Command Injection in lodash',
    database_specific: { severity: 'HIGH' },
    affected: [
      { package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] },
      { package: { name: 'lodash-es', ecosystem: 'npm' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '4.17.20' }] }] },
    ],
  }
  const a = toAdvisory(vuln, { name: 'lodash', ecosystem: 'npm' })
  assert.equal(a.severity, 'alta')
  assert.deepEqual(a.fixedIn, ['4.17.21'], 'só a correção do pacote consultado')
  assert.equal(a.url, 'https://osv.dev/vulnerability/GHSA-xxxx')
  assert.equal(toAdvisory({ id: 'X', details: 'linha 1\nlinha 2' }, { name: 'a', ecosystem: 'npm' }).summary, 'linha 1')
  assert.equal(toAdvisory({ id: 'X', database_specific: { severity: 'moderate' } }, { name: 'a', ecosystem: 'npm' }).severity, 'média')

  assert.equal(mavenRelease('<metadata><versioning><release>2.17.2</release></versioning></metadata>'), '2.17.2')
  assert.equal(mavenRelease('<release>3.0.0-beta3</release><versions><version>2.25.4</version><version>3.0.0-beta3</version></versions>'), '2.25.4', 'beta não é a última estável')
  assert.equal(mavenRelease('<versions><version>5.3.0</version><version>6.0.0.RC1</version><version>6.0.0-M2</version></versions>'), '5.3.0')
  assert.equal(mavenRelease('<versions><version>1.0</version><version>2.0</version><version>3.0-SNAPSHOT</version></versions>'), '2.0')
  assert.equal(majorsBehind('4.17.21', '5.0.1'), 1)
  assert.equal(majorsBehind('5.2.1', '5.3.0'), 0)
  assert.equal(majorsBehind(null, '1.0.0'), null)

  const order = await mapLimit([30, 10, 20], 2, async ms => (await new Promise(r => setTimeout(r, ms)), ms))
  assert.deepEqual(order, [30, 10, 20], 'resultado na ordem da entrada')
  console.log('vulns osv selfcheck: ok')
}
