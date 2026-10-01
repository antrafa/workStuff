import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { ClusterError } from './errors.ts'
import { configView, type KubeconfigView } from './kubectl.ts'
import { detectEnvironment, type Environment } from './policy.ts'

// Pasta dos kubeconfigs. Sobrescrevível para testar upload/remoção sem tocar na ~/.kube real.
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

// id = nome do arquivo (inclui a extensão): sem colisão entre a.yaml e a.yml, e sem o bug de abrir .yml.
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

// Valida com o próprio kubectl num arquivo temporário antes de gravar. Nunca sobrescreve.
export async function saveKubeconfig(filename: string, content: string) {
  const name = basename(filename).replace(/\s+/g, '-')
  const finalName = EXTENSIONS.test(name) ? name : `${name}.yaml`
  if (!SAFE_NAME.test(finalName)) throw new ClusterError('nome de arquivo inválido: use letras, números, ponto, hífen e sublinhado')
  if (content.length > 1024 * 1024) throw new ClusterError('arquivo maior que 1 MB não parece um kubeconfig')
  const target = join(KUBE_DIR, finalName)
  if (existsSync(target)) throw new ClusterError(`já existe ${finalName} em ${KUBE_DIR}; renomeie o arquivo ou remova o antigo antes`, 409)

  const tmp = mkdtempSync(join(tmpdir(), 'kubeconfig-'))
  try {
    writeFileSync(join(tmp, 'k.yaml'), content, { mode: 0o600 })
    const view = await configView(join(tmp, 'k.yaml')).catch(e => {
      throw new ClusterError((e as Error).message, 422)
    })
    if (!view.contexts?.length || !view.clusters?.length) throw new ClusterError('kubeconfig sem contexto ou cluster')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  mkdirSync(KUBE_DIR, { recursive: true })
  writeFileSync(target, content, { mode: 0o600 })
  return finalName
}

// O ~/.kube/config é o padrão de todo kubectl da máquina: remover por aqui quebraria outras ferramentas.
export function deleteKubeconfig(id: string) {
  if (id === 'config') throw new ClusterError('o ~/.kube/config não é removido pelo painel; ele é o padrão de todo kubectl da máquina')
  if (!candidates().includes(id)) throw new ClusterError('kubeconfig não encontrado', 404)
  unlinkSync(join(KUBE_DIR, id))
  setEnvironment(id, null)
}
