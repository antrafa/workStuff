// De onde o Requests & Limits lê: uma conexão GitLab da tela Repositórios e um grupo.
// Cada subgrupo direto do grupo é um "cliente"; cada projeto dentro dele, uma stack.
// Autoteste: node server/lib/resources/config.ts --selfcheck

import assert from 'node:assert/strict'
import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { GitlabError, gitlabAllPages, gitlabJson, type GitlabConn } from '../gitlab/client.ts'
import { getSource, resolveToken } from '../repos/sources.ts'
import { normalizePath } from '../repos/layout.ts'
import { say } from '../i18n.ts'

export type ResourcesConfig = { sourceId: string; groupPath: string }
export type Origin = ResourcesConfig & { conn: GitlabConn; label: string; key: string }

const FILE = dataFile('resources-config.json')

export const readConfig = () => readJson<ResourcesConfig | null>(FILE, null)

// Aceita o caminho do grupo ou a URL colada do navegador (https://host/grupo/sub/-/...).
export function groupPathFrom(input: string) {
  const v = input.trim()
  const noHost = /^https?:\/\//.test(v) ? v.replace(/^https?:\/\/[^/]+/, '') : v
  return normalizePath(noHost.split('/-/')[0].replace(/\.git$/, ''))
}

async function originOf(cfg: ResourcesConfig): Promise<Origin> {
  let source
  try {
    source = getSource(cfg.sourceId)
  } catch {
    throw new GitlabError(say({ en: 'the configured connection no longer exists; choose another source', pt: 'a conexão configurada não existe mais; escolha outra origem' }), 409)
  }
  if (source.provider !== 'gitlab') throw new GitlabError(say({ en: 'only GitLab connections work here: the manifests live in GitLab groups', pt: 'só conexões GitLab servem aqui: os manifests ficam em grupos do GitLab' }), 400)
  const token = await resolveToken(source.provider, source.tokenSource, source.id)
  return { ...cfg, conn: { url: source.url, token }, label: source.label, key: `${source.url}|${cfg.groupPath}` }
}

export async function currentOrigin(): Promise<Origin> {
  const cfg = readConfig()
  if (!cfg) throw new GitlabError(say({ en: 'set up the source: choose the GitLab connection and the group to read the manifests from', pt: 'configure a origem: escolha a conexão GitLab e o grupo de onde ler os manifests' }), 409)
  return originOf(cfg)
}

// Checks the group on the API before saving and counts the subgroups (the "clients").
export async function testConfig(body: { sourceId?: unknown; groupPath?: unknown }) {
  if (typeof body.sourceId !== 'string' || !body.sourceId) throw new GitlabError(say({ en: 'choose a GitLab connection', pt: 'escolha uma conexão GitLab' }), 400)
  const groupPath = groupPathFrom(typeof body.groupPath === 'string' ? body.groupPath : '')
  if (!groupPath || !/^[A-Za-z0-9._/-]+$/.test(groupPath)) throw new GitlabError(say({ en: 'enter the group path (or paste its URL)', pt: 'informe o caminho do grupo (ou cole a URL dele)' }), 400)
  const origin = await originOf({ sourceId: body.sourceId, groupPath })
  const group = await gitlabJson<{ id: number; full_path: string }>(origin.conn, `/groups/${encodeURIComponent(groupPath)}`, say({ en: `the group ${groupPath} does not exist or the token cannot access it`, pt: `o grupo ${groupPath} não existe ou o token não tem acesso a ele` }))
  const subgroups = await gitlabAllPages<unknown>(origin.conn, `/groups/${group.id}/subgroups`)
  return { sourceId: body.sourceId, groupPath: group.full_path, clients: subgroups.length }
}

export async function saveConfig(body: { sourceId?: unknown; groupPath?: unknown }) {
  const checked = await testConfig(body)
  const cfg: ResourcesConfig = { sourceId: checked.sourceId, groupPath: checked.groupPath }
  writeJson(FILE, cfg)
  return { ...cfg, clients: checked.clients }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.equal(groupPathFrom('minha-org/ambientes'), 'minha-org/ambientes')
  assert.equal(groupPathFrom(' /minha-org/ambientes/ '), 'minha-org/ambientes')
  assert.equal(groupPathFrom('https://gitlab.com/minha-org/ambientes'), 'minha-org/ambientes')
  assert.equal(groupPathFrom('https://gitlab.exemplo.com.br/minha-org/ambientes/-/tree/main'), 'minha-org/ambientes')
  console.log('resources config selfcheck: ok')
}
