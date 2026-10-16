// PID files of the processes the panel starts (Local services: applications and K8s tunnels).
// The start time is stored beside the PID: after a reboot the same number can belong to an unrelated
// process, which must then neither show as ours nor receive our SIGTERM.
// Autoteste: node server/lib/local/pidfile.ts --selfcheck

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

// Start time in clock ticks (field 22 of /proc/<pid>/stat), null where there is no /proc (macOS, Windows).
function startTimeOf(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8')
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null
  } catch {
    return null
  }
}

export function writePidFile(file: string, pid: number) {
  writeFileSync(file, `${pid} ${startTimeOf(pid) ?? ''}`)
}

// The recorded PID while it still runs the process we started; null for a dead or reused one. A file
// without a start time (written before it was recorded, or off Linux) falls back to "alive".
export function readPidFile(file: string): number | null {
  let pid: number
  let started: string | undefined
  try {
    const [pidText, startText] = readFileSync(file, 'utf-8').trim().split(/\s+/)
    pid = Number(pidText)
    started = startText
  } catch {
    return null
  }
  if (!(pid > 1) || !alive(pid)) return null
  const now = startTimeOf(pid)
  return started && now && started !== now ? null : pid
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const dir = mkdtempSync(join(tmpdir(), 'ws-pidfile-'))
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  try {
    await new Promise(r => child.once('spawn', r))
    const file = join(dir, 'pid')
    writePidFile(file, child.pid!)
    assert.equal(readPidFile(file), child.pid)
    writeFileSync(file, String(child.pid))
    assert.equal(readPidFile(file), child.pid, 'arquivo antigo, só com o PID, ainda vale')
    if (existsSync(`/proc/${child.pid}/stat`)) {
      writeFileSync(file, `${child.pid} 1`)
      assert.equal(readPidFile(file), null, 'mesmo número com outra hora de início é outro processo')
    }
    assert.equal(readPidFile(join(dir, 'nao-existe')), null)
    console.log('pidfile selfcheck: ok')
  } finally {
    child.kill()
    rmSync(dir, { recursive: true, force: true })
  }
}
