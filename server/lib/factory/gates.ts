// Portões Mecânicos de Aceitação (Gates) determinísticos para a Fábrica.
// Inspirado em "Agent Proposes, Code Disposes" do Super Simple Software Factory.
// Autoteste: node server/lib/factory/gates.ts --selfcheck

import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

// 2. Gate: Valida se os arquivos declarados pelo agente realmente existem fisicamente no disco
export function gateArtifactsExist(worktreePath: string, claimedFiles: string[]): ArtifactsGateResult {
  const missingFiles: string[] = []
  const foundFiles: string[] = []

  for (const rel of claimedFiles) {
    const clean = rel.trim().replace(/^[./\\]+/, '')
    if (!clean) continue
    const full = join(worktreePath, clean)
    if (existsSync(full)) {
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
export async function gateTestsPass(worktreePath: string, timeoutMs = 60_000): Promise<TestsGateResult> {
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
    const child = spawn(cmd.bin, cmd.args, {
      cwd: worktreePath,
      shell: true,
      env: { ...process.env, CI: 'true' },
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({
        passed: false,
        command: `${cmd!.bin} ${cmd!.args.join(' ')}`,
        output: output + '\n[Timeout após ' + Math.round(timeoutMs / 1000) + 's]',
        exitCode: -1,
        durationMs: Date.now() - t0,
        reason: 'Tempo limite de execução de testes excedido.',
      })
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      output += chunk.toString('utf-8')
    })
    child.stderr.on('data', chunk => {
      output += chunk.toString('utf-8')
    })

    child.on('error', err => {
      clearTimeout(timer)
      resolve({
        passed: false,
        command: `${cmd!.bin} ${cmd!.args.join(' ')}`,
        output: `${output}\n${err.message}`,
        exitCode: 1,
        durationMs: Date.now() - t0,
        reason: err.message,
      })
    })

    child.on('close', code => {
      clearTimeout(timer)
      const exitCode = code ?? 0
      resolve({
        passed: exitCode === 0,
        command: `${cmd!.bin} ${cmd!.args.join(' ')}`,
        output: output.trim(),
        exitCode,
        durationMs: Date.now() - t0,
        reason: exitCode !== 0 ? `Testes falharam com código ${exitCode}` : undefined,
      })
    })
  })
}

// Autoteste
if (process.argv.includes('--selfcheck')) {
  const tmp = mkdtempSync(join(tmpdir(), 'workstuff-gates-test-'))
  try {
    // 1. Teste de artifacts
    writeFileSync(join(tmp, 'app.ts'), 'export const a = 1')
    const artOk = gateArtifactsExist(tmp, ['app.ts'])
    assert.equal(artOk.passed, true)
    assert.deepEqual(artOk.foundFiles, ['app.ts'])

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
