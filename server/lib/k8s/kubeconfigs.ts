import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { ClusterError } from './errors.ts'
import { configView, type KubeconfigView } from './kubectl.ts'
import { detectEnvironment, type Environment } from './policy.ts'
import { say } from '../i18n.ts'

// Kubeconfig folder. Overridable to test upload/removal without touching the real ~/.kube.
export const KUBE_DIR = process.env.WORKSTUFF_KUBE_DIR ?? join(homedir(), '.kube')
const ENV_FILE = dataFile('cluster-environments.json')
const EXTENSIONS = /\.(ya?ml|kubeconfig)$/

export type Kubeconfig = {
  id: string
  filename: string
  file: string
  contexts: string[]
  currentContext: string
  environment: Environment | null
  environmentSource: 'manual' | 'nome' | null
  rancherUrl: string | null
  execAuth: boolean
  updatedAt: string
}

// id = file name (with the extension): no collision between a.yaml and a.yml, and no bug opening .yml.
const candidates = () => {
  if (!existsSync(KUBE_DIR)) return []
  return readdirSync(KUBE_DIR).filter(f => f === 'config' || EXTENSIONS.test(f)).filter(f => statSync(join(KUBE_DIR, f)).isFile())
}

function rancherUrl(server: string | undefined) {
  const m = server?.match(/^(.*)\/k8s\/clusters\/([^/]+)$/)
  return m ? `${m[1]}/dashboard/c/${m[2]}/explorer` : null
}

function describe(filename: string, view: KubeconfigView, overrides: Record<string, Environment>): Kubeconfig {
  const current = view['current-context'] ?? view.contexts?.[0]?.name ?? ''
  const ctx = view.contexts?.find(c => c.name === current)
  const server = view.clusters?.find(c => c.name === ctx?.context.cluster)?.cluster.server
  const manual = overrides[filename]
  const auto = detectEnvironment(filename.replace(EXTENSIONS, ''), current)
  return {
    id: filename,
    filename,
    file: join(KUBE_DIR, filename),
    contexts: (view.contexts ?? []).map(c => c.name),
    currentContext: current,
    environment: manual ?? auto,
    environmentSource: manual ? 'manual' : auto ? 'nome' : null,
    rancherUrl: rancherUrl(server),
    execAuth: (view.users ?? []).some(u => 'exec' in u.user),
    updatedAt: statSync(join(KUBE_DIR, filename)).mtime.toISOString(),
  }
}

export async function listKubeconfigs(): Promise<{ items: Kubeconfig[]; invalid: string[] }> {
  const overrides = readJson<Record<string, Environment>>(ENV_FILE, {})
  const invalid: string[] = []
  const items = (
    await Promise.all(
      candidates().map(async f => {
        try {
          const view = await configView(join(KUBE_DIR, f))
          return view.contexts?.length ? describe(f, view, overrides) : (invalid.push(f), null)
        } catch {
          invalid.push(f)
          return null
        }
      }),
    )
  ).filter((k): k is Kubeconfig => k !== null)
  return { items: items.sort((a, b) => a.filename.localeCompare(b.filename)), invalid }
}

export async function getKubeconfig(id: string) {
  if (!candidates().includes(id)) return null
  return describe(id, await configView(join(KUBE_DIR, id)), readJson(ENV_FILE, {}))
}

export function setEnvironment(id: string, env: Environment | null) {
  const overrides = readJson<Record<string, Environment>>(ENV_FILE, {})
  if (env) overrides[id] = env
  else delete overrides[id]
  writeJson(ENV_FILE, overrides)
}

const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/

// Validates with kubectl itself on a temporary file before writing. Never overwrites.
export async function saveKubeconfig(filename: string, content: string) {
  const name = basename(filename).replace(/\s+/g, '-')
  const finalName = EXTENSIONS.test(name) ? name : `${name}.yaml`
  if (!SAFE_NAME.test(finalName)) throw new ClusterError(say({ en: 'invalid file name: use letters, numbers, dot, hyphen and underscore', pt: 'nome de arquivo inválido: use letras, números, ponto, hífen e sublinhado' }))
  if (content.length > 1024 * 1024) throw new ClusterError(say({ en: 'a file larger than 1 MB does not look like a kubeconfig', pt: 'arquivo maior que 1 MB não parece um kubeconfig' }))
  const target = join(KUBE_DIR, finalName)
  if (existsSync(target)) throw new ClusterError(say({ en: `${finalName} already exists in ${KUBE_DIR}; rename the file or remove the old one first`, pt: `já existe ${finalName} em ${KUBE_DIR}; renomeie o arquivo ou remova o antigo antes` }), 409)

  const tmp = mkdtempSync(join(tmpdir(), 'kubeconfig-'))
  try {
    writeFileSync(join(tmp, 'k.yaml'), content, { mode: 0o600 })
    const view = await configView(join(tmp, 'k.yaml')).catch(e => {
      throw new ClusterError((e as Error).message, 422)
    })
    if (!view.contexts?.length || !view.clusters?.length) throw new ClusterError(say({ en: 'kubeconfig with no context or cluster', pt: 'kubeconfig sem contexto ou cluster' }))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  mkdirSync(KUBE_DIR, { recursive: true })
  writeFileSync(target, content, { mode: 0o600 })
  return finalName
}

// ~/.kube/config is the default of every kubectl on the machine: removing it here would break other tools.
export function deleteKubeconfig(id: string) {
  if (id === 'config') throw new ClusterError(say({ en: '~/.kube/config is not removed by the panel; it is the default of every kubectl on the machine', pt: 'o ~/.kube/config não é removido pelo painel; ele é o padrão de todo kubectl da máquina' }))
  if (!candidates().includes(id)) throw new ClusterError(say({ en: 'kubeconfig not found', pt: 'kubeconfig não encontrado' }), 404)
  unlinkSync(join(KUBE_DIR, id))
  setEnvironment(id, null)
}
