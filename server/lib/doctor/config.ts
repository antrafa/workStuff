// Cadastro da Máquina: o que é específico do seu contexto (registries privados, endereços internos,
// versões que seus projetos exigem) fica em ~/.workstuff, nunca no código.
// Autoteste: node server/lib/doctor/config.ts --selfcheck

import assert from 'node:assert/strict'
import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { say } from '../i18n.ts'

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
    if (!Array.isArray(v)) throw new Error(say({ en: `${name}: expected a list`, pt: `${name}: esperado uma lista` }))
    if (v.length > 30) throw new Error(say({ en: `${name}: at most 30 items`, pt: `${name}: no máximo 30 itens` }))
    return v
  }
  const str = (v: unknown, re: RegExp, what: string) => {
    if (typeof v !== 'string' || !re.test(v.trim())) throw new Error(say({ en: `invalid ${what}: ${String(v).slice(0, 60)}`, pt: `${what} inválido: ${String(v).slice(0, 60)}` }))
    return v.trim()
  }
  const label = say({ en: 'label', pt: 'rótulo' })
  return {
    mavenRegistries: arr(b.mavenRegistries ?? [], say({ en: 'Maven registries', pt: 'registries Maven' })).map(r => ({ label: str((r as { label?: unknown }).label, TEXT, label), match: str((r as { match?: unknown }).match, TEXT, say({ en: 'settings.xml text', pt: 'texto do settings.xml' })) })),
    npmScopes: arr(b.npmScopes ?? [], say({ en: 'npm scopes', pt: 'escopos npm' })).map(s => str(s, SCOPE, say({ en: 'npm scope (use @name)', pt: 'escopo npm (use @nome)' }))),
    urls: arr(b.urls ?? [], say({ en: 'addresses', pt: 'endereços' })).map(u => ({ label: str((u as { label?: unknown }).label, TEXT, label), url: str((u as { url?: unknown }).url, URL_RE, say({ en: 'address', pt: 'endereço' })) })),
    javaVersions: arr(b.javaVersions ?? DEFAULTS.javaVersions, say({ en: 'Java versions', pt: 'versões Java' })).map(v => str(v, SDK_ID, say({ en: 'Java version', pt: 'versão Java' }))),
    mavenVersions: arr(b.mavenVersions ?? DEFAULTS.mavenVersions, say({ en: 'Maven versions', pt: 'versões Maven' })).map(v => str(v, SDK_ID, say({ en: 'Maven version', pt: 'versão Maven' }))),
    nodeVersions: arr(b.nodeVersions ?? DEFAULTS.nodeVersions, say({ en: 'Node versions', pt: 'versões Node' })).map(v => str(v, /^\d{1,2}$/, say({ en: 'Node version (major number only)', pt: 'versão Node (só o número principal)' }))),
  }
}

export const saveDoctorConfig = (c: DoctorConfig) => writeJson(FILE, c)

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const c = parseDoctorConfig({ mavenRegistries: [{ label: 'Nexus', match: 'nexus.exemplo.com' }], npmScopes: ['@minha-empresa'], urls: [{ label: 'VPN', url: 'https://intranet.exemplo.com/' }], javaVersions: ['21.0.8-zulu'], nodeVersions: ['22'] })
  assert.equal(c.mavenRegistries[0].match, 'nexus.exemplo.com')
  assert.deepEqual(c.mavenVersions, DEFAULTS.mavenVersions, 'campo ausente usa o padrão')
  assert.throws(() => parseDoctorConfig({ javaVersions: ['21; rm -rf /'] }), /invalid/)
  assert.throws(() => parseDoctorConfig({ npmScopes: ['minha-empresa'] }), /use @name/)
  assert.throws(() => parseDoctorConfig({ urls: [{ label: 'x', url: 'file:///etc/passwd' }] }), /invalid/)
  assert.throws(() => parseDoctorConfig({ nodeVersions: ['v22.1'] }), /major number only/)
  console.log('doctor config selfcheck: ok')
}
