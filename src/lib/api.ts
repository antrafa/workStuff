import { tx } from './i18n'

// Local API client. The error it throws carries the server's message, ready for the screen.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error(tx({ en: 'the local server did not respond; is it running? (npm run dev)', pt: 'o servidor local não respondeu; ele está rodando? (npm run dev)' }))
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? tx({ en: `${method} ${path} answered ${res.status}`, pt: `${method} ${path} respondeu ${res.status}` }))
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
