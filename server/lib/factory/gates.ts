// Portões Mecânicos de Aceitação (Gates) determinísticos para a Fábrica.
// Inspirado no padrão "Agent Proposes, Code Disposes".
// Autoteste: node server/lib/factory/gates.ts --selfcheck

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { run } from '../run.ts'
import { jail, withSandbox } from './runner.ts'
import { uncommittedFiles } from './worktree.ts'

export type DiffGateResult = {
  passed: boolean
  filesChanged: string[]
  reason?: string
}

export type ArtifactsGateResult = {
  passed: boolean
  missingFiles: string[]
  foundFiles: string[]
  reason?: string
}

export type TestsGateResult = {
  passed: boolean
  command?: string
  output: string
  exitCode: number
  durationMs: number
  skipped?: boolean
  reason?: string
}

// 1. Gate: Valida se há de fato arquivos alterados na worktree
export async function gateDiffNotEmpty(worktreePath: string, baseBranch = 'main'): Promise<DiffGateResult> {
  try {
    // uncommittedFiles leaves the dependency symlink out: it is always "new" and would pass the gate alone
    const statusFiles = await uncommittedFiles(worktreePath)
    const diffNames = await run('git', ['-C', worktreePath, 'diff', baseBranch, '--name-only']).catch(() => '')
    const diffFiles = diffNames.split('\n').map(l => l.trim()).filter(Boolean)
    const allFiles = Array.from(new Set([...statusFiles, ...diffFiles]))

    if (allFiles.length === 0) {
      return {
        passed: false,
        filesChanged: [],
        reason: 'Nenhuma alteração foi realizada nos arquivos do repositório.',
      }
    }

    return {
      passed: true,
      filesChanged: allFiles,
    }
  } catch (err) {
    return {
      passed: false,
      filesChanged: [],
      reason: `Falha ao inspecionar diff: ${(err as Error).message}`,
    }
  }
}

// 2. Gate: Valida se os arquivos declarados pelo agente existem no disco ou aparecem no diff
// (um arquivo apagado de propósito não existe mais, mas está no diff).
export function gateArtifactsExist(worktreePath: string, claimedFiles: string[], changedFiles: string[] = []): ArtifactsGateResult {
  const missingFiles: string[] = []
  const foundFiles: string[] = []

  for (const rel of claimedFiles) {
    // Strips only "./" and "/" prefixes: ".github/..." keeps its dot
    const clean = rel.trim().replace(/^(\.\/|\/)+/, '')
    if (!clean) continue
    if (existsSync(join(worktreePath, clean)) || changedFiles.includes(clean)) {
      foundFiles.push(clean)
    } else {
      missingFiles.push(clean)
    }
  }

  if (missingFiles.length > 0) {
    return {
      passed: false,
      missingFiles,
      foundFiles,
      reason: `Arquivos esperados não foram encontrados: ${missingFiles.join(', ')}`,
    }
  }

  return {
    passed: true,
    missingFiles: [],
    foundFiles,
  }
}

// 3. Gate: runs the project's verification (tests, or the task's own command) in code, not by an agent.
// The suite executes code the agent just wrote, so it runs in the same bwrap jail as the agent:
// only the worktree, a tmp dir and the build tool caches are writable. Without bwrap it does not run.
// 10 min: `mvn test` in a real Java project rarely fits less, and a timeout reads as a failure.
const BUILD_CACHES = ['.m2', '.npm', '.gradle', '.cache/go-build', 'go/pkg/mod', '.cache/pip'].map(d => join(homedir(), d))
const MAX_OUTPUT = 30_000

export function detectVerifyCommand(worktreePath: string): string | null {
  const pkgJsonPath = join(worktreePath, 'package.json')
  if (existsSync(pkgJsonPath)) {
    try {
      const test = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')).scripts?.test
      if (test && !test.includes('no test specified')) return 'npm test'
    } catch {
      // unreadable package.json: fall through to the other build files
    }
  }
  if (existsSync(join(worktreePath, 'pom.xml'))) return 'mvn -q test'
  if (existsSync(join(worktreePath, 'gradlew'))) return './gradlew test'
  if (existsSync(join(worktreePath, 'pytest.ini')) || existsSync(join(worktreePath, 'pyproject.toml'))) return 'pytest'
  if (existsSync(join(worktreePath, 'go.mod'))) return 'go test ./...'
  return null
}

