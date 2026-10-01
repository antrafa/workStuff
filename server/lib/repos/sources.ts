import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync } from 'node:fs'
import { dataFile, expandHome, tildify } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { run, which } from '../run.ts'
import { normalizePath } from './layout.ts'

export type ProviderKind = 'gitlab' | 'github'
export type Protocol = 'ssh' | 'https'
// stored: digitado na tela (arquivo 600 em ~/.workstuff); env: variável do ambiente do servidor; gh: login do GitHub CLI.
export type TokenSource = 'stored' | 'env' | 'gh' | 'none'

export type Source = {
  id: string
  provider: ProviderKind
  url: string
  label: string
  protocol: Protocol
  tokenSource: TokenSource
  basePath: string
  workspace: string
}

const SOURCES = dataFile('repo-sources.json')
const CREDENTIALS = dataFile('git-credentials.json')

export const ENV_VAR: Record<ProviderKind, string> = { gitlab: 'GITLAB_TOKEN', github: 'GITHUB_TOKEN' }

export class RepoError extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export const listSources = () => readJson<Source[]>(SOURCES, [])

export function getSource(id: string) {
  const s = listSources().find(x => x.id === id)
  if (!s) throw new RepoError('conexão não encontrada', 404)
  return s
}

const readCredentials = () => readJson<Record<string, string>>(CREDENTIALS, {})

function writeCredentials(creds: Record<string, string>) {
  writeJson(CREDENTIALS, creds)
  chmodSync(CREDENTIALS, 0o600) // token em texto: só o dono lê, como o gh faz
}

export async function resolveToken(provider: ProviderKind, tokenSource: TokenSource, sourceId?: string, typed?: string): Promise<string | null> {
  if (typed) return typed
  if (tokenSource === 'stored') return (sourceId && readCredentials()[sourceId]) || null
  if (tokenSource === 'env') return process.env[ENV_VAR[provider]]?.trim() || null
  if (tokenSource === 'gh') return (await run('gh', ['auth', 'token'], 10_000).catch(() => '')).trim() || null
  return null
}

// O que dá para usar sem digitar nada: variáveis de ambiente e o login do gh.
export async function tokenHints() {
  const gh = (await which('gh')) ? Boolean((await run('gh', ['auth', 'token'], 10_000).catch(() => '')).trim()) : false
  return { GITLAB_TOKEN: Boolean(process.env.GITLAB_TOKEN?.trim()), GITHUB_TOKEN: Boolean(process.env.GITHUB_TOKEN?.trim()), gh }
}

const URL_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~/-]*)?$/i

export function validateInput(b: Record<string, unknown>): Omit<Source, 'id'> & { token?: string } {
  const provider = b.provider
  if (provider !== 'gitlab' && provider !== 'github') throw new RepoError('escolha GitLab ou GitHub')
  const url = typeof b.url === 'string' ? b.url.trim().replace(/\/+$/, '') : ''
  if (!URL_RE.test(url)) throw new RepoError('URL inválida: use https://gitlab.com, https://github.com ou o endereço da sua instalação')
  const protocol = b.protocol
  if (protocol !== 'ssh' && protocol !== 'https') throw new RepoError('escolha SSH ou HTTPS')
  const tokenSource = b.tokenSource as TokenSource
  if (!['stored', 'env', 'gh', 'none'].includes(tokenSource)) throw new RepoError('origem do token inválida')
  if (tokenSource === 'gh' && provider !== 'github') throw new RepoError('o login do gh só vale para GitHub')
  const workspace = typeof b.workspace === 'string' ? expandHome(b.workspace.trim()) : ''
  if (!workspace.startsWith('/')) throw new RepoError('informe a pasta do workspace (caminho absoluto ou começando com ~)')
  const basePath = normalizePath(typeof b.basePath === 'string' ? b.basePath : '')
  if (basePath && !/^[A-Za-z0-9._/-]+$/.test(basePath)) throw new RepoError('grupo base inválido')
  const label = typeof b.label === 'string' && b.label.trim() ? b.label.trim().slice(0, 60) : `${provider === 'gitlab' ? 'GitLab' : 'GitHub'}${basePath ? ` · ${basePath.split('/').pop()}` : ''}`
  const token = typeof b.token === 'string' && b.token.trim() ? b.token.trim() : undefined
  if (tokenSource === 'stored' && !token && !b.id) throw new RepoError('cole o token ou escolha outra origem')
  return { provider, url, label, protocol, tokenSource, basePath, workspace, token }
}

export function saveSource(input: ReturnType<typeof validateInput>, id?: string): Source {
  const { token, ...data } = input
  const sources = listSources()
  const source: Source = { id: id ?? randomUUID(), ...data }
  const i = sources.findIndex(s => s.id === source.id)
  if (i >= 0) sources[i] = source
  else sources.push(source)
  writeJson(SOURCES, sources)
  const creds = readCredentials()
  if (source.tokenSource === 'stored' && token) creds[source.id] = token
  if (source.tokenSource !== 'stored') delete creds[source.id]
  writeCredentials(creds)
  return source
}

export function deleteSource(id: string) {
  getSource(id)
  writeJson(SOURCES, listSources().filter(s => s.id !== id))
  const creds = readCredentials()
  delete creds[id]
  writeCredentials(creds)
}

// Para a tela: nunca o token, só se existe e os últimos 4 caracteres.
export async function publicSource(s: Source) {
  const token = await resolveToken(s.provider, s.tokenSource, s.id)
  return { ...s, workspaceLabel: tildify(s.workspace), workspaceExists: existsSync(s.workspace), token: token ? `…${token.slice(-4)}` : null }
}
