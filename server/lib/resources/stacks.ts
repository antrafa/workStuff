import { dataFile } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { GitlabError, gitlabAllPages, gitlabText, type GitlabConn } from '../gitlab/client.ts'
import { cpuMillis, memMi, parseEnvVars, parseResources, resolveResources, type Resources } from './manifest.ts'
import { currentOrigin, type Origin } from './config.ts'
import { say } from '../i18n.ts'

export type Stack = { name: string; projectId: number; projectUrl: string; defaultBranch: string }
export type Client = { name: string; stacks: Stack[] }
export type Service = Resources & {
  path: string
  app: string
  service: string
  memReqMi: number | null
  memLimMi: number | null
  cpuReqMillis: number | null
  cpuLimMillis: number | null
}

type Cache = {
  metaFetchedAt: string | null
  clients: Client[]
  stacks: Record<string, StackEntry>
}

// failed: manifests que o GitLab não entregou nesta leitura (timeout, 5xx). A stack sai com o resto.
type StackEntry = { fetchedAt: string; services: Service[]; failed?: string[] }

// Um cache por origem (URL + grupo): trocar a origem nunca mostra dado da anterior.
const FILE = dataFile('resources-cache-by-origin.json')
const EMPTY: Cache = { metaFetchedAt: null, clients: [], stacks: {} }

function readAll(): Record<string, Cache> {
  return readJson<Record<string, Cache>>(FILE, {})
}

function readCache(key: string): Cache {
  const all = readAll()
  return all[key] ?? EMPTY
}

function writeCache(key: string, patch: Partial<Cache>) {
  const all = readAll()
  writeJson(FILE, { ...all, [key]: { ...(all[key] ?? EMPTY), ...patch } })
}

function withNumbers(s: Omit<Service, 'memReqMi' | 'memLimMi' | 'cpuReqMillis' | 'cpuLimMillis'>): Service {
  return { ...s, memReqMi: memMi(s.memReq), memLimMi: memMi(s.memLim), cpuReqMillis: cpuMillis(s.cpuReq), cpuLimMillis: cpuMillis(s.cpuLim) }
}

// Duas abas pedindo a mesma leitura esperam a mesma promessa, em vez de dobrar as chamadas ao GitLab.
const inFlight = new Map<string, Promise<unknown>>()
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key) as Promise<T> | undefined
  if (running) return running
  const p = fn().finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

type GitlabProject = { id: number; name: string; web_url: string; default_branch: string | null; namespace: { full_path: string } }

// Clientes = subgrupos diretos do grupo; projetos soltos no próprio grupo entram como um cliente com o nome dele.
async function fetchClients(o: Origin): Promise<Client[]> {
  const projects = await gitlabAllPages<GitlabProject>(o.conn, `/groups/${encodeURIComponent(o.groupPath)}/projects?include_subgroups=true&archived=false&with_statistics=false`)
  const byClient = new Map<string, Stack[]>()
  for (const p of projects) {
    const ns = p.namespace.full_path
    const client = ns === o.groupPath ? o.groupPath.split('/').pop()! : ns.startsWith(`${o.groupPath}/`) ? ns.slice(o.groupPath.length + 1) : null
    if (!client || client.includes('/')) continue // só o primeiro nível abaixo do grupo é cliente
    byClient.set(client, [...(byClient.get(client) ?? []), { name: p.name, projectId: p.id, projectUrl: p.web_url, defaultBranch: p.default_branch || 'main' }])
  }
  return [...byClient].map(([name, stacks]) => ({ name, stacks })).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getClients(refresh = false) {
  const o = await currentOrigin()
  const cache = readCache(o.key)
  if (cache.metaFetchedAt && !refresh) return { fetchedAt: cache.metaFetchedAt, clients: cache.clients }
  const clients = await once(`clients:${o.key}`, () => fetchClients(o))
  const fetchedAt = new Date().toISOString()
  writeCache(o.key, { metaFetchedAt: fetchedAt, clients })
  return { fetchedAt, clients }
}

function findStack(o: Origin, projectId: number) {
  const stack = readCache(o.key).clients.flatMap(c => c.stacks).find(s => s.projectId === projectId)
  if (!stack) throw new GitlabError(say({ en: 'unknown stack; refresh the client list', pt: 'stack desconhecida; atualize a lista de clientes' }), 404)
  return stack
}

const rawPath = (projectId: number, path: string, ref: string) =>
  `/projects/${projectId}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`

// Limita as chamadas simultâneas ao GitLab para não levar 429.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

type TreeEntry = { type: string; path: string }

// Um arquivo lento não derruba a leitura da stack: vira item de "failed" e a tela avisa quais foram.
async function readOrFail(c: GitlabConn, projectId: number, path: string, ref: string, failed: string[]) {
  try {
    return await gitlabText(c, rawPath(projectId, path, ref))
  } catch (e) {
    if (!(e instanceof GitlabError) || e.status === 401) throw e
    failed.push(path)
    return null
  }
}

async function fetchStack(c: GitlabConn, stack: Stack): Promise<{ services: Service[]; failed: string[] }> {
  const failed: string[] = []
  const tree = await gitlabAllPages<TreeEntry>(c, `/projects/${stack.projectId}/repository/tree?recursive=true&ref=${encodeURIComponent(stack.defaultBranch)}`)
  const blobs = tree.filter(f => f.type === 'blob')
  const envFiles = blobs.filter(f => f.path.endsWith('.env'))
  const manifests = blobs.filter(f => /\.ya?ml$/.test(f.path) && !f.path.startsWith('_'))

  const envContents = await mapLimit(envFiles, 3, f => readOrFail(c, stack.projectId, f.path, stack.defaultBranch, failed))
  const vars = Object.assign({}, ...envContents.map(c => (c ? parseEnvVars(c) : {})))

  const services = await mapLimit(manifests, 5, async f => {
    const content = await readOrFail(c, stack.projectId, f.path, stack.defaultBranch, failed)
    if (!content) return null
    const resources = resolveResources(parseResources(content), vars)
    if (Object.values(resources).every(v => v === null)) return null
    const parts = f.path.split('/')
    return withNumbers({ path: f.path, app: parts.length > 1 ? parts[0] : '', service: parts.at(-1)!.replace(/\.ya?ml$/, ''), ...resources })
  })
  return { services: services.filter((s): s is Service => s !== null), failed }
}

export async function getStack(projectId: number, refresh = false) {
  const o = await currentOrigin()
  const cached = readCache(o.key).stacks[projectId]
  if (cached && !refresh) return cached
  const stack = findStack(o, projectId)
  const { services, failed } = await once(`stack:${o.key}:${projectId}`, () => fetchStack(o.conn, stack))
  const entry: StackEntry = { fetchedAt: new Date().toISOString(), services, failed }
  writeCache(o.key, { stacks: { ...readCache(o.key).stacks, [projectId]: entry } })
  return entry
}

// Só devolve arquivos que a leitura da stack reconheceu como manifest: não vira leitor genérico do repositório.
export async function getManifest(projectId: number, path: string) {
  const o = await currentOrigin()
  const stack = findStack(o, projectId)
  const known = readCache(o.key).stacks[projectId]?.services.some(s => s.path === path)
  if (!known) throw new GitlabError(say({ en: "file is not one of this stack's manifests", pt: 'arquivo não pertence aos manifests desta stack' }), 404)
  const content = await gitlabText(o.conn, rawPath(projectId, path, stack.defaultBranch))
  if (content === null) throw new GitlabError(say({ en: 'file not found in the repository; refresh the stack', pt: 'arquivo não encontrado no repositório; atualize a stack' }), 404)
  return content
}
