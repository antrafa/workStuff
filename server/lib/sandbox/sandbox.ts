import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { run, which } from '../run.ts'

export type SandboxDriver = 'bwrap' | 'sandbox-exec' | null

export type SandboxOptions = {
  writable: string[]
  tmpDir: string
  cwd?: string
  env?: Record<string, string>
  protectGit?: boolean
  /** sandbox-exec only: folders the process cannot read, except what readable and writable give back. */
  denyRead?: string[]
  readable?: string[]
}

let cachedDriver: SandboxDriver | undefined
let driverOverride: SandboxDriver | undefined
export const setDriverOverride = (driver: SandboxDriver | undefined) => { driverOverride = driver }

/**
 * Detects the available sandbox driver:
 * 1. 'bwrap' if bubblewrap is on PATH
 * 2. 'sandbox-exec' if running on macOS and sandbox-exec is available
 * 3. null if no supported sandbox driver is available
 */
export async function detectSandboxDriver(forceRefresh = false): Promise<SandboxDriver> {
  if (driverOverride !== undefined) return driverOverride
  if (cachedDriver !== undefined && !forceRefresh) return cachedDriver
  if (await which('bwrap')) {
    cachedDriver = 'bwrap'
    return 'bwrap'
  }
  if (process.platform === 'darwin' && (await which('sandbox-exec'))) {
    cachedDriver = 'sandbox-exec'
    return 'sandbox-exec'
  }
  cachedDriver = null
  return null
}

function resolveRealPath(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    const parent = dirname(p)
    if (parent && parent !== p) {
      const resolvedParent = resolveRealPath(parent)
      return join(resolvedParent, basename(p))
    }
    return p
  }
}

// An SBPL string literal: a quote or backslash in a path would otherwise end the string and
// let the rest of the path be read as profile rules.
const sbString = (s: string) => `"${s.replace(/[\\"]/g, '\\$&')}"`

const withRealPaths = (dirs: string[]) => [...new Set(dirs.filter(Boolean).flatMap(d => [d, resolveRealPath(d)]))]

/**
 * Builds a Seatbelt Scheme profile for macOS sandbox-exec.
 * Denies all writes by default, allows /dev/, and allows specified writable paths.
 * If protectGit is enabled, explicitly denies writes to .git directories.
 * denyRead hides folders (secrets); readable, writable and tmpDir are allowed back on top of it,
 * since in SBPL the last matching rule wins.
 */
export function buildSeatbeltProfile(options: Omit<SandboxOptions, 'env'>): string {
  const lines: string[] = [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    '(allow file-write* (regex #"^/dev/"))',
  ]
  const writable = withRealPaths([...options.writable, options.tmpDir])
  for (const p of writable) lines.push(`(allow file-write* (subpath ${sbString(p)}))`)

  if (options.protectGit) {
    for (const p of withRealPaths(options.writable.filter(Boolean).map(dir => join(dir, '.git')))) {
      lines.push(`(deny file-write* (subpath ${sbString(p)}))`)
    }
  }

  if (options.denyRead?.length) {
    for (const p of withRealPaths(options.denyRead)) lines.push(`(deny file-read* (subpath ${sbString(p)}))`)
    for (const p of withRealPaths([...(options.readable ?? []), ...writable])) lines.push(`(allow file-read* (subpath ${sbString(p)}))`)
  }

  return lines.join('\n')
}

/**
 * Wraps a binary and its arguments inside the sandbox driver.
 * Returns the modified { bin, args } spec.
 */
