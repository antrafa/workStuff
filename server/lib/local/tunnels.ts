// Túneis Kubernetes (kubectl port-forward) gerenciados pelo painel em Serviços Locais.
// Sem shell: argumentos validados na fronteira, execução em grupo de processos próprio e trava de
// confirmação explícita quando o kubeconfig/contexto aponta para HML, PRO ou não está classificado.
// Autoteste: node server/lib/local/tunnels.ts --selfcheck

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { say } from '../i18n.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { KUBE_DIR } from '../k8s/kubeconfigs.ts'
import { detectEnvironment, type Environment } from '../k8s/policy.ts'
import { dataFile } from '../paths.ts'
import { PLATFORM } from '../platform.ts'
import { run } from '../run.ts'

export type TunnelTargetKind = 'svc' | 'pod' | 'deploy'

export type Tunnel = {
  id: string
  name: string
  profile: string | null
  kubeconfigId: string
  context: string
  namespace: string
  targetKind: TunnelTargetKind
  targetName: string
  localPort: number
  remotePort: number
}

export type TunnelInput = Omit<Tunnel, 'id'>

export type TunnelStatus = Tunnel & {
  pid: number | null
  portOpen: boolean
  portPid: number | null
  environment: Environment | null
  sensitive: boolean
  lastError: string | null
}

const K8S_NAME = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/
const SAFE_KUBE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/
const SAFE_CTX = /^[a-zA-Z0-9._:@/-]{1,120}$/
const TARGET_KINDS: TunnelTargetKind[] = ['svc', 'pod', 'deploy']
const LOG_TAIL_BYTES = 128 * 1024

export function checkTunnelInput(body: unknown): TunnelInput {
  const b = (body ?? {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const name = text(b.name)
  const profile = text(b.profile) || null
  const kubeconfigId = text(b.kubeconfigId)
  const context = text(b.context)
  const namespace = text(b.namespace)
  const targetKind = text(b.targetKind) as TunnelTargetKind
  const targetName = text(b.targetName)
  const localPort = Number(b.localPort)
  const remotePort = Number(b.remotePort)

  if (!name) throw new Error(say({ en: 'tunnel name is required', pt: 'o nome do túnel é obrigatório' }))
  if (!kubeconfigId || !SAFE_KUBE_ID.test(kubeconfigId) || basename(kubeconfigId) !== kubeconfigId) {
    throw new Error(say({ en: 'choose a valid kubeconfig', pt: 'escolha um kubeconfig válido' }))
  }
  if (context && !SAFE_CTX.test(context)) {
    throw new Error(say({ en: 'invalid context name', pt: 'nome de contexto inválido' }))
  }
  if (!namespace || !K8S_NAME.test(namespace)) {
    throw new Error(say({ en: 'invalid namespace (use lowercase letters, digits and hyphens)', pt: 'namespace inválido (use letras minúsculas, números e hífen)' }))
  }
  if (!TARGET_KINDS.includes(targetKind)) {
    throw new Error(say({ en: 'target kind must be svc, pod or deploy', pt: 'o tipo de alvo precisa ser svc, pod ou deploy' }))
  }
  if (!targetName || !K8S_NAME.test(targetName)) {
    throw new Error(say({ en: 'invalid resource name (use lowercase letters, digits, dots and hyphens)', pt: 'nome do recurso inválido (use letras minúsculas, números, ponto e hífen)' }))
  }
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
    throw new Error(say({ en: 'local port must be between 1 and 65535', pt: 'a porta local precisa ficar entre 1 e 65535' }))
  }
  if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
    throw new Error(say({ en: 'remote port must be between 1 and 65535', pt: 'a porta remota precisa ficar entre 1 e 65535' }))
  }

  return { name, profile, kubeconfigId, context, namespace, targetKind, targetName, localPort, remotePort }
}

export function buildPortForwardArgs(kubeconfigFile: string, t: Pick<Tunnel, 'context' | 'namespace' | 'targetKind' | 'targetName' | 'localPort' | 'remotePort'>): string[] {
  return [
    '--kubeconfig',
    kubeconfigFile,
    ...(t.context ? ['--context', t.context] : []),
    '-n',
    t.namespace,
    'port-forward',
    `${t.targetKind}/${t.targetName}`,
    `${t.localPort}:${t.remotePort}`,
  ]
}

export function isSensitiveEnvironment(env: Environment | null): boolean {
  // Sem classificação vale como PRO (política de server/lib/k8s/policy.ts).
  return env === 'PRO' || env === 'HML' || env === null
}

