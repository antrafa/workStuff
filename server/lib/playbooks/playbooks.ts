// Playbooks de IA: procedimentos em Markdown cujos blocos ```prompt ou ```ai viram passos
// executados pelos modelos de IA configurados no painel, com streaming em tempo real.
// Autoteste: node server/lib/playbooks/playbooks.ts --selfcheck

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { DEFAULT_PLAYBOOKS_DIR, dataFile, expandHome } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'

export type Segment =
  | { type: 'text'; md: string }
  | { type: 'step'; id: number; title: string; prompt: string; vars: string[] }

const CONFIG = dataFile('playbooks.json')
export const DEFAULT_ROOT = DEFAULT_PLAYBOOKS_DIR

export const readRoot = (): string => {
  const configured = readJson<{ root: string | null }>(CONFIG, { root: null }).root
  if (configured && configured !== 'default') {
    const expanded = expandHome(configured)
    if (statSync(expanded, { throwIfNoEntry: false })?.isDirectory()) {
      return expanded
    }
  }
  return DEFAULT_ROOT
}

export const saveRoot = (root: string) => writeJson(CONFIG, { root })

export function listPlaybooks(root: string): { file: string; title: string }[] {
  const out: { file: string; title: string }[] = []
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) return out
  const walk = (dir: string, depth: number) => {
    if (depth > 3 || out.length >= 300) return
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const full = join(dir, name)
      const st = statSync(full, { throwIfNoEntry: false })
      if (st?.isDirectory()) walk(full, depth + 1)
      else if (st?.isFile() && name.endsWith('.md') && st.size < 512 * 1024) {
        const title = readFileSync(full, 'utf-8').match(/^#\s+(.+)$/m)?.[1]?.trim() ?? name.replace(/\.md$/, '')
        out.push({ file: relative(root, full), title })
      }
    }
  }
  walk(root, 0)
  return out
}

export function playbookPath(root: string, file: string): string {
  const full = resolve(root, file)
  if (!full.startsWith(resolve(root) + sep) || !full.endsWith('.md')) throw new Error('playbook fora da pasta configurada')
  return full
}

const VAR = /\{\{\s*([a-zA-Z][\w-]{0,40})\s*\}\}/g

export function parsePlaybook(md: string): Segment[] {
  const out: Segment[] = []
  let text: string[] = []
  let id = 0
  const lines = md.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^```\s*(prompt|ai)(?::([^\n]+))?\s*$/)
    if (!fence) {
      text.push(lines[i])
      continue
    }
    if (text.join('').trim()) out.push({ type: 'text', md: text.join('\n') })
    text = []

    const blockLines: string[] = []
    let stepTitle = fence[2]?.trim() ?? ''
    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) {
      blockLines.push(lines[i])
    }

    // Se a primeira linha for um comentário ou título com #, usa como título do passo
    let promptLines = blockLines
    if (!stepTitle && blockLines.length > 0 && /^#\s+(.+)$/.test(blockLines[0])) {
      stepTitle = blockLines[0].replace(/^#\s+/, '').trim()
      promptLines = blockLines.slice(1)
    }

    const prompt = promptLines.join('\n').trim()
    if (!prompt) continue

    const vars = [...new Set([...prompt.matchAll(VAR)].map(m => m[1]))]
    out.push({
      type: 'step',
      id: id++,
      title: stepTitle || `Passo ${id}`,
      prompt,
      vars,
    })
  }

  if (text.join('').trim()) out.push({ type: 'text', md: text.join('\n') })
  return out
}

export function fill(prompt: string, values: Record<string, string>, previousOutput?: string): string {
  const merged = { ...values }
  if (previousOutput !== undefined) {
    if (!merged['passo_anterior']) merged['passo_anterior'] = previousOutput
    if (!merged['resultado']) merged['resultado'] = previousOutput
  }
  return prompt.replace(VAR, (_all, name: string) => {
    const v = merged[name]
    if (v === undefined || v === '') throw new Error(`preencha a variável ${name}`)
    return v
  })
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const md = [
    '# Revisão de Código',
    'Procedimento de revisão com IA:',
    '```prompt',
    '# Analisar bugs e lógica',
    'Analise as alterações no projeto {{projeto}}:',
    '{{contexto}}',
    '```',
    'Agora a segunda parte:',
    '```ai:Padrões de projeto',
    'Com base na saída anterior:',
    '{{passo_anterior}}',
    'Avalie os padrões.',
    '```',
    '```yaml',
    'key: value',
    '```',
  ].join('\n')

  const segs = parsePlaybook(md)
  const steps = segs.filter(s => s.type === 'step') as Extract<Segment, { type: 'step' }>[]
  assert.equal(steps.length, 2)
  assert.equal(steps[0].title, 'Analisar bugs e lógica')
  assert.deepEqual(steps[0].vars, ['projeto', 'contexto'])
  assert.equal(steps[1].title, 'Padrões de projeto')
  assert.deepEqual(steps[1].vars, ['passo_anterior'])
  assert.ok(segs.some(s => s.type === 'text' && s.md.includes('key: value')), 'bloco yaml permanece como texto')

  const filled0 = fill(steps[0].prompt, { projeto: 'meu-app', contexto: 'diff aqui' })
  assert.ok(filled0.includes('Analise as alterações no projeto meu-app:\ndiff aqui'))

  const filled1 = fill(steps[1].prompt, {}, 'resultado do passo 1')
  assert.ok(filled1.includes('resultado do passo 1'))

  assert.throws(() => fill(steps[0].prompt, { projeto: 'meu-app' }), /preencha a variável contexto/)

  const root = mkdtempSync(join(tmpdir(), 'playbooks-'))
  try {
    mkdirSync(join(root, 'eng'))
    writeFileSync(join(root, 'eng', 'rev.md'), md)
    writeFileSync(join(root, 'outro.txt'), 'x')
    assert.deepEqual(listPlaybooks(root), [{ file: join('eng', 'rev.md'), title: 'Revisão de Código' }])
    assert.throws(() => playbookPath(root, '../fora.md'), /fora da pasta/)
    assert.throws(() => playbookPath(root, 'outro.txt'), /fora da pasta/)
    assert.equal(playbookPath(root, 'eng/rev.md'), join(root, 'eng', 'rev.md'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  assert.ok(statSync(DEFAULT_ROOT, { throwIfNoEntry: false })?.isDirectory(), 'pasta padrão de playbooks existe')
  assert.ok(listPlaybooks(DEFAULT_ROOT).length >= 7, 'playbooks padrão do projeto encontrados')
  assert.equal(readRoot(), DEFAULT_ROOT, 'readRoot sem config retorna DEFAULT_ROOT')
  console.log('playbooks selfcheck: ok')
}
