// Portões Mecânicos de Aceitação (Gates) determinísticos para a Fábrica.
// Inspirado no padrão "Agent Proposes, Code Disposes".
// Autoteste: node server/lib/factory/gates.ts --selfcheck

import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { run } from '../run.ts'
import { jail, withSandbox } from './runner.ts'
import { GIT_NO_HOOKS, uncommittedFiles } from './worktree.ts'
import { TEST_FILE, type BlastRadiusReport, type CriterionCoverage, type CriterionTests, type FileBlastRadius, type VerifyStep } from './types.ts'
import { say } from '../i18n.ts'

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
  // Every step joined with &&, for display; each one ran on its own
  command?: string
  steps?: VerifyStep[]
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
    const diffNames = await run('git', [...GIT_NO_HOOKS, '-C', worktreePath, 'diff', '--name-only', '--end-of-options', baseBranch]).catch(() => '')
    const diffFiles = diffNames.split('\n').map(l => l.trim()).filter(Boolean)
    const allFiles = Array.from(new Set([...statusFiles, ...diffFiles]))

    if (allFiles.length === 0) {
      return {
        passed: false,
        filesChanged: [],
        reason: say({ en: 'No file in the repository was changed.', pt: 'Nenhuma alteração foi realizada nos arquivos do repositório.' }),
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
      reason: say({ en: `Failed to inspect the diff: ${(err as Error).message}`, pt: `Falha ao inspecionar diff: ${(err as Error).message}` }),
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
      reason: say({ en: `Expected files were not found: ${missingFiles.join(', ')}`, pt: `Arquivos esperados não foram encontrados: ${missingFiles.join(', ')}` }),
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
const MAX_OUTPUT = 30_000

// Maven and Gradle caches are tens of GB, so they stay shared, but only the cache folders are writable:
// ~/.m2/settings.xml, ~/.gradle/init.d and gradle.properties run code in the user's next build, outside
// the jail. npm, Go and pip get a throwaway cache in the jail tmp: ~/.npm/_npx and the Go build
// cache also feed later runs, and rebuilding them is cheap.
// ponytail: an agent can still swap a jar in the shared caches; per-task Maven repo with
// maven.repo.local.tail (Maven 3.9+) and GRADLE_RO_DEP_CACHE if that matters.
export function buildCacheDirs(home = homedir()): string[] {
  const gradle = join(home, '.gradle')
  const gradleDirs = existsSync(gradle)
    ? readdirSync(gradle, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== 'init.d').map(e => join(gradle, e.name))
    : []
  return [join(home, '.m2', 'repository'), join(home, '.m2', 'wrapper'), ...gradleDirs]
}

const throwawayCaches = (tmpDir: string): Record<string, string> => ({
  npm_config_cache: join(tmpDir, 'npm'),
  GOCACHE: join(tmpDir, 'go-build'),
  GOMODCACHE: join(tmpDir, 'go-mod'),
  PIP_CACHE_DIR: join(tmpDir, 'pip'),
})

// Every check the project has, not just the first one found: `npm test` passing says nothing about
// lint, typecheck or build. Run in this order, cheapest feedback first.
const NPM_STEPS = ['lint', 'typecheck', 'test', 'check', 'build']

export function detectVerifyCommands(worktreePath: string): string[] {
  const pkgJsonPath = join(worktreePath, 'package.json')
  if (existsSync(pkgJsonPath)) {
    try {
      const scripts = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')).scripts ?? {}
      const steps = NPM_STEPS.filter(name => scripts[name] && !String(scripts[name]).includes('no test specified'))
      if (steps.length) return steps.map(name => (name === 'test' ? 'npm test' : `npm run ${name}`))
    } catch {
      // unreadable package.json: fall through to the other build files
    }
  }
  // verify runs tests plus the plugins bound to the build (checkstyle, spotbugs); gradle build includes check
  if (existsSync(join(worktreePath, 'pom.xml'))) return ['mvn -q verify']
  if (existsSync(join(worktreePath, 'gradlew'))) return ['./gradlew build']
  if (existsSync(join(worktreePath, 'pytest.ini')) || existsSync(join(worktreePath, 'pyproject.toml'))) return ['pytest']
  if (existsSync(join(worktreePath, 'go.mod'))) return ['go vet ./...', 'go test ./...']
  return []
}

// The task's own command replaces the detected ones; the smoke command always runs last.
// Nothing to run is "not verified", never a pass. Stops at the first failing step: its output is
// what the Implementer needs, and the next steps would mostly repeat it.
export async function gateTestsPass(
  worktreePath: string,
  opts: { command?: string; smokeCommand?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<TestsGateResult> {
  const own = opts.command?.trim()
  const commands = [...(own ? [own] : detectVerifyCommands(worktreePath)), ...(opts.smokeCommand?.trim() ? [opts.smokeCommand.trim()] : [])]
  if (commands.length === 0) {
    const reason = say({ en: 'No verification command detected in the repository: nothing was verified.', pt: 'Nenhum comando de verificação detectado no repositório: nada foi verificado.' })
    return { passed: false, skipped: true, output: reason, exitCode: -1, durationMs: 0, reason }
  }
  const command = commands.join(' && ')
  const t0 = Date.now()
  const steps: VerifyStep[] = []
  const outputs: string[] = []
  for (const step of commands) {
    const result = await runJailed(worktreePath, 'sh', ['-c', step], opts)
    if (result.skipped) return { ...result, command }
    steps.push({ command: step, passed: result.passed, exitCode: result.exitCode, durationMs: result.durationMs })
    outputs.push(`$ ${step}\n${result.output}`)
    if (!result.passed) {
      return { ...result, command, steps, output: clip(outputs.join('\n\n')), durationMs: Date.now() - t0, reason: `${step}: ${result.reason}` }
    }
  }
  return { passed: true, command, steps, output: clip(outputs.join('\n\n')), exitCode: 0, durationMs: Date.now() - t0 }
}

// The tail carries the failure; the head of a long Maven log is download noise
const clip = (output: string) => (output.length > MAX_OUTPUT ? `[...]\n${output.slice(-MAX_OUTPUT)}` : output)

// Runs one program on the worktree inside the jail, with the build caches writable and a throwaway
// HOME for tools that keep settings there. Without bwrap it does not run: it executes agent code.
export async function runJailed(
  worktreePath: string,
  bin: string,
  args: string[],
  opts: { timeoutMs?: number; signal?: AbortSignal; env?: Record<string, string> } = {},
): Promise<TestsGateResult> {
  const t0 = Date.now()
  const command = [bin, ...args].join(' ')
  return withSandbox([worktreePath, ...buildCacheDirs()], async sandbox => {
    if (!sandbox) {
      const reason = say({ en: 'bwrap (bubblewrap) is not installed: the suite does not run outside the sandbox because it executes code the agent wrote.', pt: 'bwrap (bubblewrap) não está instalado: a suíte não roda fora do sandbox porque executa código escrito pelo agente.' })
      return { passed: false, skipped: true, command, output: reason, exitCode: -1, durationMs: 0, reason }
    }
    const env = { ...throwawayCaches(sandbox.tmpDir), ...opts.env }
    const jailed = jail({ ...sandbox, env }, worktreePath, bin, args)
    return spawnVerify(jailed, command, worktreePath, t0, opts)
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
      resolve({ ...result, output: clip(result.output) })
    }
    const fail = (reason: string, extra: string) =>
      finish({ passed: false, command, output: output + extra, exitCode: -1, durationMs: Date.now() - t0, reason })

    const timer = setTimeout(() => {
      killTree()
      fail(say({ en: 'Test run timed out.', pt: 'Tempo limite de execução de testes excedido.' }), `\n[Timeout ${Math.round(timeoutMs / 1000)}s]`)
    }, timeoutMs)

    const onAbort = () => {
      killTree()
      fail(say({ en: 'Test run stopped by the user.', pt: 'Execução de testes interrompida pelo usuário.' }), say({ en: '\n[Stopped by the user]', pt: '\n[Interrompido pelo usuário]' }))
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
        reason: code === 0 ? undefined : sig ? say({ en: `Tests ended by signal ${sig}`, pt: `Testes encerrados pelo sinal ${sig}` }) : say({ en: `Tests failed with exit code ${exitCode}`, pt: `Testes falharam com código ${exitCode}` }),
      })
    })
  })
}