const slug = (name: string) =>
  name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tunel'

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type StoreOptions = {
  kubeDir?: string
  envFile?: string
  spawnCommand?: (kubeconfigFile: string, t: Tunnel) => { cmd: string; args: string[] }
}

export function createTunnelsStore(dir: string = dataFile('tunnels'), opts: StoreOptions = {}) {
  const file = join(dir, 'tunnels.json')
  const kubeDir = opts.kubeDir ?? KUBE_DIR
  const envFile = opts.envFile ?? dataFile('cluster-environments.json')
  const runDir = (id: string) => join(dir, id)
  const pidFile = (id: string) => join(runDir(id), 'pid')
  const logFile = (id: string) => join(runDir(id), 'out.log')

  const list = () => readJson<Tunnel[]>(file, [])
  const save = (items: Tunnel[]) => (mkdirSync(dir, { recursive: true }), writeJson(file, items))

  function find(id: string) {
    const t = list().find(x => x.id === id)
    if (!t) throw new Error(say({ en: `tunnel ${id} not found`, pt: `túnel ${id} não encontrado` }))
    return t
  }

  // Same names the Cluster page classifies by (file and current-context) plus the tunnel's own context.
  // The namespace never counts: "app-dev" inside a PRO cluster is still PRO. PRO is tested first, so
  // every extra name can only make the result stricter.
  function resolveEnv(t: Pick<Tunnel, 'kubeconfigId' | 'context'>): Environment | null {
    const overrides = readJson<Record<string, Environment>>(envFile, {})
    if (overrides[t.kubeconfigId]) return overrides[t.kubeconfigId]
    return detectEnvironment(t.kubeconfigId.replace(/\.(ya?ml|kubeconfig)$/, ''), t.context, currentContextOf(t.kubeconfigId))
  }

  // ponytail: reads the top-level key with a regex instead of `kubectl config view`, which is async and
  // this runs on every status poll; kubectl always writes the key at column zero.
  function currentContextOf(kubeconfigId: string): string {
    try {
      return readFileSync(join(kubeDir, kubeconfigId), 'utf-8').match(/^current-context:\s*["']?([^"'\s]+)/m)?.[1] ?? ''
    } catch {
      return ''
    }
  }

  function pidOf(id: string): number | null {
    try {
      const pid = Number(readFileSync(pidFile(id), 'utf-8').trim())
      return pid > 1 && alive(pid) ? pid : null
    } catch {
      return null
    }
  }

  function create(input: TunnelInput): Tunnel {
    const all = list()
    const base = slug(input.name)
    let id = base
    for (let i = 2; all.some(t => t.id === id); i++) id = `${base}-${i}`
    const tunnel: Tunnel = { ...input, id }
    save([...all, tunnel])
    return tunnel
  }

  function update(id: string, input: TunnelInput): Tunnel {
    const all = list()
    if (!all.some(t => t.id === id)) find(id)
    // A running process keeps forwarding to the old target while the list would show the new one.
    if (pidOf(id)) throw new Error(say({ en: 'the tunnel is active; stop it before editing', pt: 'o túnel está ativo; pare antes de editar' }))
    const tunnel: Tunnel = { ...input, id }
    save(all.map(t => (t.id === id ? tunnel : t)))
    return tunnel
  }

  function remove(id: string) {
    find(id)
    if (pidOf(id)) throw new Error(say({ en: 'the tunnel is active; stop it before deleting', pt: 'o túnel está ativo; pare antes de excluir' }))
    save(list().filter(t => t.id !== id))
    rmSync(runDir(id), { recursive: true, force: true })
  }

  async function start(id: string, startOpts?: { confirmSensitive?: boolean }) {
    const t = find(id)
    if (pidOf(id)) throw new Error(say({ en: 'tunnel is already running', pt: 'o túnel já está ativo' }))

    const env = resolveEnv(t)
    if (isSensitiveEnvironment(env) && !startOpts?.confirmSensitive) {
      const label = env ?? 'PRO (não classificado)'
      throw new Error(say({
        en: `opening a tunnel to ${label} requires explicit confirmation`,
        pt: `abrir túnel para ${label} exige confirmação explícita`,
      }))
    }

    const kubeconfigFile = join(kubeDir, t.kubeconfigId)
    if (!existsSync(kubeconfigFile) || !statSync(kubeconfigFile).isFile()) {
      throw new Error(say({
        en: `kubeconfig not found: ${t.kubeconfigId}`,
        pt: `kubeconfig não encontrado: ${t.kubeconfigId}`,
      }))
    }

    mkdirSync(runDir(id), { recursive: true })
    const fd = openSync(logFile(id), 'w')
    try {
      const spec = opts.spawnCommand
        ? opts.spawnCommand(kubeconfigFile, t)
        : { cmd: 'kubectl', args: buildPortForwardArgs(kubeconfigFile, t) }

      const child = spawn(spec.cmd, spec.args, {
        detached: true,
        windowsHide: true,
        stdio: ['ignore', fd, fd],
        env: { ...process.env, FORCE_COLOR: '0' },
      })
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })
      writeFileSync(pidFile(id), String(child.pid))
      child.unref()
      console.log(`[tunnels] start ${id} (pid ${child.pid}, env ${env ?? 'unclassified'}): ${t.localPort}->${t.targetKind}/${t.targetName}:${t.remotePort}`)
      return child.pid!
    } catch (e) {
      throw new Error(say({
        en: `could not start kubectl port-forward: ${(e as Error).message}`,
        pt: `não foi possível iniciar o kubectl port-forward: ${(e as Error).message}`,
      }))
    } finally {
      closeSync(fd)
    }
  }

  async function stop(id: string, force = false) {
    find(id)
    const pid = pidOf(id)
    if (!pid) throw new Error(say({ en: 'tunnel is not running', pt: 'o túnel não está ativo' }))
    if (PLATFORM.os === 'win32') await run('taskkill', ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])], 15_000)
    else {
      try {
        process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM')
      } catch {
        process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
      }
    }
    for (let i = 0; i < 20 && alive(pid); i++) await sleep(200)
    const stillAlive = alive(pid)
    if (!stillAlive) {
      try {
        unlinkSync(pidFile(id))
      } catch {
        // já removido
      }
    }
    console.log(`[tunnels] stop ${id} (pid ${pid}) → ${stillAlive ? 'ainda vivo' : 'encerrado'}`)
    return { stillAlive }
  }

  async function restart(id: string, startOpts?: { confirmSensitive?: boolean }) {
    if (pidOf(id) && (await stop(id)).stillAlive) {
      throw new Error(say({ en: 'the tunnel process did not stop', pt: 'o processo do túnel não parou' }))
    }
    return start(id, startOpts)
  }

  function readLog(id: string, from?: number) {
    let size: number
    try {
      size = statSync(logFile(id)).size
    } catch {
      return { text: '', offset: 0, reset: from !== undefined && from > 0 }
    }
    const reset = from !== undefined && size < from
    const begin = from === undefined || reset ? Math.max(0, size - LOG_TAIL_BYTES) : from
    if (size === begin) return { text: '', offset: size, reset }
    const buf = Buffer.alloc(size - begin)
    const fd = openSync(logFile(id), 'r')
    try {
      readSync(fd, buf, 0, buf.length, begin)
    } finally {
      closeSync(fd)
    }
    const text = buf.toString('utf-8')
    return { text: begin > 0 && from === undefined ? text.slice(text.indexOf('\n') + 1) : text, offset: size, reset }
  }

  function lastErrorOf(id: string): string | null {
    const { text } = readLog(id)
    if (!text) return null
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const errLine = [...lines].reverse().find(l => /error:|unable to listen|lost connection|refused|not found|forbidden/i.test(l))
    return errLine ? errLine.slice(0, 220) : null
  }

  function statusList(openPorts: Map<number, number | null>): TunnelStatus[] {
    return list().map(t => {
      const pid = pidOf(t.id)
      const environment = resolveEnv(t)
      return {
        ...t,
        pid,
        portOpen: openPorts.has(t.localPort),
        portPid: openPorts.get(t.localPort) ?? null,
        environment,
        sensitive: isSensitiveEnvironment(environment),
        lastError: pid ? null : lastErrorOf(t.id),
      }
    })
  }

  function activeSummary() {
    const active = list()
      .map(t => ({ t, pid: pidOf(t.id), env: resolveEnv(t) }))
      .filter(x => x.pid !== null)
    return {
      count: active.length,
      sensitiveCount: active.filter(x => isSensitiveEnvironment(x.env)).length,
      environments: [...new Set(active.map(x => x.env ?? 'PRO'))],
    }
  }

  return {
    list,
    find,
    pidOf,
    resolveEnv,
    create,
    update,
    remove,
    start,
    stop,
    restart,
    readLog,
    statusList,
    activeSummary,
  }
}

