// Read jail for the AI CLIs: read-only tools are not read-confined (tested 2026-10-16, Claude with
// Read read a file outside its folder), and the text an agent reads can be someone else's (a remote
// MR). Inside bwrap the home, /tmp and /run/user are empty: the agent sees the system, its own binary,
// the folders it was given and a private config home holding a copy of its login, nothing else.
// Tested 2026-10-16 with Claude and Codex: both authenticate, read the folder, and a file in /tmp or
// ~/.bashrc does not exist for them; Codex's own sandbox still cuts the network inside the jail.
// Autoteste: node server/lib/ai/jail.ts --selfcheck

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { ProviderId } from '../aiProviders.ts'
import { say } from '../i18n.ts'
import { AGENT_HOME } from '../paths.ts'
import { which } from '../run.ts'

export type ReadJail = {
  home: string
  tmpDir: string
  /** Mounted read-only: the agent's folders and binDirs. */
  visible: string[]
  /** The directories holding the CLI binary, which are also the PATH inside. */
  binDirs: string[]
  /** Mounted writable: the config home (sessions, caches) and, for agy, its state folder. */
  writable: string[]
  env: Record<string, string>
}

const BIN: Record<ProviderId, string> = { claude: 'claude', codex: 'codex', agy: 'agy' }

// Only what a CLI needs to run and reach its API: a token for GitLab, GitHub or a cluster in the
// server's environment would otherwise be readable through /proc/self/environ.
const ENV_KEEP = /^(LANG|LC_\w+|TERM|TZ|USER|LOGNAME|(HTTPS?|NO|ALL)_PROXY|(https?|no|all)_proxy|NODE_EXTRA_CA_CERTS|SSL_CERT_(FILE|DIR)|ANTHROPIC_\w+|CLAUDE_CODE_\w+|OPENAI_\w+|GEMINI_\w+|GOOGLE_\w+)$/

export function jailEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter((e): e is [string, string] => ENV_KEEP.test(e[0]) && typeof e[1] === 'string'))
}

// The access token only: a refresh inside the jail would rotate the refresh token and log the user out
// of the real CLI. An expired access token makes the jailed run ask for a login, said in its error.
export function copyClaudeLogin(src: string, dest: string): void {
  if (!existsSync(src)) return
  try {
    const { refreshToken: _dropped, ...oauth } = JSON.parse(readFileSync(src, 'utf-8')).claudeAiOauth ?? {}
    writeFileSync(dest, JSON.stringify({ claudeAiOauth: oauth }), { mode: 0o600 })
  } catch (e) {
    throw new Error(say({ en: `could not copy the Claude login into the sandbox: ${(e as Error).message}`, pt: `não foi possível copiar o login do Claude para o sandbox: ${(e as Error).message}` }))
  }
}

// Fills a private config home with the provider's login; returns the variable that points the CLI at it.
export function seedConfigHome(provider: ProviderId, configHome: string): Record<string, string> {
  mkdirSync(configHome, { recursive: true, mode: 0o700 })
  if (provider === 'codex') {
    for (const file of ['auth.json', 'config.toml']) {
      const src = join(AGENT_HOME, '.codex', file)
      if (existsSync(src)) copyFileSync(src, join(configHome, file))
    }
    return { CODEX_HOME: configHome }
  }
  if (provider === 'claude') {
    copyClaudeLogin(join(AGENT_HOME, '.claude', '.credentials.json'), join(configHome, '.credentials.json'))
    return { CLAUDE_CONFIG_DIR: configHome }
  }
  return {}
}

// The folder of the command on PATH and of the file it resolves to (~/.local/bin/claude is a link into
// ~/.local/share/claude/versions), only those directories and never their parents. A script install
// (npm's `#!/usr/bin/env node`) also needs its interpreter, which usually lives in the hidden home.
async function binaryDirs(bin: string): Promise<string[]> {
  const found = await which(bin)
  if (!found) return []
  const real = realpathSync(found)
  const dirs = [dirname(found), dirname(real)]
  const shebang = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(readFileSync(real).subarray(0, 200).toString('utf-8'))
  if (shebang) {
    const interpreter = basename(shebang[1]) === 'env' && shebang[2] ? await which(shebang[2]) : shebang[1]
    if (interpreter && existsSync(interpreter)) dirs.push(dirname(interpreter), dirname(realpathSync(interpreter)))
  }
  return [...new Set(dirs)]
}

// A jail for one run, removed by cleanup(). Null where bwrap is missing (macOS, Windows, or not installed).
export async function prepareReadJail(provider: ProviderId, folders: string[], configHome?: string): Promise<{ jail: ReadJail; cleanup: () => void } | null> {
  if (!(await which('bwrap'))) return null
  const tmpDir = mkdtempSync(join(tmpdir(), 'workstuff-ai-'))
  const ownHome = configHome ?? join(tmpDir, 'config')
  const writable = provider === 'agy' ? [join(AGENT_HOME, '.gemini')] : [ownHome]
  const env = { ...jailEnv(process.env), ...seedConfigHome(provider, ownHome), HOME: homedir() }
  const binDirs = await binaryDirs(BIN[provider])
  return {
    jail: { home: homedir(), tmpDir, visible: [...folders.filter(existsSync), ...binDirs], binDirs, writable: writable.filter(existsSync), env },
    cleanup: () => rmSync(tmpDir, { recursive: true, force: true }),
  }
}

