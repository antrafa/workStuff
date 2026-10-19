// Append-only audit trails (Doctor, runbooks, dev runbooks), one JSON line per entry, each line chained
// to the previous one by hash: deleting, editing or reordering a line breaks the chain at that point.
// Autoteste: node server/lib/auditLog.ts --selfcheck
//
// ponytail: plain SHA-256, no secret key. Anyone who can write ~/.workstuff can rewrite the whole chain;
// a key kept in the same home would not stop them either. What this catches is a line removed or edited
// by hand, or a log cut in the middle. Two processes appending at the same instant can fork the chain;
// the Doctor hook runs one command at a time, and a fork reads as a break, never as a silent pass.

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const GENESIS = '0'.repeat(64)
// The last line of an audit entry fits comfortably; reading only the tail keeps appends cheap on old logs
const TAIL_BYTES = 64 * 1024

const digest = (prev: string, body: string) => createHash('sha256').update(prev).update('\n').update(body).digest('hex')

function lastLine(file: string): string {
  if (!existsSync(file)) return ''
  const fd = openSync(file, 'r')
  try {
    const size = fstatSync(fd).size
    const start = Math.max(0, size - TAIL_BYTES)
    const buf = Buffer.alloc(size - start)
    readSync(fd, buf, 0, buf.length, start)
    const lines = buf.toString('utf-8').split('\n').filter(Boolean)
    return lines.at(-1) ?? ''
  } finally {
    closeSync(fd)
  }
}

// A log written before the chain existed has lines without a hash: the chain starts after them.
function hashOf(line: string): string {
  try {
    const parsed = JSON.parse(line) as { hash?: unknown }
    return typeof parsed.hash === 'string' ? parsed.hash : GENESIS
  } catch {
    return GENESIS
  }
}

export function appendAudit(file: string, entry: Record<string, unknown>): void {
  mkdirSync(dirname(file), { recursive: true })
  const prev = hashOf(lastLine(file))
  const body = JSON.stringify({ at: new Date().toISOString(), ...entry })
  const hash = digest(prev, body)
  appendFileSync(file, JSON.stringify({ ...JSON.parse(body), prev, hash }) + '\n')
}

export type AuditCheck = { ok: true; entries: number } | { ok: false; entries: number; brokenAt: number; reason: string }

// Walks the whole file. Lines before the first chained one are legacy and not checked.
export function verifyAudit(file: string): AuditCheck {
  if (!existsSync(file)) return { ok: true, entries: 0 }
  const lines = readFileSync(file, 'utf-8').split('\n').filter(Boolean)
  let prev: string | null = null
  let entries = 0
  for (const [i, line] of lines.entries()) {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(line)
    } catch {
      return { ok: false, entries, brokenAt: i + 1, reason: 'unreadable line' }
    }
    const { prev: claimedPrev, hash, ...rest } = parsed
    if (typeof hash !== 'string') {
      if (prev !== null) return { ok: false, entries, brokenAt: i + 1, reason: 'line without hash after the chain started' }
      continue
    }
    // The first chained line always starts from GENESIS, so cutting the head of the log is caught too
    const expectedPrev = prev ?? GENESIS
    if (claimedPrev !== expectedPrev) return { ok: false, entries, brokenAt: i + 1, reason: 'previous line missing or changed' }
    if (digest(expectedPrev, JSON.stringify(rest)) !== hash) return { ok: false, entries, brokenAt: i + 1, reason: 'line edited' }
    prev = hash
    entries++
  }
  return { ok: true, entries }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-'))
  try {
    const file = join(dir, 'sub', 'x-audit.log')
    assert.deepEqual(verifyAudit(file), { ok: true, entries: 0 }, 'missing log is an empty, intact chain')
    appendAudit(file, { command: 'kubectl get pods', decision: 'allow' })
    appendAudit(file, { command: 'kubectl delete pod x', decision: 'deny' })
    appendAudit(file, { command: 'kubectl logs x', decision: 'allow' })
    assert.deepEqual(verifyAudit(file), { ok: true, entries: 3 })

    const lines = readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    writeFileSync(file, [lines[0], lines[2]].join('\n') + '\n')
    const removed = verifyAudit(file)
    assert.equal(removed.ok, false, 'a removed line breaks the chain')
    assert.equal(!removed.ok && removed.brokenAt, 2)

    writeFileSync(file, [lines[0], lines[1].replace('deny', 'allow'), lines[2]].join('\n') + '\n')
    const edited = verifyAudit(file)
    assert.equal(!edited.ok && edited.reason, 'line edited')

    // A log from before the chain keeps its old lines and chains from there on
    const legacy = join(dir, 'legacy.log')
    writeFileSync(legacy, JSON.stringify({ at: 'x', command: 'old' }) + '\n')
    appendAudit(legacy, { command: 'new' })
    assert.deepEqual(verifyAudit(legacy), { ok: true, entries: 1 })
    appendFileSync(legacy, JSON.stringify({ at: 'y', command: 'unchained' }) + '\n')
    assert.equal(verifyAudit(legacy).ok, false, 'an unchained line after the chain started is a break')

    writeFileSync(file, '')
    appendAudit(file, { n: 1 })
    appendAudit(file, { n: 2 })
    const [, second] = readFileSync(file, 'utf-8').split('\n')
    writeFileSync(file, second + '\n')
    assert.equal(verifyAudit(file).ok, false, 'a cut head is a break')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  console.log('auditLog selfcheck: ok')
}
