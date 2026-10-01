// Cadastro da Máquina: o que é específico do seu contexto (registries privados, endereços internos,
// versões que seus projetos exigem) fica em ~/.workstuff, nunca no código.
// Autoteste: node server/lib/doctor/config.ts --selfcheck

import assert from 'node:assert/strict'
import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'

export type DoctorConfig = {
  // Texto que o ~/.m2/settings.xml precisa conter (ex.: o host do repositório Maven da empresa).
  mavenRegistries: { label: string; match: string }[]
  // Escopos que o ~/.npmrc precisa configurar (ex.: @minha-empresa).
  npmScopes: string[]
  // Endereços que precisam responder (VPN, proxy, serviços internos).
  urls: { label: string; url: string }[]
  // Versões instaladas via SDKMAN/NVM. Java e Maven usam o identificador do SDKMAN (ex.: 21.0.8-zulu).
  javaVersions: string[]
  mavenVersions: string[]
  nodeVersions: string[]
}

export const DEFAULTS: DoctorConfig = {
  mavenRegistries: [],
  npmScopes: [],
  urls: [],
  javaVersions: ['17.0.16-zulu', '21.0.8-zulu'],
  mavenVersions: ['3.9.6'],
  nodeVersions: ['20', '22'],
}

const FILE = dataFile('doctor-config.json')

export const readDoctorConfig = (): DoctorConfig => ({ ...DEFAULTS, ...readJson<Partial<DoctorConfig>>(FILE, {}) })

const TEXT = /^[^\n\r'"`$\;|&<>]{1,120}$/
const SDK_ID = /^\d[\w.-]{0,40}$/
const SCOPE = /^@[a-z0-9][a-z0-9._-]{0,60}$/
const URL_RE = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[^\s'"`]*)?$/

// Os valores viram comando sugerido ("sdk install java X") e texto na tela: nada de caractere de shell.
export function parseDoctorConfig(body: unknown): DoctorConfig {
  const b = (body ?? {}) as Record<string, unknown>
  const arr = (v: unknown, name: string) => {
    if (!Array.isArray(v)) throw new Error(`${name}: esperado uma lista`)
    if (v.length > 30) throw new Error(`${name}: no máximo 30 itens`)
    return v
  }
  const str = (v: unknown, re: RegExp, what: string) => {
    if (typeof v !== 'string' || !re.test(v.trim())) throw new Error(`${what} inválido: ${String(v).slice(0, 60)}`)
    return v.trim()
  }
  return {
    mavenRegistries: arr(b.mavenRegistries ?? [], 'registries Maven').map(r => ({ label: str((r as { label?: unknown }).label, TEXT, 'rótulo'), match: str((r as { match?: unknown }).match, TEXT, 'texto do settings.xml') })),
    npmScopes: arr(b.npmScopes ?? [], 'escopos npm').map(s => str(s, SCOPE, 'escopo npm (use @nome)')),
    urls: arr(b.urls ?? [], 'endereços').map(u => ({ label: str((u as { label?: unknown }).label, TEXT, 'rótulo'), url: str((u as { url?: unknown }).url, URL_RE, 'endereço') })),
    javaVersions: arr(b.javaVersions ?? DEFAULTS.javaVersions, 'versões Java').map(v => str(v, SDK_ID, 'versão Java')),
    mavenVersions: arr(b.mavenVersions ?? DEFAULTS.mavenVersions, 'versões Maven').map(v => str(v, SDK_ID, 'versão Maven')),
    nodeVersions: arr(b.nodeVersions ?? DEFAULTS.nodeVersions, 'versões Node').map(v => str(v, /^\d{1,2}$/, 'versão Node (só o número principal)')),
  }
}

export const saveDoctorConfig = (c: DoctorConfig) => writeJson(FILE, c)

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const c = parseDoctorConfig({ mavenRegistries: [{ label: 'Nexus', match: 'nexus.exemplo.com' }], npmScopes: ['@minha-empresa'], urls: [{ label: 'VPN', url: 'https://intranet.exemplo.com/' }], javaVersions: ['21.0.8-zulu'], nodeVersions: ['22'] })
  assert.equal(c.mavenRegistries[0].match, 'nexus.exemplo.com')
  assert.deepEqual(c.mavenVersions, DEFAULTS.mavenVersions, 'campo ausente usa o padrão')
  assert.throws(() => parseDoctorConfig({ javaVersions: ['21; rm -rf /'] }), /inválido/)
  assert.throws(() => parseDoctorConfig({ npmScopes: ['minha-empresa'] }), /use @nome/)
  assert.throws(() => parseDoctorConfig({ urls: [{ label: 'x', url: 'file:///etc/passwd' }] }), /inválido/)
  assert.throws(() => parseDoctorConfig({ nodeVersions: ['v22.1'] }), /só o número/)
  console.log('doctor config selfcheck: ok')
}
