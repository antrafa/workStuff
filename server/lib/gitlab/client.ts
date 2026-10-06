import { say } from '../i18n.ts'
// Cliente da API do GitLab. A conexão (URL e token) vem de uma conexão da tela Repositórios;
// o token fica só no servidor e nunca vai para o navegador.

const TIMEOUT_MS = 15_000

export type GitlabConn = { url: string; token: string | null }

export class GitlabError extends Error {
  readonly status: number
  readonly body: Record<string, unknown>
  constructor(message: string, status: number, body: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.body = body
  }
}

export async function gitlabFetch(c: GitlabConn, path: string, init: RequestInit = {}) {
  let res: Response
  try {
    res = await fetch(`${c.url}/api/v4${path}`, {
      ...init,
      headers: { ...(c.token ? { 'PRIVATE-TOKEN': c.token } : {}), ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const timeout = (e as Error).name === 'TimeoutError'
    throw new GitlabError(timeout
      ? say({ en: 'GitLab did not respond in 15s', pt: 'o GitLab não respondeu em 15s' })
      : say({ en: `could not reach GitLab: ${(e as Error).message}`, pt: `não consegui falar com o GitLab: ${(e as Error).message}` }), 504)
  }
  if (res.status === 401) throw new GitlabError(say({ en: 'GitLab refused the token (401): it expired or has no API access', pt: 'o GitLab recusou o token (401): ele expirou ou não tem acesso à API' }), 401)
  return res
}

export async function gitlabJson<T>(c: GitlabConn, path: string, notFound = say({ en: 'resource not found on GitLab', pt: 'recurso não encontrado no GitLab' })): Promise<T> {
  const res = await gitlabFetch(c, path)
  if (res.status === 404) throw new GitlabError(notFound, 404)
  if (!res.ok) throw new GitlabError(say({ en: `GitLab answered ${res.status} on ${path.split('?')[0]}`, pt: `o GitLab respondeu ${res.status} em ${path.split('?')[0]}` }), 502)
  return (await res.json()) as T
}

export async function gitlabText(c: GitlabConn, path: string): Promise<string | null> {
  const res = await gitlabFetch(c, path)
  if (res.status === 404) return null
  if (!res.ok) throw new GitlabError(say({ en: `GitLab answered ${res.status} on ${path.split('?')[0]}`, pt: `o GitLab respondeu ${res.status} em ${path.split('?')[0]}` }), 502)
  return res.text()
}

export async function gitlabAllPages<T>(c: GitlabConn, path: string): Promise<T[]> {
  const all: T[] = []
  for (let page = 1; ; page++) {
    const res = await gitlabFetch(c, `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
    if (!res.ok) throw new GitlabError(say({ en: `GitLab answered ${res.status} listing ${path.split('?')[0]}`, pt: `o GitLab respondeu ${res.status} ao listar ${path.split('?')[0]}` }), 502)
    all.push(...((await res.json()) as T[]))
    if (page >= Number(res.headers.get('X-Total-Pages') ?? '1')) return all
  }
}
