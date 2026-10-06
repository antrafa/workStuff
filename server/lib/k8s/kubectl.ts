import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { say } from '../i18n.ts'

const exec = promisify(execFile)

export type Target = { file: string; context: string }

export class KubeError extends Error {
  readonly kind: 'forbidden' | 'unauthorized' | 'unreachable' | 'notfound' | 'other'
  constructor(message: string, kind: KubeError['kind']) {
    super(message)
    this.kind = kind
  }
}

// kubectl prints warnings (e.g. auto-generated token) to stderr even on success; they are not errors.
const stripWarnings = (s: string) => s.split('\n').filter(l => l.trim() && !l.startsWith('Warning:') && !/^[EIWF]\d{4} \d{2}:\d{2}:\d{2}/.test(l)).join('\n')

function classify(stderr: string): KubeError {
  const msg = stripWarnings(stderr).trim() || say({ en: 'kubectl failed with no message', pt: 'kubectl falhou sem mensagem' })
  if (/forbidden/i.test(msg)) return new KubeError(msg, 'forbidden')
  if (/unauthorized|must be logged in|provide credentials/i.test(msg)) return new KubeError(msg, 'unauthorized')
  if (/NotFound|not found/i.test(msg)) return new KubeError(msg, 'notfound')
  if (/timeout|timed out|no such host|connection refused|was refused|dial tcp|i\/o timeout/i.test(msg)) return new KubeError(msg, 'unreachable')
  return new KubeError(msg, 'other')
}

const base = (t: Target) => ['--kubeconfig', t.file, '--context', t.context, '--request-timeout=20s']

// No shell: each argument goes straight to kubectl.
export async function kubectl(t: Target, args: string[], timeoutMs = 30_000): Promise<string> {
  try {
    const { stdout } = await exec('kubectl', [...base(t), ...args], { timeout: timeoutMs, maxBuffer: 100 * 1024 * 1024 })
    return stdout
  } catch (e) {
    const err = e as { stderr?: string; message: string; killed?: boolean }
    if (err.killed) throw new KubeError(say({ en: `kubectl did not answer within ${timeoutMs / 1000}s`, pt: `kubectl passou de ${timeoutMs / 1000}s sem responder` }), 'unreachable')
    throw classify(err.stderr ?? err.message)
  }
}

export async function kubectlJson<T>(t: Target, args: string[], timeoutMs?: number): Promise<T> {
  return JSON.parse(await kubectl(t, [...args, '-o', 'json'], timeoutMs)) as T
}

export async function kubectlRaw<T>(t: Target, path: string): Promise<T> {
  return JSON.parse(await kubectl(t, ['get', '--raw', path])) as T
}

// Long process (logs -f). The caller ends it with kill.
export function kubectlStream(t: Target, args: string[]) {
  return spawn('kubectl', [...base(t).filter(a => a !== '--request-timeout=20s'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
}

// Local read of the kubeconfig, without talking to the cluster. config view already omits tokens and certificates.
export async function configView(file: string): Promise<KubeconfigView> {
  try {
    const { stdout } = await exec('kubectl', ['config', 'view', '--kubeconfig', file, '-o', 'json'], { timeout: 10_000 })
    return JSON.parse(stdout) as KubeconfigView
  } catch (e) {
    throw new KubeError(`${say({ en: 'invalid kubeconfig', pt: 'kubeconfig inválido' })}: ${stripWarnings((e as { stderr?: string }).stderr ?? (e as Error).message).trim()}`, 'other')
  }
}

export type KubeconfigView = {
  'current-context'?: string
  contexts?: { name: string; context: { cluster: string; user: string; namespace?: string } }[]
  clusters?: { name: string; cluster: { server: string } }[]
  users?: { name: string; user: Record<string, unknown> }[]
}