export async function gateTestsPass(
  worktreePath: string,
  opts: { command?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<TestsGateResult> {
  const t0 = Date.now()
  const command = opts.command?.trim() || detectVerifyCommand(worktreePath)
  if (!command) {
    return { passed: true, skipped: true, output: 'Nenhum comando de verificação detectado no repositório.', exitCode: 0, durationMs: 0 }
  }
  return withSandbox([worktreePath, ...BUILD_CACHES], async sandbox => {
    if (!sandbox) {
      const reason = 'bwrap (bubblewrap) não está instalado: a suíte não roda fora do sandbox porque executa código escrito pelo agente.'
      return { passed: false, skipped: true, command, output: reason, exitCode: -1, durationMs: 0, reason }
    }
    return spawnVerify(jail(sandbox, worktreePath, 'sh', ['-c', command]), command, worktreePath, t0, opts)
  })
}

function spawnVerify(
  spec: { bin: string; args: string[] },
  command: string,
  worktreePath: string,
  t0: number,
  { timeoutMs = 10 * 60_000, signal }: { timeoutMs?: number; signal?: AbortSignal },
): Promise<TestsGateResult> {
  return new Promise(resolve => {
    let output = ''
    let settled = false
    const child = spawn(spec.bin, spec.args, {
      cwd: worktreePath,
      // Own process group so we can stop the jail AND the test runner it spawns
      detached: process.platform !== 'win32',
      env: { ...process.env, CI: 'true' },
    })

    const killTree = () => {
      try {
        if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM')
        else child.kill('SIGTERM')
      } catch {
        // already gone
      }
    }

    const finish = (result: TestsGateResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      // The tail carries the failure; the head of a long Maven log is download noise
      resolve({ ...result, output: result.output.length > MAX_OUTPUT ? `[...]\n${result.output.slice(-MAX_OUTPUT)}` : result.output })
    }
    const fail = (reason: string, extra: string) =>
      finish({ passed: false, command, output: output + extra, exitCode: -1, durationMs: Date.now() - t0, reason })

    const timer = setTimeout(() => {
      killTree()
      fail('Tempo limite de execução de testes excedido.', `\n[Timeout após ${Math.round(timeoutMs / 1000)}s]`)
    }, timeoutMs)

    const onAbort = () => {
      killTree()
      fail('Execução de testes interrompida pelo usuário.', '\n[Interrompido pelo usuário]')
    }
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout.on('data', chunk => (output += chunk.toString('utf-8')))
    child.stderr.on('data', chunk => (output += chunk.toString('utf-8')))
    child.on('error', err => fail(err.message, `\n${err.message}`))
    child.on('close', (code, sig) => {
      // code is null when the process was killed by a signal: that is never a pass
      const exitCode = code ?? -1
      finish({
        passed: code === 0,
        command,
        output: output.trim(),
        exitCode,
        durationMs: Date.now() - t0,
        reason: code === 0 ? undefined : sig ? `Testes encerrados pelo sinal ${sig}` : `Testes falharam com código ${exitCode}`,
      })
    })
  })
}

// 4. Gate: the Documenter may only touch documentation. Anything else it changed is thrown away.
const DOC_FILE = /(^|\/)(docs?|documentation)\/|\.(md|mdx|rst|adoc|txt)$|(^|\/)(README|CHANGELOG|CONTRIBUTING)[^/]*$/i
export const nonDocFiles = (files: string[]) => files.filter(f => !DOC_FILE.test(f))

// Autoteste
if (import.meta.main && process.argv.includes('--selfcheck')) {
  const tmp = mkdtempSync(join(tmpdir(), 'workstuff-gates-test-'))
  try {
    // 1. Teste de artifacts
    writeFileSync(join(tmp, 'app.ts'), 'export const a = 1')
    const artOk = gateArtifactsExist(tmp, ['app.ts'])
    assert.equal(artOk.passed, true)
    assert.deepEqual(artOk.foundFiles, ['app.ts'])

    mkdirSync(join(tmp, '.github'))
    writeFileSync(join(tmp, '.github', 'ci.yml'), 'on: push')
    assert.equal(gateArtifactsExist(tmp, ['./.github/ci.yml', '/app.ts']).passed, true, 'ponto inicial preservado')
    assert.equal(gateArtifactsExist(tmp, ['old.ts'], ['old.ts']).passed, true, 'arquivo apagado que está no diff passa')

    const artFail = gateArtifactsExist(tmp, ['app.ts', 'missing.ts'])
    assert.equal(artFail.passed, false)
    assert.deepEqual(artFail.missingFiles, ['missing.ts'])

    // 2. Teste de testes skip
    const testSkip = await gateTestsPass(tmp)
    assert.equal(testSkip.passed, true)
    assert.equal(testSkip.skipped, true)

    writeFileSync(join(tmp, 'pom.xml'), '<project/>')
    assert.equal(detectVerifyCommand(tmp), 'mvn -q test')
    rmSync(join(tmp, 'pom.xml'))

    // Custom command runs jailed: writes inside the worktree work, outside are refused
    const outside = join(homedir(), `.workstuff-gate-escape-${process.pid}`)
    const jailed = await gateTestsPass(tmp, { command: `touch inside.txt && touch ${outside}` })
    if (!jailed.skipped) {
      assert.ok(existsSync(join(tmp, 'inside.txt')), 'escreve na worktree')
      assert.equal(jailed.passed, false, 'escrita fora da worktree falha')
      assert.ok(!existsSync(outside), 'nada escapou do sandbox')
    }
    const failing = await gateTestsPass(tmp, { command: 'exit 3' })
    if (!failing.skipped) assert.equal(failing.exitCode, 3)

    assert.deepEqual(nonDocFiles(['README.md', 'docs/api.yaml', 'src/a.ts', 'CHANGELOG']), ['src/a.ts'])

    console.log('factory gates selfcheck: ok')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
