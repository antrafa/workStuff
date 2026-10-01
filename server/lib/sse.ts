import type { Response } from 'express'

// Server-Sent Events: a resposta fica aberta e cada evento vai numa linha "data: {json}".
export function openSse(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const abort = new AbortController()
  // Fechar a aba ou clicar em "Parar" fecha a conexão, e isso encerra o processo do CLI.
  res.on('close', () => abort.abort())

  return {
    signal: abort.signal,
    send: (event: object) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
    },
    end: () => res.end(),
  }
}
