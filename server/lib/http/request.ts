// Sends one HTTP request for the Requests screen and brings back what a person needs to read the answer.
// It goes out from the server, not the browser: no CORS in the way, and an endpoint behind a K8s
// tunnel on 127.0.0.1 answers the same as any other.
// Selfcheck: node server/lib/http/request.ts --selfcheck

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { say } from '../i18n.ts'

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export type Method = (typeof METHODS)[number]
export type HeaderPair = { name: string; value: string }
export type OutgoingRequest = { method: Method; url: string; headers: HeaderPair[]; body: string }
export type HttpAnswer = {
  status: number
  statusText: string
  url: string
  headers: HeaderPair[]
  body: string
  binary: boolean
  bytes: number
  truncated: boolean
  ms: number
}

export class HttpError extends Error {}

const MAX_BODY = 5 * 1024 * 1024
const TIMEOUT = 60_000
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const TEXT_TYPE = /^text\/|json|xml|javascript|yaml|x-www-form-urlencoded|graphql|csv/i

export function validateRequest(raw: unknown): OutgoingRequest {
  const r = (raw ?? {}) as Record<string, unknown>
  const method = String(r.method ?? 'GET').toUpperCase() as Method
  if (!METHODS.includes(method)) throw new HttpError(say({ en: `unsupported method: ${method}`, pt: `método não suportado: ${method}` }))
  let url: URL
  try {
    url = new URL(String(r.url ?? '').trim())
  } catch {
    throw new HttpError(say({ en: 'invalid URL: it must start with http:// or https://', pt: 'URL inválida: ela precisa começar com http:// ou https://' }))
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpError(say({ en: 'only http:// and https:// addresses', pt: 'só endereços http:// e https://' }))
  const headers = Array.isArray(r.headers) ? (r.headers as HeaderPair[]).map(h => ({ name: String(h?.name ?? '').trim(), value: String(h?.value ?? '') })) : []
  const bad = headers.find(h => !TOKEN.test(h.name) || /[\r\n]/.test(h.value))
  if (bad) throw new HttpError(say({ en: `invalid header: ${bad.name || '(no name)'}`, pt: `cabeçalho inválido: ${bad.name || '(sem nome)'}` }))
  return { method, url: url.toString(), headers, body: typeof r.body === 'string' ? r.body : '' }
}

// Node's fetch hides the reason in `cause`: the code is what tells a refused port from a bad certificate
function explainFailure(e: Error, url: string): string {
  const code = (e.cause as { code?: string } | undefined)?.code ?? ''
  if (e.name === 'TimeoutError') return say({ en: `no answer in ${TIMEOUT / 1000}s`, pt: `sem resposta em ${TIMEOUT / 1000}s` })
  if (code === 'ECONNREFUSED') return say({ en: `nothing is listening at ${new URL(url).host} (connection refused); if it is a cluster service, open a tunnel in Local services`, pt: `nada escutando em ${new URL(url).host} (conexão recusada); se for um serviço do cluster, abra um túnel em Serviços locais` })
  if (code === 'ENOTFOUND') return say({ en: `the name ${new URL(url).hostname} does not resolve (DNS); check the address or the VPN`, pt: `o nome ${new URL(url).hostname} não resolve (DNS); confira o endereço ou a VPN` })
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') return say({ en: 'the server closed the connection without answering', pt: 'o servidor fechou a conexão sem responder' })
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) return say({ en: `the server's TLS certificate is not trusted (${code}); the panel does not skip that check`, pt: `o certificado TLS do servidor não é confiável (${code}); o painel não pula essa verificação` })
  return `${e.message}${code ? ` (${code})` : ''}`
}

async function readCapped(res: Response): Promise<{ bytes: Uint8Array; total: number; truncated: boolean }> {
  if (!res.body) return { bytes: new Uint8Array(), total: 0, truncated: false }
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_BODY) {
      chunks.push(value.subarray(0, MAX_BODY - (total - value.length)))
      await reader.cancel()
      return { bytes: concat(chunks), total, truncated: true }
    }
    chunks.push(value)
  }
  return { bytes: concat(chunks), total, truncated: false }
}