// 4. Gate: the Documenter may only touch documentation. Anything else it changed is thrown away.
const DOC_FILE = /(^|\/)(docs?|documentation)\/|\.(md|mdx|rst|adoc|txt)$|(^|\/)(README|CHANGELOG|CONTRIBUTING)[^/]*$/i
export const nonDocFiles = (files: string[]) => files.filter(f => !DOC_FILE.test(f))

// Tracked documentation that names one of these files by path: what the Documenter may need to update.
export async function docsCiting(worktreePath: string, files: string[]): Promise<string[]> {
  if (files.length === 0) return []
  // git grep exits 1 when nothing matches
  const out = await run('git', [...GIT_NO_HOOKS, '-C', worktreePath, 'grep', '-l', '-F', ...files.flatMap(f => ['-e', f])]).catch(() => '')
  return out.split('\n').filter(f => f && DOC_FILE.test(f) && !files.includes(f))
}

// 5. Test files (TEST_FILE in types.ts). A miss only asks for a human look (see readiness.ts).
export const nonTestFiles = (files: string[]) => files.filter(f => !TEST_FILE.test(f))

// 6. Gate: the Tester's mapping of criteria to tests, checked against the disk. A test file it names
// must exist; a criterion it left out is "missing", one it explains is "untestable".
export function checkCriteriaCoverage(worktreePath: string, criteriaIds: string[], claimed: CriterionTests[]): CriterionCoverage[] {
  return criteriaIds.map(id => {
    const entry = claimed.find(c => c.id.toUpperCase() === id)
    if (!entry) return { id, status: 'missing', tests: [] }
    const files = entry.tests.map(t => t.split('::')[0].trim().replace(/^(\.\/|\/)+/, '')).filter(Boolean)
    const absent = files.filter(f => !existsSync(join(worktreePath, f)))
    if (files.length && absent.length === 0) return { id, status: 'tested', tests: entry.tests }
    if (entry.untestable && files.length === 0) return { id, status: 'untestable', tests: [], note: entry.untestable }
    const note = absent.length ? say({ en: `test file not found: ${absent.join(', ')}`, pt: `arquivo de teste não encontrado: ${absent.join(', ')}` }) : undefined
    return { id, status: 'missing', tests: entry.tests, note }
  })
}

