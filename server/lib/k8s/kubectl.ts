import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export type Target = { file: string; context: string }

export class KubeError extends Error {
  readonly kind: 'forbidden' | 'unauthorized' | 'unreachable' | 'notfound' | 'other'
  constructor(message: string, kind: KubeError['kind']) {
    super(message)
    this.kind = kind
  }
}

// O kubectl imprime avisos (ex.: token auto-gerado) no stderr mesmo quando dá certo; não são erro.
const stripWarnings = (s: string) => s.split('\n').filter(l => l.trim() && !l.startsWith('Warning:') && !/^[EIWF]\d{4} \d{2}:\d{2}:\d{2}/.test(l)).join('\n')

function classify(stderr: string): KubeError {
  const msg = stripWarnings(stderr).trim() || 'kubectl falhou sem mensagem'
  if (/forbidden/i.test(msg)) return new KubeError(msg, 'forbidden')
  if (/unauthorized|must be logged in|provide credentials/i.test(msg)) return new KubeError(msg, 'unauthorized')
  if (/NotFound|not found/i.test(msg)) return new KubeError(msg, 'notfound')
  if (/timeout|timed out|no such host|connection refused|dial tcp|i\/o timeout/i.test(msg)) return new KubeError(msg, 'unreachable')
  return new KubeError(msg, 'other')
}

const base = (t: Target) => ['--kubeconfig', t.file, '--context', t.context, '--request-timeout=20s']

// Sem shell: cada argumento vai direto para o kubectl.
export async function kubectl(t: Target, args: string[], timeoutMs = 30_000): Promise<string> {
  try {
    const { stdout } = await exec('kubectl', [...base(t), ...args], { timeout: timeoutMs, maxBuffer: 100 * 1024 * 1024 })
    return stdout
  } catch (e) {
    const err = e as { stderr?: string; message: string; killed?: boolean }
    if (err.killed) throw new KubeError(`kubectl passou de ${timeoutMs / 1000}s sem responder`, 'unreachable')
    throw classify(err.stderr ?? err.message)
  }
}

export async function kubectlJson<T>(t: Target, args: string[], timeoutMs?: number): Promise<T> {
  return JSON.parse(await kubectl(t, [...args, '-o', 'json'], timeoutMs)) as T
}

export async function kubectlRaw<T>(t: Target, path: string): Promise<T> {
  return JSON.parse(await kubectl(t, ['get', '--raw', path])) as T
}

// Processo longo (logs -f). O chamador encerra com kill.
export function kubectlStream(t: Target, args: string[]) {
  return spawn('kubectl', [...base(t).filter(a => a !== '--request-timeout=20s'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
}

// Leitura local do kubeconfig, sem falar com o cluster. config view já omite tokens e certificados.
export async function configView(file: string): Promise<KubeconfigView> {
  try {
    const { stdout } = await exec('kubectl', ['config', 'view', '--kubeconfig', file, '-o', 'json'], { timeout: 10_000 })
    return JSON.parse(stdout) as KubeconfigView
  } catch (e) {
    throw new KubeError(`kubeconfig inválido: ${stripWarnings((e as { stderr?: string }).stderr ?? (e as Error).message).trim()}`, 'other')
  }
}

export type KubeconfigView = {
  'current-context'?: string
  contexts?: { name: string; context: { cluster: string; user: string; namespace?: string } }[]
  clusters?: { name: string; cluster: { server: string } }[]
  users?: { name: string; user: Record<string, unknown> }[]
}
