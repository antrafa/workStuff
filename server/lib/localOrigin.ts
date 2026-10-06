// Binding to 127.0.0.1 keeps the network out, not the browser: any page the user opens can send
// requests to localhost (CSRF), and a DNS-rebinding page can even read the answers. The panel runs
// agents and commands, so only requests addressed to localhost and coming from it get through.
// Autoteste: node server/lib/localOrigin.ts --selfcheck

import assert from 'node:assert/strict'
import type { RequestHandler } from 'express'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const hostnameOf = (host: string) => host.replace(/:\d+$/, '').toLowerCase()

// No Origin (curl, a same-origin GET) is fine; a cross-site page always sends one.
export function isLocalRequest(host: string | undefined, origin: string | undefined): boolean {
  if (!host || !LOCAL_HOSTS.has(hostnameOf(host))) return false
  if (!origin) return true
  try {
    return LOCAL_HOSTS.has(hostnameOf(new URL(origin).host))
  } catch {
    return false
  }
}

export const localOriginOnly: RequestHandler = (req, res, next) => {
  if (isLocalRequest(req.headers.host, req.headers.origin)) return next()
  res.status(403).json({ error: 'requisição recusada: o painel só aceita chamadas do próprio localhost' })
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.ok(isLocalRequest('127.0.0.1:3101', undefined), 'curl local')
  assert.ok(isLocalRequest('localhost:5180', 'http://localhost:5180'), 'painel pelo proxy do Vite')
  assert.ok(isLocalRequest('[::1]:3101', 'http://127.0.0.1:5180'))
  assert.ok(!isLocalRequest('evil.example:3101', undefined), 'DNS rebinding: Host de outro domínio')
  assert.ok(!isLocalRequest('localhost:3101', 'https://evil.example'), 'CSRF: página de outro site')
  assert.ok(!isLocalRequest('localhost:3101', 'null'), 'Origin opaco (iframe sandbox, file://)')
  assert.ok(!isLocalRequest(undefined, undefined))
  console.log('localOrigin selfcheck: ok')
}