export const tunnels = createTunnelsStore()

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const tmp = mkdtempSync(join(tmpdir(), 'ws-tunnels-'))
  try {
    const kubeDir = join(tmp, 'kube')
    mkdirSync(kubeDir, { recursive: true })
    writeFileSync(join(kubeDir, 'des-cluster.yaml'), 'apiVersion: v1\nkind: Config\n')
    writeFileSync(join(kubeDir, 'pro-cluster.yaml'), 'apiVersion: v1\nkind: Config\n')

    const store = createTunnelsStore(join(tmp, 'tunnels'), {
      kubeDir,
      envFile: join(tmp, 'cluster-environments.json'),
      spawnCommand: (_file, t) => ({
        cmd: process.execPath,
        args: ['-e', `console.log('Forwarding from 127.0.0.1:${t.localPort} -> ${t.remotePort}'); setInterval(() => {}, 1000)`],
      }),
    })

    // Validação de fronteira
    assert.throws(() => checkTunnelInput({ name: '', kubeconfigId: 'des.yaml', namespace: 'default', targetKind: 'svc', targetName: 'db', localPort: 5432, remotePort: 5432 }), /required|obrigatório/)
    assert.throws(() => checkTunnelInput({ name: 'PG', kubeconfigId: '../etc/passwd', namespace: 'default', targetKind: 'svc', targetName: 'db', localPort: 5432, remotePort: 5432 }), /kubeconfig/)
    assert.throws(() => checkTunnelInput({ name: 'PG', kubeconfigId: 'des.yaml', namespace: 'Bad_NS', targetKind: 'svc', targetName: 'db', localPort: 5432, remotePort: 5432 }), /namespace/)
    assert.throws(() => checkTunnelInput({ name: 'PG', kubeconfigId: 'des.yaml', namespace: 'default', targetKind: 'svc', targetName: 'db;rm', localPort: 5432, remotePort: 5432 }), /resource|recurso/)

    const desTunnel = store.create(checkTunnelInput({
      name: 'Postgres Passagem DES',
      profile: 'Passagem local',
      kubeconfigId: 'des-cluster.yaml',
      context: 'des-ctx',
      namespace: 'passagem',
      targetKind: 'svc',
      targetName: 'postgres-passagem',
      localPort: 15432,
      remotePort: 5432,
    }))
    assert.equal(store.resolveEnv(desTunnel), 'DES')
    assert.deepEqual(
      buildPortForwardArgs('/k/des-cluster.yaml', desTunnel),
      ['--kubeconfig', '/k/des-cluster.yaml', '--context', 'des-ctx', '-n', 'passagem', 'port-forward', 'svc/postgres-passagem', '15432:5432'],
    )

    const proTunnel = store.create(checkTunnelInput({
      name: 'Postgres PRO',
      profile: '',
      kubeconfigId: 'pro-cluster.yaml',
      context: 'pro-ctx',
      namespace: 'passagem',
      targetKind: 'svc',
      targetName: 'postgres-passagem',
      localPort: 25432,
      remotePort: 5432,
    }))
    assert.equal(store.resolveEnv(proTunnel), 'PRO')

    // The namespace never classifies; the kubeconfig's current-context does
    writeFileSync(join(kubeDir, 'cliente.yaml'), 'apiVersion: v1\nkind: Config\ncurrent-context: cliente-prod\n')
    writeFileSync(join(kubeDir, 'outro.yaml'), 'apiVersion: v1\nkind: Config\ncurrent-context: outro\n')
    assert.equal(store.resolveEnv({ kubeconfigId: 'cliente.yaml', context: '' }), 'PRO')
    assert.equal(store.resolveEnv({ kubeconfigId: 'outro.yaml', context: '' }), null)
    const nsDev = store.create({ ...proTunnel, name: 'NS dev', kubeconfigId: 'outro.yaml', context: '', namespace: 'app-dev', profile: null })
    assert.equal(store.statusList(new Map()).find(t => t.id === nsDev.id)?.sensitive, true)
    store.remove(nsDev.id)

    // PRO exige confirmação explícita
    await assert.rejects(store.start(proTunnel.id), /confirmation|confirmação/)

    // DES sobe direto
    const pid = await store.start(desTunnel.id)
    assert.ok(pid > 1)
    assert.equal(store.activeSummary().count, 1)
    assert.equal(store.activeSummary().sensitiveCount, 0)
    assert.throws(() => store.update(desTunnel.id, { ...desTunnel, kubeconfigId: 'pro-cluster.yaml' }), /active|ativo/)

    for (let i = 0; i < 30 && !store.readLog(desTunnel.id).text.includes('Forwarding'); i++) await sleep(100)
    assert.match(store.readLog(desTunnel.id).text, /Forwarding from 127\.0\.0\.1:15432/)

    assert.deepEqual(await store.stop(desTunnel.id), { stillAlive: false })
    assert.equal(store.activeSummary().count, 0)
    store.remove(desTunnel.id)
    store.remove(proTunnel.id)
    assert.equal(store.list().length, 0)

    console.log('tunnels selfcheck: ok')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