export function wrapCommand(
  driver: SandboxDriver,
  options: SandboxOptions,
  bin: string,
  args: string[],
): { bin: string; args: string[] } {
  if (driver === 'sandbox-exec') {
    const profile = buildSeatbeltProfile(options)
    return { bin: 'sandbox-exec', args: ['-p', profile, bin, ...args] }
  }

  if (driver === 'bwrap') {
    const bwrapArgs: string[] = [
      '--ro-bind', '/', '/',
      '--dev', '/dev',
      '--proc', '/proc',
      ...options.writable.flatMap(dir => ['--bind', dir, dir]),
    ]
    if (options.protectGit) {
      bwrapArgs.push(...options.writable.flatMap(dir => ['--ro-bind-try', join(dir, '.git'), join(dir, '.git')]))
    }
    bwrapArgs.push(
      '--bind', options.tmpDir, options.tmpDir,
      '--setenv', 'TMPDIR', options.tmpDir,
      ...Object.entries(options.env ?? {}).flatMap(([k, v]) => ['--setenv', k, v]),
      '--unshare-pid',
      '--die-with-parent',
    )
    if (options.cwd) {
      bwrapArgs.push('--chdir', options.cwd)
    }
    bwrapArgs.push(bin, ...args)
    return { bin: 'bwrap', args: bwrapArgs }
  }

  return { bin, args }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  // 1. Seatbelt profile generation tests
  const basicProfile = buildSeatbeltProfile({
    writable: ['/tmp/test-writable'],
    tmpDir: '/tmp/test-tmp',
  })
  assert.ok(basicProfile.includes('(deny file-write*)'), 'default deny file-write*')
  assert.ok(basicProfile.includes('^/dev/'), 'allows /dev/')
  assert.ok(basicProfile.includes('(allow file-write* (subpath "/tmp/test-writable"))'), 'allows writable directory')
  assert.ok(basicProfile.includes('(allow file-write* (subpath "/tmp/test-tmp"))'), 'allows tmp directory')
  assert.ok(!basicProfile.includes('.git'), 'does not include git deny when protectGit is false')

  // With protectGit
  const protectedProfile = buildSeatbeltProfile({
    writable: ['/tmp/test-writable'],
    tmpDir: '/tmp/test-tmp',
    protectGit: true,
  })
  assert.ok(protectedProfile.includes('(deny file-write* (subpath "/tmp/test-writable/.git"))'), 'denies write to .git when protectGit is true')

  // Real path / symlink handling test
  const tempDir = mkdtempSync(join(tmpdir(), 'ws-sandbox-selfcheck-'))
  try {
    const writableSub = join(tempDir, 'repo')
    mkdirSync(writableSub)
    const gitDir = join(writableSub, '.git')
    mkdirSync(gitDir)
    const symlinkTmp = join(tempDir, 'scratch')
    const realTempDir = realpathSync(tempDir)

    const symProfile = buildSeatbeltProfile({
      writable: [writableSub],
      tmpDir: symlinkTmp,
      protectGit: true,
    })

    assert.ok(symProfile.includes(writableSub), 'includes original writable path')
    assert.ok(symProfile.includes(join(realTempDir, 'repo')), 'includes resolved writable path')
    assert.ok(symProfile.includes(gitDir), 'includes git deny path')
    assert.ok(symProfile.includes(join(realTempDir, 'repo', '.git')), 'includes resolved git deny path')
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }

  // Read denial: secrets hidden, the run's folders given back after the deny (last match wins)
  const readProfile = buildSeatbeltProfile({ writable: ['/tmp/w'], tmpDir: '/tmp/t', denyRead: ['/Users/u/.ssh', '/Users/u/.workstuff'], readable: ['/Users/u/.workstuff/worktrees/x'] })
  const denyAt = readProfile.indexOf('(deny file-read* (subpath "/Users/u/.workstuff"))')
  assert.ok(denyAt > 0, 'denies reading the data folder')
  assert.ok(readProfile.includes('(deny file-read* (subpath "/Users/u/.ssh"))'))
  assert.ok(readProfile.indexOf('(allow file-read* (subpath "/Users/u/.workstuff/worktrees/x"))') > denyAt, 'the run folder comes back after the deny')
  assert.ok(readProfile.indexOf('(allow file-read* (subpath "/tmp/w"))') > denyAt, 'writable folders stay readable')
  assert.ok(!basicProfile.includes('file-read*'), 'no read rules without denyRead')
  assert.ok(buildSeatbeltProfile({ writable: ['/tmp/a"b\\c'], tmpDir: '/tmp/t' }).includes('(subpath "/tmp/a\\"b\\\\c")'), 'quotes and backslashes are escaped')

  // 2. wrapCommand tests
  // sandbox-exec driver
  const execWrapped = wrapCommand(
    'sandbox-exec',
    { writable: ['/tmp/w'], tmpDir: '/tmp/t', protectGit: true },
    'echo',
    ['hello', 'world'],
  )
  assert.equal(execWrapped.bin, 'sandbox-exec')
  assert.equal(execWrapped.args[0], '-p')
  assert.ok(execWrapped.args[1].includes('(version 1)'))
  assert.ok(execWrapped.args[1].includes('/tmp/w/.git'))
  assert.equal(execWrapped.args[2], 'echo')
  assert.equal(execWrapped.args[3], 'hello')
  assert.equal(execWrapped.args[4], 'world')

  // bwrap driver
  const bwrapWrapped = wrapCommand(
    'bwrap',
    {
      writable: ['/tmp/w'],
      tmpDir: '/tmp/t',
      cwd: '/workspace',
      env: { CUSTOM_VAR: 'val' },
      protectGit: true,
    },
    'node',
    ['-v'],
  )
  assert.equal(bwrapWrapped.bin, 'bwrap')
  assert.ok(bwrapWrapped.args.includes('--ro-bind'))
  assert.ok(bwrapWrapped.args.includes('--dev'))
  assert.ok(bwrapWrapped.args.includes('--proc'))
  assert.ok(bwrapWrapped.args.includes('/tmp/w'))
  assert.ok(bwrapWrapped.args.includes('--ro-bind-try'))
  assert.ok(bwrapWrapped.args.includes('/tmp/w/.git'))
  assert.ok(bwrapWrapped.args.includes('/tmp/t'))
  assert.ok(bwrapWrapped.args.includes('CUSTOM_VAR'))
  assert.ok(bwrapWrapped.args.includes('val'))
  assert.ok(bwrapWrapped.args.includes('--chdir'))
  assert.ok(bwrapWrapped.args.includes('/workspace'))
  assert.equal(bwrapWrapped.args.at(-2), 'node')
  assert.equal(bwrapWrapped.args.at(-1), '-v')

  // null driver
  const nullWrapped = wrapCommand(
    null,
    { writable: ['/tmp/w'], tmpDir: '/tmp/t' },
    'python',
    ['script.py'],
  )
  assert.equal(nullWrapped.bin, 'python')
  assert.deepEqual(nullWrapped.args, ['script.py'])

  // 3. detectSandboxDriver tests
  const detected = await detectSandboxDriver(true)
  if (process.platform === 'darwin') {
    assert.ok(detected === 'sandbox-exec' || detected === 'bwrap', 'detected a valid driver on darwin')
  }

  // 4. Live execution test if sandbox-exec is available
  if (detected === 'sandbox-exec') {
    const liveDir = mkdtempSync(join(tmpdir(), 'ws-sandbox-live-'))
    try {
      const allowedFile = join(liveDir, 'allowed.txt')
      const deniedDir = mkdtempSync(join(tmpdir(), 'ws-sandbox-denied-'))
      try {
        const deniedFile = join(deniedDir, 'denied.txt')

        const spec = wrapCommand('sandbox-exec', { writable: [liveDir], tmpDir: liveDir }, 'touch', [allowedFile])
        await run(spec.bin, spec.args, 5_000)
        assert.ok(existsSync(allowedFile), 'writing to allowed path succeeded in sandbox-exec')

        let deniedFailed = false
        try {
          const deniedSpec = wrapCommand('sandbox-exec', { writable: [liveDir], tmpDir: liveDir }, 'touch', [deniedFile])
          await run(deniedSpec.bin, deniedSpec.args, 5_000)
        } catch {
          deniedFailed = true
        }
        assert.ok(deniedFailed, 'writing to denied path failed in sandbox-exec')
      } finally {
        rmSync(deniedDir, { recursive: true, force: true })
      }
    } finally {
      rmSync(liveDir, { recursive: true, force: true })
    }
  }

  // 5. Driver override test
  setDriverOverride('bwrap')
  assert.equal(await detectSandboxDriver(), 'bwrap')
  setDriverOverride(null)
  assert.equal(await detectSandboxDriver(), null)
  setDriverOverride(undefined)
  assert.equal(await detectSandboxDriver(), detected)

  console.log('sandbox selfcheck: ok')
}