// 7. Gate: Quality floor (Constraint-Driven Development).
// Bars suppression of types/linting, skipped tests, or disabled assertions in new code.
export type DegradationViolation = {
  file: string
  line: number
  rule: string
  snippet: string
}

export type QualityDegradationResult = {
  passed: boolean
  violations: DegradationViolation[]
  reason?: string
}

// Directives only count in comment position and test calls only at the start of a statement, with
// one-line string literals blanked first: text that names them (and `model.fit(`) does not trip the gate.
// ponytail: line heuristic, no parser; a directive inside a multi-line string still matches.
const STRING_LITERAL = /(["'`])(?:\\.|(?!\1).)*\1/g
const DEGRADATION_RULES: Array<{ rule: string; pattern: RegExp }> = [
  { rule: 'ts-ignore', pattern: /(^|\s)(\/\/|\/\*)\s*@ts-ignore\b/ },
  { rule: 'ts-nocheck', pattern: /(^|\s)(\/\/|\/\*)\s*@ts-nocheck\b/ },
  { rule: 'eslint-disable', pattern: /(^|\s)(\/\/|\/\*)\s*eslint-disable/ },
  { rule: 'test-skip', pattern: /^\s*((it|test|describe|context)\.skip|xit|xtest|xdescribe|fit|fdescribe)\s*\(|^\s*@(Disabled|Ignore)\b|^\s*@pytest\.mark\.skip\b/ },
  { rule: 'suppress-warnings', pattern: /^\s*@SuppressWarnings\b/ },
  { rule: 'python-type-ignore', pattern: /(^|\s)#\s*type:\s*ignore\b/ },
  { rule: 'python-noqa', pattern: /(^|\s)#\s*noqa\b/ },
]

export function detectQualityDegradation(diffText: string): DegradationViolation[] {
  const violations: DegradationViolation[] = []
  if (!diffText) return violations

  const lines = diffText.split('\n')
  let currentFile = ''
  let currentLine = 0
  let isDoc = false

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const match = line.match(/^diff --git a\/.+ b\/(.+)$/)
      currentFile = match ? match[1].trim() : ''
      isDoc = currentFile ? DOC_FILE.test(currentFile) : false
      continue
    }
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6).trim()
      isDoc = currentFile ? DOC_FILE.test(currentFile) : false
      continue
    }
    if (line.startsWith('@@ ')) {
      const match = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
      if (match) {
        currentLine = parseInt(match[1], 10) - 1
      }
      continue
    }

    if (isDoc) continue

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentLine++
      const content = line.slice(1)
      const code = content.replace(STRING_LITERAL, '""')
      for (const { rule, pattern } of DEGRADATION_RULES) {
        if (pattern.test(code)) {
          violations.push({
            file: currentFile,
            line: currentLine,
            rule,
            snippet: content.trim(),
          })
          break
        }
      }
    } else if (line.startsWith(' ')) {
      currentLine++
    }
  }

  return violations
}