const concat = (chunks: Uint8Array[]) => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

export async function sendRequest(req: OutgoingRequest): Promise<HttpAnswer> {
  const started = performance.now()
  let res: Response
  try {
    res = await fetch(req.url, {
      method: req.method,
      headers: req.headers.map(h => [h.name, h.value] as [string, string]),
      body: req.method === 'GET' || req.method === 'HEAD' || !req.body ? undefined : req.body,
      signal: AbortSignal.timeout(TIMEOUT),
    })
  } catch (e) {
    throw new HttpError(explainFailure(e as Error, req.url))
  }
  const { bytes, total, truncated } = await readCapped(res)
  const type = res.headers.get('content-type') ?? ''
  const binary = type !== '' && !TEXT_TYPE.test(type)
  return {
    status: res.status,
    statusText: res.statusText,
    url: res.url,
    headers: [...res.headers].map(([name, value]) => ({ name, value })),
    body: binary ? '' : new TextDecoder().decode(bytes),
    binary,
    bytes: total,
    truncated,
    ms: Math.round(performance.now() - started),
  }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.throws(() => validateRequest({ url: 'file:///etc/passwd' }), /only http/)
  assert.throws(() => validateRequest({ url: 'nada' }), /invalid URL/)
  assert.throws(() => validateRequest({ method: 'TRACE', url: 'http://x' }), /unsupported method/)
  assert.throws(() => validateRequest({ url: 'http://x', headers: [{ name: 'X-A', value: 'a\r\nHost: y' }] }), /invalid header: X-A/, 'quebra de linha no valor não injeta cabeçalho')
  assert.throws(() => validateRequest({ url: 'http://x', headers: [{ name: 'Com espaço', value: 'a' }] }), /invalid header/)
  assert.equal(validateRequest({ method: 'post', url: ' http://x/a?b=1 ' }).method, 'POST')

  const server = createServer((req, res) => {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => {
      if (req.url === '/grande') {
        res.setHeader('content-type', 'text/plain')
        res.end('x'.repeat(MAX_BODY + 10))
        return
      }
      if (req.url === '/imagem') {
        res.setHeader('content-type', 'image/png')
        res.end(Buffer.from([0x89, 0x50]))
        return
      }
      res.statusCode = 201
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ method: req.method, auth: req.headers.authorization, body }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const ok = await sendRequest(validateRequest({ method: 'POST', url: `${base}/eco`, headers: [{ name: 'Authorization', value: 'Bearer t' }], body: '{"a":1}' }))
    assert.equal(ok.status, 201)
    assert.deepEqual(JSON.parse(ok.body), { method: 'POST', auth: 'Bearer t', body: '{"a":1}' })
    assert.ok(ok.headers.some(h => h.name === 'content-type'))
    assert.equal((await sendRequest(validateRequest({ url: `${base}/eco`, body: 'ignorado' }))).body.includes('ignorado'), false, 'GET não leva corpo')

    const big = await sendRequest(validateRequest({ url: `${base}/grande` }))
    assert.ok(big.truncated && big.body.length === MAX_BODY, 'corpo grande é cortado, sem estourar a memória')
    const img = await sendRequest(validateRequest({ url: `${base}/imagem` }))
    assert.deepEqual([img.binary, img.body, img.bytes], [true, '', 2])
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  // A port that never had a connection: the pool of fetch cannot hand back an old socket for it
  const closed = createServer()
  await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
  const freePort = (closed.address() as AddressInfo).port
  await new Promise(resolve => closed.close(resolve))
  await assert.rejects(sendRequest(validateRequest({ url: `http://127.0.0.1:${freePort}` })), /connection refused|conexão recusada/, 'porta fechada vira mensagem clara')
  console.log('http request selfcheck: ok')
}
