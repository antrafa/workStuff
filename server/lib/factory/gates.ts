// Portões Mecânicos de Aceitação (Gates) determinísticos para a Fábrica.
// Inspirado no padrão "Agent Proposes, Code Disposes".
// Autoteste: node server/lib/factory/gates.ts --selfcheck

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { run } from '../run.ts'

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
    const status = await run('git', ['-C', worktreePath, 'status', '--porcelain']).catch(() => '')
    const diffNames = await run('git', ['-C', worktreePath, 'diff', baseBranch, '--name-only']).catch(() => '')
    
    const statusFiles = status.split('\n').map(l => l.slice(3).trim()).filter(Boolean)
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

// 3. Gate: Executa testes determinísticos do projeto via código TypeScript (não IA)
// 10 min: `mvn test` in a real Java project rarely fits the old 60s and a timeout reads as a failure
export async function gateTestsPass(worktreePath: string, timeoutMs = 10 * 60_000, signal?: AbortSignal): Promise<TestsGateResult> {
  const t0 = Date.now()

  // Detecta comando de teste baseado nos arquivos presentes
  let cmd: { bin: string; args: string[] } | null = null

  const pkgJsonPath = join(worktreePath, 'package.json')
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
      if (pkg.scripts?.test && !pkg.scripts.test.includes('no test specified')) {
        cmd = { bin: 'npm', args: ['test'] }
      }
    } catch {
      // ignora
    }
  } else if (existsSync(join(worktreePath, 'pom.xml'))) {
    cmd = { bin: 'mvn', args: ['test'] }
  } else if (existsSync(join(worktreePath, 'pytest.ini')) || existsSync(join(worktreePath, 'pyproject.toml'))) {
    cmd = { bin: 'pytest', args: [] }
  } else if (existsSync(join(worktreePath, 'go.mod'))) {
    cmd = { bin: 'go', args: ['test', './...'] }
  }

  if (!cmd) {
    return {
      passed: true,
      skipped: true,
      output: 'Nenhum script de teste automatizado detectado no repositório.',
      exitCode: 0,
      durationMs: Date.now() - t0,
    }
  }

  return new Promise(resolve => {
    let output = ''
    let settled = false
    const command = `${cmd.bin} ${cmd.args.join(' ')}`
    const child = spawn(cmd.bin, cmd.args, {
      cwd: worktreePath,
      shell: true,
      // Own process group so we can stop the shell AND the test runner it spawns
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
      resolve(result)
    }

    const timer = setTimeout(() => {
      killTree()
      finish({
        passed: false,
        command,
        output: output + '\n[Timeout após ' + Math.round(timeoutMs / 1000) + 's]',
        exitCode: -1,
        durationMs: Date.now() - t0,
        reason: 'Tempo limite de execução de testes excedido.',
      })
    }, timeoutMs)

    const onAbort = () => {
      killTree()
      finish({
        passed: false,
        command,
        output: output + '\n[Interrompido pelo usuário]',
        exitCode: -1,
        durationMs: Date.now() - t0,
        reason: 'Execução de testes interrompida pelo usuário.',
      })
    }
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout.on('data', chunk => {
      output += chunk.toString('utf-8')
    })
    child.stderr.on('data', chunk => {
      output += chunk.toString('utf-8')
    })

    child.on('error', err => {
      finish({
        passed: false,
        command,
        output: `${output}\n${err.message}`,
        exitCode: 1,
        durationMs: Date.now() - t0,
        reason: err.message,
      })
    })

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

    console.log('factory gates selfcheck: ok')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