export function jailArgs(jail: ReadJail, cwd: string | undefined, bin: string, args: string[]): string[] {
  const runUser = `/run/user/${process.getuid?.() ?? ''}`
  const path = [...new Set([...jail.binDirs, '/usr/local/bin', '/usr/bin', '/bin'])].join(':')
  return [
    '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc',
    // Emptied first, then the allowed folders are mounted back on top
    '--tmpfs', jail.home, '--tmpfs', '/tmp', ...(existsSync(runUser) ? ['--tmpfs', runUser] : []),
    ...jail.visible.flatMap(dir => ['--ro-bind-try', dir, dir]),
    ...jail.writable.flatMap(dir => ['--bind', dir, dir]),
    '--bind', jail.tmpDir, jail.tmpDir,
    '--clearenv', ...Object.entries({ ...jail.env, PATH: path, TMPDIR: jail.tmpDir }).flatMap(([k, v]) => ['--setenv', k, v]),
    '--unshare-pid', '--die-with-parent', '--chdir', cwd ?? jail.tmpDir,
    bin, ...args,
  ]
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const env = jailEnv({ PATH: '/x', HOME: '/h', LANG: 'pt_BR.UTF-8', ANTHROPIC_API_KEY: 'k', GITLAB_TOKEN: 'segredo', GITHUB_TOKEN: 'g', KUBECONFIG: '/k', OPENAI_API_KEY: 'o' })
  assert.deepEqual(env, { LANG: 'pt_BR.UTF-8', ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'o' }, 'tokens do servidor não entram no jail')

  const jail: ReadJail = { home: '/home/u', tmpDir: '/tmp/w', visible: ['/home/u/proj', '/home/u/.local/bin'], binDirs: ['/home/u/.local/bin'], writable: ['/tmp/w/config'], env: { HOME: '/home/u' } }
  const args = jailArgs(jail, '/home/u/proj', 'claude', ['-p'])
  const at = (flag: string, value: string) => args.findIndex((a, i) => a === flag && args[i + 1] === value)
  assert.ok(at('--tmpfs', '/home/u') > at('--ro-bind', '/'), 'a home some depois de montar o disco')
  assert.ok(at('--tmpfs', '/tmp') > 0, '/tmp também some')
  assert.ok(at('--ro-bind-try', '/home/u/proj') > at('--tmpfs', '/home/u'), 'a pasta do agente volta por cima, só leitura')
  assert.ok(!args.includes('--bind') || args[args.indexOf('--bind') + 1] !== '/home/u/proj', 'a pasta do agente nunca é gravável')
  assert.ok(args.includes('--clearenv'))
  assert.equal(args[args.indexOf('--chdir') + 1], '/home/u/proj')
  assert.deepEqual(args.slice(-2), ['claude', '-p'])
  const path = args[args.indexOf('PATH') + 1]
  assert.ok(path.startsWith('/home/u/.local/bin') && !path.includes('/home/u/proj'), 'a pasta do projeto não entra no PATH')

  const login = mkdtempSync(join(tmpdir(), 'ws-jail-'))
  try {
    writeFileSync(join(login, 'in.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'a', refreshToken: 'r', expiresAt: 1 } }))
    copyClaudeLogin(join(login, 'in.json'), join(login, 'out.json'))
    assert.deepEqual(JSON.parse(readFileSync(join(login, 'out.json'), 'utf-8')), { claudeAiOauth: { accessToken: 'a', expiresAt: 1 } }, 'só o token de acesso entra no jail')
  } finally {
    rmSync(login, { recursive: true, force: true })
  }
  // Real run, no tokens: a script "claude" (as npm installs it) inside bwrap reads its folder and
  // finds nothing outside it, with only its own variables in the environment
  if (await which('bwrap')) {
    const tmp = mkdtempSync(join(tmpdir(), 'ws-jail-run-'))
    const savedPath = process.env.PATH
    const savedToken = process.env.GITLAB_TOKEN
    try {
      const bin = join(tmp, 'bin')
      const work = join(tmp, 'work')
      const outside = join(tmp, 'fora.txt')
      mkdirSync(bin)
      mkdirSync(work)
      writeFileSync(join(work, 'dentro.txt'), 'DENTRO')
      writeFileSync(outside, 'FORA')
      writeFileSync(join(bin, 'claude'), `#!/usr/bin/env node
const fs = require('fs')
const read = f => { try { return fs.readFileSync(f, 'utf-8') } catch { return 'X' } }
console.log([read('dentro.txt'), read(${JSON.stringify(outside)}), process.env.GITLAB_TOKEN ?? 'X'].join(' '))
`, { mode: 0o755 })
      process.env.PATH = `${bin}:${savedPath}`
      process.env.GITLAB_TOKEN = 'segredo'
      const prepared = (await prepareReadJail('claude', [work]))!
      try {
        assert.ok(prepared.jail.binDirs.includes(bin), 'a pasta do binário fica visível')
        const out = await new Promise<string>((resolve, reject) => {
          const child = spawn('bwrap', jailArgs(prepared.jail, work, 'claude', []), { stdio: ['ignore', 'pipe', 'inherit'] })
          let text = ''
          child.stdout.on('data', c => (text += c))
          child.on('error', reject)
          child.on('close', () => resolve(text.trim()))
        })
        assert.equal(out, 'DENTRO X X', 'lê a pasta, não vê o arquivo de fora nem o token do servidor')
      } finally {
        prepared.cleanup()
      }
    } finally {
      process.env.PATH = savedPath
      if (savedToken === undefined) delete process.env.GITLAB_TOKEN
      else process.env.GITLAB_TOKEN = savedToken
      rmSync(tmp, { recursive: true, force: true })
    }
  }
  console.log('ai jail selfcheck: ok')
}
