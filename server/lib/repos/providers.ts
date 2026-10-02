// Navegação em GitLab e GitHub numa forma só: um "grupo" tem subgrupos e projetos.
// No GitHub não há subgrupo: a raiz lista as organizações (e o próprio usuário), e cada uma lista os repositórios.

import { RepoError, type ProviderKind } from './sources.ts'
import { normalizePath } from './layout.ts'

export type Conn = { provider: ProviderKind; url: string; token: string | null }
export type Group = { name: string; fullPath: string; description: string }
export type Project = {
  name: string
  fullPath: string
  description: string
  archived: boolean
  lastActivity: string | null
  sshUrl: string
  httpUrl: string
  webUrl: string
}
export type Children = { path: string; webUrl: string | null; groups: Group[]; projects: Project[] }

const TIMEOUT = 20_000

const apiBase = (c: Conn) =>
  c.provider === 'gitlab' ? `${c.url}/api/v4` : c.url === 'https://github.com' ? 'https://api.github.com' : `${c.url}/api/v3`

async function call(c: Conn, path: string): Promise<{ data: unknown; res: Response }> {
  const headers: Record<string, string> = c.provider === 'gitlab'
    ? (c.token ? { 'PRIVATE-TOKEN': c.token } : {})
    : { Accept: 'application/vnd.github+json', ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}) }
  let res: Response
  try {
    res = await fetch(`${apiBase(c)}${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT) })
  } catch (e) {
    throw new RepoError((e as Error).name === 'TimeoutError' ? `${c.url} não respondeu em ${TIMEOUT / 1000}s` : `não consegui falar com ${c.url}: ${(e as Error).message}`, 504)
  }
  if (res.status === 401) {
    throw new RepoError(c.token ? 'o token foi recusado (401): ele expirou ou não tem as permissões pedidas' : 'isto exige login (401): configure um token na conexão, na tela Repositórios', 401)
  }
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') throw new RepoError('limite de chamadas da API atingido; configure um token para ter limite maior', 429)
  if (res.status === 404) throw new RepoError('não encontrado: o caminho não existe ou o token não tem acesso a ele', 404)
  if (!res.ok) throw new RepoError(`${c.url} respondeu ${res.status} em ${path.split('?')[0]}`, 502)
  return { data: await res.json(), res }
}

// Todas as páginas: GitLab informa X-Next-Page; GitHub, o cabeçalho Link com rel="next".
async function all<T>(c: Conn, path: string, max = 5000): Promise<T[]> {
  const out: T[] = []
  const sep = path.includes('?') ? '&' : '?'
  for (let page = 1; out.length < max; page++) {
    const { data, res } = await call(c, `${path}${sep}per_page=100&page=${page}`)
    out.push(...(data as T[]))
    const more = c.provider === 'gitlab' ? Boolean(res.headers.get('x-next-page')) : /rel="next"/.test(res.headers.get('link') ?? '')
    if (!more || (data as T[]).length === 0) break
  }
  return out
}

type GlGroup = { id: number; name: string; full_path: string; description: string | null; web_url: string }
type GlProject = { name: string; path_with_namespace: string; description: string | null; archived: boolean; last_activity_at: string; ssh_url_to_repo: string; http_url_to_repo: string; web_url: string }
type GhRepo = { name: string; full_name: string; description: string | null; archived: boolean; pushed_at: string | null; ssh_url: string; clone_url: string; html_url: string }

const fromGl = (p: GlProject): Project => ({
  name: p.name, fullPath: p.path_with_namespace, description: p.description ?? '', archived: p.archived,
  lastActivity: p.last_activity_at, sshUrl: p.ssh_url_to_repo, httpUrl: p.http_url_to_repo, webUrl: p.web_url,
})
const fromGh = (r: GhRepo): Project => ({
  name: r.name, fullPath: r.full_name, description: r.description ?? '', archived: r.archived,
  lastActivity: r.pushed_at, sshUrl: r.ssh_url, httpUrl: r.clone_url, webUrl: r.html_url,
})

const enc = (p: string) => encodeURIComponent(p)

export async function whoami(c: Conn): Promise<string> {
  if (!c.token) return 'sem token (só o que é público)'
  const { data } = await call(c, '/user')
  return (data as { username?: string; login?: string }).username ?? (data as { login: string }).login
}

export async function children(c: Conn, rawPath: string): Promise<Children> {
  const path = normalizePath(rawPath)
  if (c.provider === 'gitlab') {
    if (!path) {
      // Raiz: grupos de topo que o token enxerga.
      const groups = await all<GlGroup>(c, '/groups?top_level_only=true&min_access_level=10&order_by=name&sort=asc', 500)
      return { path, webUrl: c.url, groups: groups.map(g => ({ name: g.name, fullPath: g.full_path, description: g.description ?? '' })), projects: [] }
    }
    const { data: group } = await call(c, `/groups/${enc(path)}`) as { data: GlGroup }
    const [subgroups, projects] = await Promise.all([
      all<GlGroup>(c, `/groups/${group.id}/subgroups?order_by=name&sort=asc&all_available=true`),
      all<GlProject>(c, `/groups/${group.id}/projects?include_subgroups=false&with_shared=false&order_by=name&sort=asc&simple=false`),
    ])
    return {
      path, webUrl: group.web_url,
      groups: subgroups.map(g => ({ name: g.name, fullPath: g.full_path, description: g.description ?? '' })),
      projects: projects.map(fromGl),
    }
  }

  if (!path) {
    const orgs = c.token ? await all<{ login: string; description: string | null }>(c, '/user/orgs', 500) : []
    const me = c.token ? await whoami(c) : null
    return { path, webUrl: c.url, groups: [...(me ? [{ name: `${me} (você)`, fullPath: me, description: 'seus repositórios' }] : []), ...orgs.map(o => ({ name: o.login, fullPath: o.login, description: o.description ?? '' }))], projects: [] }
  }
  if (path.includes('/')) throw new RepoError('no GitHub não há subgrupos: navegue pela organização ou usuário')
  const repos = await reposOf(c, path)
  return { path, webUrl: `${c.url}/${path}`, groups: [], projects: repos.map(fromGh).sort((a, b) => a.name.localeCompare(b.name)) }
}

async function reposOf(c: Conn, owner: string): Promise<GhRepo[]> {
  const { data } = await call(c, `/users/${enc(owner)}`) as { data: { type: string } }
  if (data.type === 'Organization') return all<GhRepo>(c, `/orgs/${enc(owner)}/repos?type=all`)
  // Repositórios do próprio usuário (inclui privados) só pelo /user/repos; de outro usuário, os públicos.
  const me = c.token ? await whoami(c).catch(() => null) : null
  return me === owner ? all<GhRepo>(c, '/user/repos?affiliation=owner') : all<GhRepo>(c, `/users/${enc(owner)}/repos?type=owner`)
}

// Todos os projetos abaixo de um grupo, inclusive em subgrupos (para clonar o grupo inteiro).
export async function projectsUnder(c: Conn, rawPath: string): Promise<Project[]> {
  const path = normalizePath(rawPath)
  if (!path) throw new RepoError('escolha um grupo para clonar; clonar a raiz inteira não é permitido')
  if (c.provider === 'gitlab') {
    const { data: group } = await call(c, `/groups/${enc(path)}`) as { data: GlGroup }
    return (await all<GlProject>(c, `/groups/${group.id}/projects?include_subgroups=true&with_shared=false&order_by=path&sort=asc`)).map(fromGl)
  }
  return (await reposOf(c, path)).map(fromGh)
}

export async function project(c: Conn, fullPath: string): Promise<Project> {
  const path = normalizePath(fullPath)
  if (c.provider === 'gitlab') return fromGl((await call(c, `/projects/${enc(path)}`)).data as GlProject)
  return fromGh((await call(c, `/repos/${path.split('/').map(enc).join('/')}`)).data as GhRepo)
}