export async function gateNoQualityDegradation(
  worktreePath: string,
  baseBranch = 'main',
): Promise<QualityDegradationResult> {
  try {
    // Against the fork point, not the base tip: what the base changed since then is not the agent's
    const forkPoint = (await run('git', [...GIT_NO_HOOKS, '-C', worktreePath, 'merge-base', '--end-of-options', baseBranch, 'HEAD'])).trim()
    let diff = await run('git', [...GIT_NO_HOOKS, '-C', worktreePath, 'diff', '-U0', '--end-of-options', forkPoint])

    // Also inspect untracked files not yet in git diff
    const uncommitted = await uncommittedFiles(worktreePath)
    for (const file of uncommitted) {
      if (DOC_FILE.test(file)) continue
      const tracked = await run('git', [...GIT_NO_HOOKS, '-C', worktreePath, 'ls-files', '--error-unmatch', '--', file]).then(() => true, () => false)
      if (!tracked) {
        const fullPath = join(worktreePath, file)
        if (existsSync(fullPath) && !lstatSync(fullPath).isDirectory()) {
          const content = readFileSync(fullPath, 'utf-8')
          const fileLines = content.split('\n')
          const syntheticDiff = `\ndiff --git a/${file} b/${file}\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${fileLines.length} @@\n` + fileLines.map(l => '+' + l).join('\n')
          diff += syntheticDiff
        }
      }
    }

    const violations = detectQualityDegradation(diff)
    if (violations.length === 0) {
      return { passed: true, violations: [] }
    }
    const details = violations.map(v => `${v.file}:${v.line} (${v.rule}: "${v.snippet}")`).join(', ')
    return {
      passed: false,
      violations,
      reason: say({
        en: `Quality floor violated: ${details}`,
        pt: `Piso de qualidade violado: ${details}`,
      }),
    }
  } catch (err) {
    return {
      passed: false,
      violations: [],
      reason: say({
        en: `Failed to inspect quality floor: ${(err as Error).message}`,
        pt: `Falha ao inspecionar piso de qualidade: ${(err as Error).message}`,
      }),
    }
  }
}

