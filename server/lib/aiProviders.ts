import { dataFile } from './paths.ts'
import { say } from './i18n.ts'
import { readJson, writeJson } from './jsonFile.ts'
import { run, runHelp, which } from './run.ts'
import { parseAgyModels, parseClaudeHelp, parseCodexCatalog, type Model } from './aiModels.ts'

export type ProviderId = 'claude' | 'agy' | 'codex'

type ModelSource = { kind: 'alias' | 'cli'; command: string }

type ProviderMeta = {
  name: string
  bin: string
  // Só o Claude aceita hook PreToolUse por invocação: é o que nega de verdade um comando de escrita.
  nativeGuard: boolean
  source: ModelSource
  listModels: (bin: string) => Promise<Model[]>
}

const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  claude: {
    name: 'Claude Code', bin: 'claude', nativeGuard: true,
    source: { kind: 'alias', command: 'claude --help' },
    listModels: async bin => parseClaudeHelp(await runHelp(bin)),
  },
  agy: {
    name: 'Google Antigravity', bin: 'agy', nativeGuard: false,
    source: { kind: 'cli', command: 'agy models' },
    listModels: async bin => parseAgyModels(await run(bin, ['models'], 60_000), await runHelp(bin)),
  },
  codex: {
    name: 'OpenAI Codex', bin: 'codex', nativeGuard: false,
    source: { kind: 'cli', command: 'codex debug models' },
    listModels: async bin => parseCodexCatalog(await run(bin, ['debug', 'models'])),
  },
}

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]
export const isProviderId = (v: unknown): v is ProviderId => PROVIDER_IDS.includes(v as ProviderId)

// Última leitura de cada CLI. A lista nunca é fixa no código: vem do CLI e só muda quando o usuário
// pede "Atualizar lista" ou quando ainda não existe leitura.
// ponytail: sem expiração automática; se a lista ficar velha sem ninguém notar, refazer a leitura depois de N dias.
type CacheEntry = { models: Model[]; fetchedAt: string; error?: string }
const CACHE_FILE = dataFile('models-cache.json')

export type ProviderInfo = {
  id: ProviderId
  name: string
  bin: string
  installed: boolean
  path: string | null
  nativeGuard: boolean
  models: Model[]
  source: ModelSource & { fetchedAt: string | null; error: string | null }
}

async function readModels(id: ProviderId, path: string, force: boolean): Promise<CacheEntry> {
  const cache = readJson<Partial<Record<ProviderId, CacheEntry>>>(CACHE_FILE, {})
  const cached = cache[id]
  if (cached && !force) return cached

  let entry: CacheEntry
  try {
    entry = { models: await PROVIDERS[id].listModels(path), fetchedAt: new Date().toISOString() }
  } catch (e) {
    // A failed read keeps the previous list: it shows the error and keeps what was already known.
    const failed = (e as Error).message
    const command = PROVIDERS[id].source.command
    entry = { models: cached?.models ?? [], fetchedAt: cached?.fetchedAt ?? new Date().toISOString(), error: say({ en: `${command} failed: ${failed}`, pt: `${command} falhou: ${failed}` }) }
  }
  writeJson(CACHE_FILE, { ...readJson(CACHE_FILE, {}), [id]: entry })
  return entry
}

export async function getProvider(id: ProviderId, { refresh = false } = {}): Promise<ProviderInfo> {
  const meta = PROVIDERS[id]
  const path = await which(meta.bin)
  const entry = path ? await readModels(id, path, refresh) : null
  return {
    id,
    name: meta.name,
    bin: meta.bin,
    installed: Boolean(path),
    path,
    nativeGuard: meta.nativeGuard,
    models: entry?.models ?? [],
    source: { ...meta.source, fetchedAt: entry?.fetchedAt ?? null, error: entry?.error ?? null },
  }
}

export const getProviders = () => Promise.all(PROVIDER_IDS.map(id => getProvider(id)))
