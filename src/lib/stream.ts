// Lê uma resposta SSE de um POST (o EventSource do navegador só faz GET).
// Cada evento chega como "data: {json}\n\n"; o retorno termina quando o servidor fecha a conexão.
export async function streamPost<E>(path: string, onEvent: (e: E) => void, signal?: AbortSignal, body?: unknown) {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: 'POST',
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    throw new Error('o servidor local não respondeu; ele está rodando? (npm run dev)')
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? `POST ${path} respondeu ${res.status}`)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let sep
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const line = buffer.slice(0, sep).replace(/^data: /, '')
        buffer = buffer.slice(sep + 2)
        if (line) onEvent(JSON.parse(line) as E)
      }
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') throw e
  }
}