// 8. Gate / Analisador: Blast Radius (Raio de Impacto de Código).
// Mapeia quais arquivos fora do diff dependem ou importam os arquivos alterados.
export async function computeBlastRadius(
  worktreePath: string,
  changedFiles: string[],
): Promise<BlastRadiusReport> {
  const codeFiles = changedFiles.filter(f => !DOC_FILE.test(f) && !TEST_FILE.test(f))
  if (codeFiles.length === 0) {
    return { totalDependents: 0, files: [] }
  }

  const results: FileBlastRadius[] = []
  const allDependents = new Set<string>()

  for (const file of codeFiles) {
    const base = basename(file).replace(/\.[a-zA-Z0-9_-]+$/, '')
    if (!base || base.length < 2) continue

    // A quoted path ending in the file ('./math', "../lib/run.ts") or a dotted module (Python, Java).
    // The basename is escaped: `[id].tsx` is a file name, not a character class.
    const name = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = `(import|from|require).*["'/]${name}(\\.[A-Za-z0-9_-]+)?["']|^[[:space:]]*(import|from)[[:space:]]+([A-Za-z0-9_.]*\\.)?${name}([[:space:];]|$)`
    // git grep exits 1 when nothing matches
    const out = await run('git', [...GIT_NO_HOOKS, '-C', worktreePath, 'grep', '-l', '-E', '-e', pattern]).catch(() => '')
    const matched = out.split('\n').map(l => l.trim()).filter(Boolean)

    const dependents: string[] = []
    const testFiles: string[] = []

    for (const match of matched) {
      if (match === file || changedFiles.includes(match) || DOC_FILE.test(match)) continue
      if (TEST_FILE.test(match)) {
        testFiles.push(match)
      } else {
        dependents.push(match)
        allDependents.add(match)
      }
    }

    if (dependents.length > 0 || testFiles.length > 0) {
      results.push({ file, dependents, testFiles })
    }
  }

  return {
    totalDependents: allDependents.size,
    files: results,
  }
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

    // 2. Nada para rodar não é aprovação
    const testSkip = await gateTestsPass(tmp)
    assert.equal(testSkip.passed, false, 'sem comando, nada foi verificado')
    assert.equal(testSkip.skipped, true)

    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ scripts: { test: 'echo "Error: no test specified"', typecheck: 'tsc', build: 'vite build' } }))
    assert.deepEqual(detectVerifyCommands(tmp), ['npm run typecheck', 'npm run build'], 'teste vazio fora, o resto entra')
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ scripts: { build: 'b', lint: 'l', test: 't', check: 'c', typecheck: 'tc' } }))
    assert.deepEqual(detectVerifyCommands(tmp), ['npm run lint', 'npm run typecheck', 'npm test', 'npm run check', 'npm run build'], 'todas as etapas, na ordem')
    rmSync(join(tmp, 'package.json'))

    writeFileSync(join(tmp, 'pom.xml'), '<project/>')
    assert.deepEqual(detectVerifyCommands(tmp), ['mvn -q verify'])
    rmSync(join(tmp, 'pom.xml'))

    // Etapas em sequência, parando na primeira que falha; o smoke roda por último
    const multi = await gateTestsPass(tmp, { command: 'echo um', smokeCommand: 'exit 4' })
    if (!multi.skipped) {
      assert.equal(multi.passed, false)
      assert.deepEqual(multi.steps?.map(s => [s.command, s.passed]), [['echo um', true], ['exit 4', false]], 'smoke depois da verificação')
      assert.match(multi.output, /\$ echo um\num/)
    }

    // Custom command runs jailed: writes inside the worktree work, outside are refused
    const outside = join(homedir(), `.workstuff-gate-escape-${process.pid}`)
    const jailed = await gateTestsPass(tmp, { command: `touch inside.txt && touch ${outside}` })
    if (!jailed.skipped) {
      assert.ok(existsSync(join(tmp, 'inside.txt')), 'escreve na worktree')
      assert.equal(jailed.passed, false, 'escrita fora da worktree falha')
      assert.ok(!existsSync(outside), 'nada escapou do sandbox')
    }
    const npmCache = await gateTestsPass(tmp, { command: 'test "$npm_config_cache" != "$HOME/.npm" && case "$npm_config_cache" in "$TMPDIR"/*) exit 0;; esac; exit 1' })
    if (!npmCache.skipped) assert.equal(npmCache.passed, true, 'cache do npm descartável, dentro do tmp do jail')
    const failing = await gateTestsPass(tmp, { command: 'exit 3' })
    if (!failing.skipped) assert.equal(failing.exitCode, 3)

    assert.deepEqual(nonDocFiles(['README.md', 'docs/api.yaml', 'src/a.ts', 'CHANGELOG']), ['src/a.ts'])
    assert.deepEqual(nonTestFiles(['src/a.test.ts', 'tests/x.py', 'pkg/a_test.go', 'src/FooTest.java', 'scripts/check-nav.ts', 'src/a.ts']), ['src/a.ts'])

    writeFileSync(join(tmp, 'a.test.ts'), 'x')
    assert.deepEqual(checkCriteriaCoverage(tmp, ['CA1', 'CA2', 'CA3', 'CA4'], [
      { id: 'ca1', tests: ['a.test.ts::soma dois números'] },
      { id: 'CA2', tests: [], untestable: 'texto de ajuda' },
      { id: 'CA3', tests: ['sumiu.test.ts'] },
    ]).map(c => c.status), ['tested', 'untestable', 'missing', 'missing'], 'arquivo citado precisa existir; critério omitido falta')

    const repo = join(tmp, 'docs-repo')
    mkdirSync(repo)
    await run('git', ['-C', repo, 'init', '-q', '-b', 'main'])
    await run('git', ['-C', repo, 'config', 'user.name', 'Test'])
    await run('git', ['-C', repo, 'config', 'user.email', 'test@test.com'])
    writeFileSync(join(repo, 'README.md'), 'Veja src/nav.ts\n')
    writeFileSync(join(repo, 'other.ts'), 'src/nav.ts\n')
    await run('git', ['-C', repo, 'add', '.'])
    await run('git', ['-C', repo, 'commit', '-m', 'init', '-q'])
    assert.deepEqual(await docsCiting(repo, ['src/nav.ts']), ['README.md'], 'só documentação conta, código que cita não')
    assert.deepEqual(await docsCiting(repo, ['src/outro.ts']), [], 'nenhuma doc cita: Documenter pulado')

    const fakeHome = join(tmp, 'home')
    mkdirSync(join(fakeHome, '.gradle', 'caches'), { recursive: true })
    mkdirSync(join(fakeHome, '.gradle', 'init.d'))
    writeFileSync(join(fakeHome, '.gradle', 'gradle.properties'), '')
    assert.deepEqual(buildCacheDirs(fakeHome), [join(fakeHome, '.m2', 'repository'), join(fakeHome, '.m2', 'wrapper'), join(fakeHome, '.gradle', 'caches')],
      'só pastas de cache graváveis: init.d, gradle.properties e settings.xml ficam de fora')

    // 7. Teste de detecção de degradação de qualidade (Anti-slop / Constraint-driven)
    const cleanDiff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 export const a = 1
