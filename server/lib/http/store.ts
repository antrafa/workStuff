// Saved requests and environments of the Requests screen, in one file of the data folder. Headers and
// variables often hold tokens, so the file is readable only by its owner, like the git credentials.
// Selfcheck: node server/lib/http/store.ts --selfcheck

import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { say } from '../i18n.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { dataFile } from '../paths.ts'
import { HttpError, METHODS } from './request.ts'

// `headers` is "Name: value" per line and `vars` is "name=value" per line: what the person types
export type SavedRequest = { id: string; name: string; group: string; method: string; url: string; headers: string; body: string }
export type HttpEnvironment = { id: string; name: string; vars: string }
export type HttpStore = { requests: SavedRequest[]; environments: HttpEnvironment[] }

const FILE = dataFile('http-requests.json')
const MAX_ITEMS = 500
const MAX_FIELD = 200_000

export const readStore = (file = FILE): HttpStore => readJson<HttpStore>(file, { requests: [], environments: [] })

const text = (v: unknown, field: string) => {
  const s = typeof v === 'string' ? v : ''
  if (s.length > MAX_FIELD) throw new HttpError(say({ en: `${field} is too long`, pt: `${field} grande demais` }))
  return s
}

export function validateStore(raw: unknown): HttpStore {
  const r = (raw ?? {}) as Record<string, unknown>
  const requests = Array.isArray(r.requests) ? r.requests : []
  const environments = Array.isArray(r.environments) ? r.environments : []
  if (requests.length > MAX_ITEMS || environments.length > MAX_ITEMS) throw new HttpError(say({ en: `at most ${MAX_ITEMS} items`, pt: `no máximo ${MAX_ITEMS} itens` }))
  const ids = new Set<string>()
  const id = (v: unknown) => {
    const s = String(v ?? '')
    if (!/^[A-Za-z0-9-]{1,64}$/.test(s) || ids.has(s)) throw new HttpError(say({ en: 'invalid or repeated id', pt: 'id inválido ou repetido' }))
    ids.add(s)
    return s
  }
  return {
    requests: requests.map((q: Record<string, unknown>) => {
      const method = String(q?.method ?? 'GET').toUpperCase()
      if (!(METHODS as readonly string[]).includes(method)) throw new HttpError(say({ en: `unsupported method: ${method}`, pt: `método não suportado: ${method}` }))
      return {
        id: id(q?.id), name: text(q?.name, 'name').trim() || say({ en: 'untitled', pt: 'sem nome' }), group: text(q?.group, 'group').trim(), method,
        url: text(q?.url, 'url'), headers: text(q?.headers, 'headers'), body: text(q?.body, 'body'),
      }
    }),
    environments: environments.map((e: Record<string, unknown>) => ({ id: id(e?.id), name: text(e?.name, 'name').trim() || say({ en: 'untitled', pt: 'sem nome' }), vars: text(e?.vars, 'vars') })),
  }
}

export function writeStore(store: HttpStore, file = FILE) {
  writeJson(file, store)
  chmodSync(file, 0o600)
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const tmp = mkdtempSync(join(tmpdir(), 'ws-http-store-'))
  try {
    const file = join(tmp, 'http.json')
    assert.deepEqual(readStore(file), { requests: [], environments: [] }, 'sem arquivo, começa vazio')
    const doc = validateStore({
      requests: [{ id: 'a1', name: ' Saúde ', group: 'api', method: 'get', url: '{{base}}/health', headers: 'Authorization: Bearer {{token}}', body: '' }],
      environments: [{ id: 'e1', name: 'HML', vars: 'base=http://127.0.0.1:8080\ntoken=abc' }],
    })
    assert.equal(doc.requests[0].method, 'GET')
    assert.equal(doc.requests[0].name, 'Saúde')
    writeStore(doc, file)
    assert.equal(statSync(file).mode & 0o777, 0o600, 'só o dono lê: pode ter token')
    assert.deepEqual(readStore(file), doc)
    assert.ok(existsSync(file))

    assert.throws(() => validateStore({ requests: [{ id: 'x', method: 'TRACE' }] }), /unsupported method/)
    assert.throws(() => validateStore({ requests: [{ id: '../x' }] }), /invalid or repeated id/)
    assert.throws(() => validateStore({ requests: [{ id: 'x' }], environments: [{ id: 'x' }] }), /repeated/)
    assert.throws(() => validateStore({ requests: [{ id: 'x', body: 'a'.repeat(MAX_FIELD + 1) }] }), /too long/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  console.log('http store selfcheck: ok')
}
