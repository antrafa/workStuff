// Parsers da saída de cada CLI de IA. Funções puras, para o autoteste rodar sem os CLIs.
// Autoteste: node server/lib/aiModels.ts --selfcheck

import assert from 'node:assert/strict'

export type Model = {
  id: string
  label: string
  alias?: boolean
  recommended?: boolean
  efforts?: string[]
  defaultEffort?: string
}

// Claude Code não lista modelos; o --help cita os apelidos que sempre apontam para a versão mais nova.
// Opus fica como recomendado por equilibrar capacidade e custo: escolha minha, ajuste aqui se mudar.
const PREFERRED_CLAUDE_ALIAS = 'opus'

// Níveis aceitos por --effort, como o próprio --help lista: "(low, medium, high)" ou "(low|medium|high)".
export function parseEfforts(help: string): string[] | undefined {
  const flat = help.replace(/\s+/g, ' ')
  const list = flat.match(/--effort\b[^(]*\(([a-z|, ]+)\)/i)?.[1]
  const efforts = list?.split(/[|,]/).map(s => s.trim()).filter(Boolean)
  return efforts?.length ? efforts : undefined
}

export function parseClaudeHelp(help: string): Model[] {
  const efforts = parseEfforts(help)
  const sentence = help.replace(/\s+/g, ' ').match(/alias for the latest model \(e\.g\. ([^)]*)\)/i)
  if (!sentence) throw new Error('o --help do claude não cita mais os apelidos de modelo; o formato mudou')
  const aliases = [...sentence[1].matchAll(/'([\w.-]+)'/g)].map(m => m[1])
  if (aliases.length === 0) throw new Error('nenhum apelido de modelo encontrado no --help do claude')
  return aliases.map(id => ({
    id,
    label: id[0].toUpperCase() + id.slice(1),
    alias: true,
    recommended: id === PREFERRED_CLAUDE_ALIAS,
    efforts,
    defaultEffort: efforts?.includes('medium') ? 'medium' : undefined,
  }))
}

type CodexCatalog = {
  models: {
    slug: string
    display_name: string
    visibility: string
    priority: number
    default_reasoning_level?: string
    supported_reasoning_levels?: { effort: string }[]
  }[]
}

// Só os modelos com visibility "list" aparecem no seletor do próprio Codex; os "hide" são internos.
export function parseCodexCatalog(json: string): Model[] {
  const catalog = JSON.parse(json) as CodexCatalog
  if (!Array.isArray(catalog.models)) throw new Error('codex debug models não devolveu a lista "models"')
  return catalog.models
    .filter(m => m.visibility === 'list')
    .sort((a, b) => a.priority - b.priority)
    .map((m, i) => ({
      id: m.slug,
      label: m.display_name,
      recommended: i === 0,
      efforts: m.supported_reasoning_levels?.map(l => l.effort),
      defaultEffort: m.default_reasoning_level,
    }))
}

// Formato: uma linha por modelo, "<id>\t<nome>"; linhas de progresso ("Fetching…") não têm tab.
export function parseAgyModels(output: string, help = ''): Model[] {
  const efforts = parseEfforts(help)
  return output
    .split('\n')
    .map(line => line.split('\t'))
    .filter(parts => parts.length >= 2 && parts[0].trim())
    .map(([id, label], i) => ({ id: id.trim(), label: label.trim(), recommended: i === 0, efforts, defaultEffort: efforts?.includes('medium') ? 'medium' : undefined }))
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.deepEqual(parseEfforts('  --effort <level>   Effort level for the current session\n                     (low, medium, high, xhigh, max)'), ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(parseEfforts('  --effort   Reasoning effort for the current CLI session (low|medium|high|max)'), ['low', 'medium', 'high', 'max'])
  assert.equal(parseEfforts('sem a flag'), undefined)

  const help = `  --model <model>    Model for the current session. Provide
                     an alias for the latest model (e.g.
                     'fable', 'opus', or 'sonnet') or a model's full name`
  assert.deepEqual(parseClaudeHelp(help).map(m => m.id), ['fable', 'opus', 'sonnet'])
  assert.equal(parseClaudeHelp(help).find(m => m.recommended)?.id, 'opus')
  assert.throws(() => parseClaudeHelp('--model <model>  Model name'), /formato mudou/)

  const codex = JSON.stringify({
    models: [
      { slug: 'gpt-reserve', display_name: 'GPT-Reserve', visibility: 'hide', priority: 4 },
      { slug: 'gpt-5.6-luna', display_name: 'GPT-5.6-Luna', visibility: 'list', priority: 9 },
      { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6-Terra', visibility: 'list', priority: 8, default_reasoning_level: 'medium', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }] },
    ],
  })
  const codexModels = parseCodexCatalog(codex)
  assert.deepEqual(codexModels.map(m => m.id), ['gpt-5.6-terra', 'gpt-5.6-luna'])
  assert.deepEqual(codexModels[0].efforts, ['low', 'high'])
  assert.equal(codexModels[0].recommended, true)

  const agy = 'Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n'
  assert.deepEqual(parseAgyModels(agy).map(m => m.id), ['gemini-3.8-flash-high', 'claude-sonnet-4-6'])

  console.log('aiModels selfcheck: ok')
}
