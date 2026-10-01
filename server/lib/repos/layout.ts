// Onde cada repositório vai no disco: workspace + caminho no GitLab/GitHub sem o grupo base.
// Ex.: base "minha-empresa/area", projeto ".../area/produto/backend/servicos/api"
//      → <workspace>/produto/backend/servicos/api
// Autoteste: node server/lib/repos/layout.ts --selfcheck

import assert from 'node:assert/strict'
import { join, resolve, sep } from 'node:path'

const SEGMENT = /^[A-Za-z0-9._-]+$/

export const normalizePath = (p: string) => p.trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/')

// Caminho relativo à base. Fora da base é recusado: clonar para fora dela não teria lugar previsível.
export function relativeToBase(fullPath: string, basePath: string): string {
  const full = normalizePath(fullPath)
  const base = normalizePath(basePath)
  if (!base) return full
  if (full === base) return ''
  if (!full.startsWith(`${base}/`)) throw new Error(`${full} está fora do grupo base ${base}`)
  return full.slice(base.length + 1)
}

export function localPathFor(workspace: string, basePath: string, fullPath: string): string {
  const rel = relativeToBase(fullPath, basePath)
  const segments = rel ? rel.split('/') : []
  // Nomes vêm da API do provedor; ainda assim nada de "..", barra invertida ou caractere de shell.
  for (const s of segments) if (!SEGMENT.test(s) || s === '.' || s === '..') throw new Error(`nome de pasta inválido vindo do provedor: ${s}`)
  const root = resolve(workspace)
  const target = resolve(join(root, ...segments))
  if (target !== root && !target.startsWith(root + sep)) throw new Error('o destino sairia da pasta do workspace')
  return target
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const base = 'minha-empresa/area'
  assert.equal(localPathFor('/home/u/workspace', base, `${base}/produto/backend/servicos`), '/home/u/workspace/produto/backend/servicos')
  assert.equal(localPathFor('/home/u/workspace', base, `${base}/produto/backend/servicos/api`), '/home/u/workspace/produto/backend/servicos/api')
  assert.equal(localPathFor('/home/u/workspace', `/${base}/`, `${base}/produto`), '/home/u/workspace/produto', 'barras nas pontas da base')
  assert.equal(localPathFor('/w', '', 'org/repo'), '/w/org/repo', 'sem base: caminho inteiro')
  assert.equal(localPathFor('/w', 'org', 'org/repo'), '/w/repo', 'GitHub com a org como base')
  assert.equal(localPathFor('/w', base, base), '/w', 'o próprio grupo base é a raiz do workspace')
  assert.throws(() => localPathFor('/w', base, 'minha-empresa/outra/x'), /fora do grupo base/)
  assert.throws(() => localPathFor('/w', 'org', 'org-x/repo'), /fora do grupo base/, 'prefixo parecido não conta')
  assert.throws(() => localPathFor('/w', '', 'org/../etc'), /inválido/)
  assert.throws(() => localPathFor('/w', '', 'org/a b'), /inválido/)
  console.log('repos layout selfcheck: ok')
}