+export const b = 2
`
    assert.deepEqual(detectQualityDegradation(cleanDiff), [], 'diff limpo não tem violações')

    const badDiff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +10,6 @@
 context line
+// @ts-ignore: bypass type error
+/* eslint-disable-next-line */
+it.skip("should work", () => {})
-old deleted line
diff --git a/src/Service.java b/src/Service.java
--- a/src/Service.java
+++ b/src/Service.java
@@ -5,1 +5,2 @@
+@SuppressWarnings("unchecked")
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,2 +1,3 @@
+# Documentação com @ts-ignore explicativo
`
    const violations = detectQualityDegradation(badDiff)
    assert.equal(violations.length, 4, 'detecta exatamente as 4 violações em código, ignorando markdown e linhas antigas')
    assert.equal(violations[0].rule, 'ts-ignore')
    assert.equal(violations[0].file, 'src/app.ts')
    assert.equal(violations[0].line, 11)
    assert.equal(violations[1].rule, 'eslint-disable')
    assert.equal(violations[2].rule, 'test-skip')
    assert.equal(violations[3].rule, 'suppress-warnings')
    assert.equal(violations[3].file, 'src/Service.java')

    const lookalikes = `diff --git a/src/train.py b/src/train.py
+++ b/src/train.py
@@ -1,0 +1,4 @@
+model.fit(X, y)
+prompt = "NUNCA use xit(), // @ts-ignore nem eslint-disable"
+xit('pula', () => {})
`
    const lookalikeHits = detectQualityDegradation(lookalikes)
    assert.deepEqual(lookalikeHits.map(v => v.line), [3], 'chamada de método e texto citando as diretivas não contam; xit( no início conta')

    // Teste de gateNoQualityDegradation no repositório de teste
    writeFileSync(join(repo, 'bad.ts'), '// @ts-ignore\nconst err = 1\n')
    const degResultUntracked = await gateNoQualityDegradation(repo, 'HEAD')
    assert.equal(degResultUntracked.passed, false, 'gate rejeita arquivo untracked com @ts-ignore')
    assert.match(degResultUntracked.reason!, /ts-ignore/)

    await run('git', ['-C', repo, 'add', '.'])
    const degResult = await gateNoQualityDegradation(repo, 'HEAD')
    assert.equal(degResult.passed, false, 'gate rejeita repositório com @ts-ignore')
    assert.match(degResult.reason!, /ts-ignore/)

    // A base que andou depois do fork não é culpa do agente
    await run('git', ['-C', repo, 'commit', '-qam', 'bad'])
    await run('git', ['-C', repo, 'branch', 'base-fork'])
    writeFileSync(join(repo, 'bad.ts'), 'const err = 1\n')
    await run('git', ['-C', repo, 'commit', '-qam', 'base remove a supressão'])
    await run('git', ['-C', repo, 'checkout', '-q', '-b', 'task', 'base-fork'])
    writeFileSync(join(repo, 'ok.ts'), 'export const ok = 1\n')
    await run('git', ['-C', repo, 'add', '.'])
    await run('git', ['-C', repo, 'commit', '-qm', 'task'])
    assert.equal((await gateNoQualityDegradation(repo, 'main')).passed, true, 'linha mudada só na base não reprova a tarefa')
    assert.equal((await gateNoQualityDegradation(repo, 'nao-existe')).passed, false, 'base inexistente reprova em vez de passar sem olhar')
    await run('git', ['-C', repo, 'checkout', '-q', 'main'])

    // 8. Teste de computeBlastRadius (Raio de impacto de arquivos alterados)
    writeFileSync(join(repo, 'math.ts'), 'export const sum = (a: number, b: number) => a + b\n')
    writeFileSync(join(repo, 'calc.ts'), 'import { sum } from "./math.ts"\nexport const double = (x: number) => sum(x, x)\n')
    writeFileSync(join(repo, 'math.test.ts'), 'import { sum } from "./math.ts"\n')
    await run('git', ['-C', repo, 'add', '.'])
    await run('git', ['-C', repo, 'commit', '-m', 'add math modules', '-q'])

    const br = await computeBlastRadius(repo, ['math.ts'])
    assert.equal(br.totalDependents, 1, 'calc.ts é o único dependente de produção fora do diff')
    assert.deepEqual(br.files[0].dependents, ['calc.ts'])
    assert.deepEqual(br.files[0].testFiles, ['math.test.ts'])

    writeFileSync(join(repo, 'run.ts'), 'export const run = () => 1\n')
    writeFileSync(join(repo, 'cli.ts'), 'import { x } from "./other"\nrun()\n')
    writeFileSync(join(repo, '[id].tsx'), 'export default 1\n')
    writeFileSync(join(repo, 'page.ts'), 'import Page from "./[id].tsx"\n')
    writeFileSync(join(repo, 'util.py'), 'from pkg.run import go\n')
    await run('git', ['-C', repo, 'add', '.'])
    await run('git', ['-C', repo, 'commit', '-qm', 'more modules'])
    assert.deepEqual((await computeBlastRadius(repo, ['run.ts'])).files[0].dependents, ['util.py'], 'a palavra solta numa linha com import não conta; módulo pontilhado conta')
    assert.deepEqual((await computeBlastRadius(repo, ['[id].tsx'])).files[0].dependents, ['page.ts'], 'colchetes no nome do arquivo são literais')

    console.log('factory gates selfcheck: ok')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
