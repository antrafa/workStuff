// Política de escrita no cluster por ambiente.
// Ambiente desconhecido vale como PRO: na dúvida, somente leitura.
// Autoteste: node server/lib/k8s/policy.ts --selfcheck
import assert from 'node:assert/strict'

export type Environment = 'DES' | 'ITG' | 'HML' | 'PRO'
export type Mutation = 'restart' | 'edit' | 'delete' | 'node'

// Toda escrita permitida ainda passa pela confirmação do usuário; aqui se decide se ela pode existir.
export function authorizeMutation(env: Environment | null, action: Mutation): { allowed: true } | { allowed: false; reason: string } {
  if (env === 'PRO') return { allowed: false, reason: 'PRO é somente leitura: nenhuma ação de escrita é executada pelo painel' }
  if (env === null) return { allowed: false, reason: 'ambiente não classificado vale como PRO (somente leitura); classifique o kubeconfig como DES, ITG ou HML' }
  if (action === 'node') return { allowed: false, reason: 'cordon, drain e taint de node não são executados pelo painel em nenhum ambiente' }
  if (env === 'DES' && action === 'delete') return { allowed: false, reason: 'DES nunca apaga recurso pelo painel; prefira rollout restart' }
  return { allowed: true }
}

// Classificação automática pelo nome do arquivo/contexto; a primeira que casa vence, PRO primeiro.
const PATTERNS: [Environment, RegExp][] = [
  ['PRO', /(^|[^a-z])(pro|prod|production|prd|producao)([^a-z]|$)/i],
  ['HML', /(^|[^a-z])(hml|homolog|homologacao|staging|stg)([^a-z]|$)/i],
  ['ITG', /(^|[^a-z])(itg|integra|integration)([^a-z]|$)/i],
  ['DES', /(^|[^a-z])(des|dev|development)([^a-z]|$)/i],
]

export function detectEnvironment(...names: string[]): Environment | null {
  for (const [env, re] of PATTERNS) if (names.some(n => re.test(n))) return env
  return null
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.equal(authorizeMutation('HML', 'restart').allowed, true)
  assert.equal(authorizeMutation('DES', 'restart').allowed, true)
  assert.equal(authorizeMutation('PRO', 'restart').allowed, false)
  assert.equal(authorizeMutation(null, 'restart').allowed, false, 'sem classificação = PRO')
  assert.equal(authorizeMutation('DES', 'delete').allowed, false, 'DES nunca apaga')
  assert.equal(authorizeMutation('HML', 'delete').allowed, true)
  assert.equal(authorizeMutation('ITG', 'edit').allowed, true)
  assert.equal(authorizeMutation('HML', 'node').allowed, false, 'node nunca')
  assert.equal(authorizeMutation('PRO', 'edit').allowed, false)
  assert.equal(detectEnvironment('loja-pro'), 'PRO')
  assert.equal(detectEnvironment('erp-prd'), 'PRO')
  assert.equal(detectEnvironment('portal-norte-pro-oke'), 'PRO')
  assert.equal(detectEnvironment('erp-hml-k8s'), 'HML')
  assert.equal(detectEnvironment('loja-des-oci'), 'DES')
  assert.equal(detectEnvironment('erp-pre'), null, 'pré-produção não é classificada sozinha: vale como PRO')
  assert.equal(detectEnvironment('loja-pro-joao'), 'PRO')
  assert.equal(detectEnvironment('lab-local'), null)
  assert.equal(detectEnvironment('project-x'), null, '"pro" dentro de palavra não conta')
  console.log('k8s policy selfcheck: ok')
}
