// Varredura completa pelo trivy, quando instalado: pasta do projeto (inclui dependências transitivas
// dos lockfiles) ou imagem de container. Só leitura; o trivy baixa a própria base na primeira vez.
// Autoteste: node server/lib/vulns/trivy.ts --selfcheck

import assert from 'node:assert/strict'
import { run, which } from '../run.ts'
import type { Severity } from './osv.ts'
import { say } from '../i18n.ts'

export type TrivyFinding = {
  target: string
  pkg: string
  installed: string
  fixed: string | null
  id: string
  severity: Severity
  title: string
  url: string | null
}

export type TrivyTarget = { kind: 'fs'; path: string } | { kind: 'image'; image: string }

const SEVERITY: Record<string, Severity> = { CRITICAL: 'crítica', HIGH: 'alta', MEDIUM: 'média', LOW: 'baixa' }

// Referência de imagem: registry/caminho:tag ou @sha256. Nada que pareça opção ("-") ou caminho local.
const IMAGE_RE = /^[a-z0-9][a-z0-9._-]*(?::\d+)?(?:\/[a-z0-9][a-z0-9._-]*)*(?::[\w][\w.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/

export function validImage(image: string) {
  return IMAGE_RE.test(image) && image.length <= 300
}

export const trivyAvailable = async () => (await which('trivy')) !== null

export function trivyArgs(t: TrivyTarget): string[] {
  const common = ['--format', 'json', '--scanners', 'vuln', '--quiet']
  // "--" separa o alvo: um nome começando com "-" não vira opção do trivy.
  return t.kind === 'fs' ? ['fs', ...common, '--', t.path] : ['image', ...common, '--', t.image]
}

type TrivyJson = {
  Results?: {
    Target: string
    Vulnerabilities?: { VulnerabilityID: string; PkgName: string; InstalledVersion: string; FixedVersion?: string; Severity: string; Title?: string; PrimaryURL?: string }[]
  }[]
}

export function parseTrivy(json: TrivyJson): TrivyFinding[] {
  return (json.Results ?? []).flatMap(r => (r.Vulnerabilities ?? []).map(v => ({
    target: r.Target,
    pkg: v.PkgName,
    installed: v.InstalledVersion,
    fixed: v.FixedVersion || null,
    id: v.VulnerabilityID,
    severity: SEVERITY[v.Severity] ?? 'desconhecida',
    title: (v.Title ?? '').slice(0, 300),
    url: v.PrimaryURL ?? null,
  })))
}

export async function runTrivy(t: TrivyTarget): Promise<TrivyFinding[]> {
  if (t.kind === 'image' && !validImage(t.image)) throw new Error(say({ en: 'invalid image reference', pt: 'referência de imagem inválida' }))
  if (!(await trivyAvailable())) throw new Error(say({ en: 'trivy is not installed; see the Machine screen', pt: 'o trivy não está instalado; veja a tela Máquina' }))
  // A primeira execução baixa a base de falhas (centenas de MB): limite folgado.
  return parseTrivy(JSON.parse(await run('trivy', trivyArgs(t), 15 * 60_000)) as TrivyJson)
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  for (const ok of ['nginx', 'nginx:1.27', 'docker.io/library/nginx:1.27-alpine', 'registry.exemplo.com:5000/time/api:v2.3.1', `ghcr.io/a/b@sha256:${'a'.repeat(64)}`]) assert.ok(validImage(ok), ok)
  for (const bad of ['-v', '--input=/etc/passwd', '../x', '/tmp/x', 'nginx latest', 'NGINX', 'a;rm -rf /']) assert.ok(!validImage(bad), bad)

  const fs = trivyArgs({ kind: 'fs', path: '/proj' })
  assert.deepEqual(fs.slice(-2), ['--', '/proj'], 'alvo depois do --')
  assert.ok(fs.includes('vuln') && !fs.includes('secret'), 'só falhas de pacote')

  const findings = parseTrivy({
    Results: [
      { Target: 'package-lock.json', Vulnerabilities: [{ VulnerabilityID: 'CVE-2024-1', PkgName: 'braces', InstalledVersion: '3.0.2', FixedVersion: '3.0.3', Severity: 'HIGH', Title: 'braces: uncontrolled resource consumption', PrimaryURL: 'https://avd.aquasec.com/nvd/cve-2024-1' }] },
      { Target: 'pom.xml' },
    ],
  })
  assert.equal(findings.length, 1)
  assert.deepEqual([findings[0].severity, findings[0].fixed, findings[0].target], ['alta', '3.0.3', 'package-lock.json'])
  assert.deepEqual(parseTrivy({}), [])
  console.log('vulns trivy selfcheck: ok')
}
