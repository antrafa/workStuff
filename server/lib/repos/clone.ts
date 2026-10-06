import { execFile } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { Project } from './providers.ts'
import type { Protocol, ProviderKind } from './sources.ts'
import { say } from '../i18n.ts'

const exec = promisify(execFile)

export type CloneStatus = 'cloned' | 'exists' | 'skipped' | 'failed'
export type CloneResult = { fullPath: string; dest: string; status: CloneStatus; detail: string }

// Nome de usuário que cada provedor aceita junto com um token no HTTPS.
const TOKEN_USER: Record<ProviderKind, string> = { gitlab: 'oauth2', github: 'x-access-token' }

// O token chega ao git por um askpass temporário que lê uma variável de ambiente: não aparece na linha
// de comando (ps), na URL nem no .git/config. credential.helper vazio impede o git de gravá-lo.
function askpass() {
  const dir = mkdtempSync(join(tmpdir(), 'workstuff-askpass-'))
  const file = join(dir, 'askpass.sh')
  writeFileSync(file, '#!/bin/sh\ncase "$1" in *sername*) printf "%s" "$WORKSTUFF_GIT_USER" ;; *) printf "%s" "$WORKSTUFF_GIT_TOKEN" ;; esac\n', { mode: 0o700 })
  chmodSync(file, 0o700)
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

export function localState(dest: string): 'cloned' | 'occupied' | 'free' {
  if (existsSync(join(dest, '.git'))) return 'cloned'
  if (existsSync(dest) && readdirSync(dest).length > 0) return 'occupied'
  return 'free'
}

const clean = (s: string) => s.split('\n').filter(l => l.trim() && !/^(Cloning into|remote: (Enumerating|Counting|Compressing|Total))/.test(l)).slice(-3).join(' ').slice(0, 400)

export async function cloneProject(p: Project, dest: string, opts: { provider: ProviderKind; protocol: Protocol; token: string | null; signal?: AbortSignal }): Promise<CloneResult> {
  const state = localState(dest)
  if (state === 'cloned') return { fullPath: p.fullPath, dest, status: 'exists', detail: say({ en: 'already cloned; nothing changed', pt: 'já estava clonado; nada foi alterado' }) }
  if (state === 'occupied') return { fullPath: p.fullPath, dest, status: 'skipped', detail: say({ en: 'the folder exists, has files and is not a git repository; left untouched', pt: 'a pasta existe, tem arquivos e não é um repositório git; não mexi nela' }) }

  mkdirSync(dirname(dest), { recursive: true })
  const env: Record<string, string> = { ...process.env as Record<string, string>, GIT_TERMINAL_PROMPT: '0' }
  let pass: ReturnType<typeof askpass> | null = null
  if (opts.protocol === 'ssh') {
    // BatchMode: sem chave aceita, falha em vez de ficar esperando senha. accept-new grava a chave do
    // host no known_hosts só na primeira vez (o mesmo que responder "yes" no terminal).
    env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15'
  } else if (opts.token) {
    pass = askpass()
    Object.assign(env, { GIT_ASKPASS: pass.file, WORKSTUFF_GIT_USER: TOKEN_USER[opts.provider], WORKSTUFF_GIT_TOKEN: opts.token })
  }
  try {
    await exec('git', ['-c', 'credential.helper=', 'clone', '--', opts.protocol === 'ssh' ? p.sshUrl : p.httpUrl, dest], { env, timeout: 15 * 60_000, signal: opts.signal, maxBuffer: 10 * 1024 * 1024 })
    return { fullPath: p.fullPath, dest, status: 'cloned', detail: say({ en: 'cloned', pt: 'clonado' }) }
  } catch (e) {
    const err = e as { stderr?: string; message: string; name?: string }
    const aborted = err.name === 'AbortError'
    // A stopped clone leaves a half-done folder: remove it only if we just created it.
    if (localState(dest) !== 'cloned' && existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    const detail = aborted ? say({ en: 'stopped by you', pt: 'interrompido por você' }) : clean(err.stderr ?? err.message) || say({ en: 'git clone failed', pt: 'git clone falhou' })
    return { fullPath: p.fullPath, dest, status: 'failed', detail: hint(detail, opts.protocol) }
  } finally {
    pass?.cleanup()
  }
}

function hint(detail: string, protocol: Protocol) {
  if (protocol === 'ssh' && /Permission denied \(publickey\)|Host key verification/i.test(detail)) return `${detail} → ${say({ en: 'the SSH key was not accepted; use "Test SSH" on the connection or switch to HTTPS', pt: 'a chave SSH não foi aceita; use "Testar SSH" na conexão ou troque para HTTPS' })}`
  if (protocol === 'https' && /Authentication failed|could not read Username|403/i.test(detail)) return `${detail} → ${say({ en: 'the token has no repository read permission (read_repository on GitLab, repo on GitHub)', pt: 'o token não tem permissão de leitura de repositório (read_repository no GitLab, repo no GitHub)' })}`
  return detail
}

// "Testar SSH": GitLab responde "Welcome to GitLab", GitHub "successfully authenticated"; ambos saem com código 1.
export async function sshCheck(url: string): Promise<{ ok: boolean; detail: string }> {
  const host = new URL(url).hostname
  try {
    const { stdout, stderr } = await exec('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10', `git@${host}`], { timeout: 20_000 })
    return verdict(stdout + stderr)
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string }
    return verdict((err.stdout ?? '') + (err.stderr ?? err.message))
  }
}

function verdict(out: string) {
  const ok = /welcome to gitlab|successfully authenticated/i.test(out)
  return { ok, detail: out.trim().split('\n').filter(l => !l.startsWith('Warning: Permanently added')).join(' ').slice(0, 300) }
}

// Fila com paralelismo pequeno: clonar 40 repositórios de uma vez satura disco e rede.
export async function cloneMany(items: { project: Project; dest: string }[], opts: Parameters<typeof cloneProject>[2] & { onResult: (r: CloneResult) => void }) {
  const queue = [...items]
  const worker = async () => {
    for (let it = queue.shift(); it && !opts.signal?.aborted; it = queue.shift()) opts.onResult(await cloneProject(it.project, it.dest, opts))
  }
  await Promise.all(Array.from({ length: 3 }, worker))
}
