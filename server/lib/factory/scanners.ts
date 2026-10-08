// Security tools run on the diff before the Security agent: their output is evidence it reads,
// and a secret found by gitleaks blocks by itself. Only what is installed on this machine runs;
// a missing tool is reported with how to install it, never installed for the user.
// Autoteste: node server/lib/factory/scanners.ts --selfcheck

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { which } from '../run.ts'
import { runJailed } from './gates.ts'
import type { ScanToolResult, SecurityFinding } from './types.ts'
import { say } from '../i18n.ts'

type Scanner = {
  tool: string
  bin: string
  install: string
  // Arguments for this diff, or null when the tool has nothing to look at
  args: (base: string, files: string[], worktreePath: string) => string[] | null
}

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py|java|kt|go|rb|php|cs|scala|sh|ya?ml|tf)$/i
const DEPENDENCY_FILE = /(^|\/)package(-lock)?\.json$/

export const SCANNERS: Scanner[] = [
  {
    tool: 'gitleaks',
    bin: 'gitleaks',
    install: 'https://github.com/gitleaks/gitleaks#installing',
    // Only the commits of this branch: an old leak in the base is not this task's
    args: base => ['detect', '--no-banner', '--redact', '--source', '.', '--log-opts', `${base}..HEAD`],
  },
  {
    tool: 'semgrep',
    bin: 'semgrep',
    install: 'pipx install semgrep',
    args: (_base, files, wt) => {
      const code = files.filter(f => CODE_FILE.test(f) && existsSync(join(wt, f)))
      return code.length ? ['scan', '--config', 'p/default', '--metrics=off', '--error', '--quiet', '--disable-version-check', ...code] : null
    },
  },
  {
    tool: 'npm audit',
    bin: 'npm',
    install: 'https://nodejs.org',
    args: (_base, files, wt) => (files.some(f => DEPENDENCY_FILE.test(f)) && existsSync(join(wt, 'package-lock.json')) ? ['audit', '--audit-level=high', '--omit=dev'] : null),
  },
]

// The three tools exit 1 when they find something and above 1 when they could not run
export async function runSecurityScans(
  worktreePath: string,
  base: string,
  files: string[],
  signal?: AbortSignal,
  scanners = SCANNERS,
): Promise<ScanToolResult[]> {
  const results: ScanToolResult[] = []
  for (const s of scanners) {
    const args = s.args(base, files, worktreePath)
    if (!args) {
      results.push({ tool: s.tool, status: 'skipped' })
      continue
    }
    if (!(await which(s.bin))) {
      results.push({ tool: s.tool, status: 'missing', install: s.install })
      continue
    }
    const r = await runJailed(worktreePath, s.bin, args, { timeoutMs: 5 * 60_000, signal })
    const status = r.skipped ? 'error' : r.exitCode === 0 ? 'passed' : r.exitCode === 1 ? 'failed' : 'error'
    results.push({ tool: s.tool, status, output: r.output.slice(-6000) })
  }
  return results
}

// A secret gitleaks found is certain enough to block without the agent's opinion
export function scanFindings(results: ScanToolResult[]): SecurityFinding[] {
  return results
    .filter(r => r.tool === 'gitleaks' && r.status === 'failed')
    .map(r => ({
      severity: 'critical',
      confidence: 100,
      agentId: 'security',
      description: say({ en: `gitleaks found a secret in the branch commits. Remove it and rotate it.\n${r.output ?? ''}`, pt: `O gitleaks encontrou um segredo nos commits da branch. Remova e troque o segredo.\n${r.output ?? ''}` }).slice(0, 2000),
    }))
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const tmp = mkdtempSync(join(tmpdir(), 'workstuff-scan-test-'))
  try {
    writeFileSync(join(tmp, 'a.ts'), 'x')
    const fake = (tool: string, bin: string, code: number): Scanner => ({ tool, bin, install: 'x', args: () => ['-c', `exit ${code}`] })
    const results = await runSecurityScans(tmp, 'main', ['a.ts'], undefined, [
      fake('limpo', 'sh', 0),
      fake('achou', 'sh', 1),
      fake('quebrou', 'sh', 2),
      fake('ausente', 'nao-existe-workstuff', 0),
      { tool: 'nada', bin: 'sh', install: 'x', args: () => null },
    ])
    const byTool = Object.fromEntries(results.map(r => [r.tool, r.status]))
    assert.equal(byTool.ausente, 'missing', 'ferramenta não instalada é sugerida, não instalada')
    assert.equal(byTool.nada, 'skipped')
    if (byTool.limpo !== 'error') {
      assert.deepEqual([byTool.limpo, byTool.achou, byTool.quebrou], ['passed', 'failed', 'error'], 'código 1 achou, acima de 1 não rodou')
    }
    assert.equal(results.find(r => r.tool === 'ausente')?.install, 'x')

    assert.equal(scanFindings([{ tool: 'gitleaks', status: 'failed', output: 'AKIA...' }])[0].severity, 'critical', 'segredo bloqueia sozinho')
    assert.equal(scanFindings([{ tool: 'semgrep', status: 'failed' }]).length, 0, 'semgrep vira evidência, não achado')

    assert.equal(SCANNERS.find(s => s.tool === 'semgrep')!.args('main', ['README.md'], tmp), null, 'sem código, semgrep não roda')
    assert.equal(SCANNERS.find(s => s.tool === 'npm audit')!.args('main', ['a.ts'], tmp), null, 'sem dependência alterada, audit não roda')
    console.log('factory scanners selfcheck: ok')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
