// Runbooks executáveis: procedimentos em Markdown cujos blocos ```bash viram passos. Só kubectl roda,
// pelas mesmas travas do Cluster Doctor: decide() analisa a linha (uma chamada, sem shell, sem trocar
// de cluster, sem Secret) e authorizeMutation() aplica a política do ambiente. Leitura roda direto;
// escrita só com confirmação. O comando sai sempre do arquivo, nunca do pedido.
// Autoteste: node server/lib/runbooks/runbooks.ts --selfcheck

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { DEFAULT_RUNBOOKS_DIR, dataFile, expandHome } from '../paths.ts'
import { readJson, writeJson } from '../jsonFile.ts'
import { appendAudit } from '../auditLog.ts'
import { decide } from '../doctorAi/command.ts'
import { authorizeMutation, type Environment } from '../k8s/policy.ts'
import { say } from '../i18n.ts'

export type Segment = { type: 'text'; md: string } | { type: 'step'; id: number; line: string; vars: string[] }

const CONFIG = dataFile('runbooks.json')
export const AUDIT = dataFile('runbook-audit.log')

export const DEFAULT_ROOT = DEFAULT_RUNBOOKS_DIR

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

export function listRunbooks(root: string): { file: string; title: string }[] {
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

// Caminho relativo vindo da tela: tem que cair dentro da pasta dos runbooks.
export function runbookPath(root: string, file: string): string {
  const full = resolve(root, file)
  if (!full.startsWith(resolve(root) + sep) || !full.endsWith('.md')) throw new Error(say({ en: 'runbook outside the configured folder', pt: 'runbook fora da pasta configurada' }))
  return full
}

const VAR = /\{\{\s*([a-zA-Z][\w-]{0,40})\s*\}\}/g

// Texto vira bloco de texto; cada linha não vazia (e não comentário) de um bloco bash/sh/shell vira um passo.
export function parseRunbook(md: string): Segment[] {
  const out: Segment[] = []
  let text: string[] = []
  let id = 0
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^```\s*(bash|sh|shell|console)?\s*$/)
    if (!fence || !fence[1]) {
      text.push(lines[i])
      continue
    }
    if (text.join('').trim()) out.push({ type: 'text', md: text.join('\n') })
    text = []
    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) {
      const line = lines[i].trim().replace(/^\$\s+/, '')
      if (!line || line.startsWith('#')) continue
      out.push({ type: 'step', id: id++, line, vars: [...new Set([...line.matchAll(VAR)].map(m => m[1]))] })
    }
  }
  if (text.join('').trim()) out.push({ type: 'text', md: text.join('\n') })
  return out
}

// Valor de variável entra num comando: só o que cabe num nome do Kubernetes ou num seletor simples.
const VALUE = /^[a-z0-9]([a-z0-9.=_/-]{0,251}[a-z0-9])?$/i

export function fill(line: string, values: Record<string, string>): string {
  return line.replace(VAR, (_all, name: string) => {
    const v = values[name]
    if (v === undefined || v === '') throw new Error(say({ en: `fill in the variable ${name}`, pt: `preencha a variável ${name}` }))
    if (!VALUE.test(v)) throw new Error(say({ en: `invalid value for ${name}: use only letters, numbers, dot, hyphen, slash and =`, pt: `valor inválido para ${name}: use só letras, números, ponto, hífen, barra e =` }))
    return v
  })
}

export type Classified =
  | { kind: 'read'; args: string[] }
  | { kind: 'write'; args: string[]; action: string }
  | { kind: 'blocked'; reason: string }

export function classify(line: string, values: Record<string, string>, env: Environment | null): Classified {
  let filled: string
  try {
    filled = fill(line, values)
  } catch (e) {
    return { kind: 'blocked', reason: (e as Error).message }
  }
  const d = decide(filled)
  if (!d.ok) return { kind: 'blocked', reason: d.reason }
  if (d.action === 'read') return { kind: 'read', args: d.args }
  const auth = authorizeMutation(env, d.action)
  return auth.allowed ? { kind: 'write', args: d.args, action: d.action } : { kind: 'blocked', reason: auth.reason }
}

// Toda execução fica registrada: quem rodou o quê, em qual cluster, com qual resultado.
export function audit(entry: { file: string; step: number; command: string; context: string; environment: Environment | null; kind: string; ok: boolean }) {
  appendAudit(AUDIT, entry)
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const md = [
    '# Pod em CrashLoop',
    'Confira os pods:',
    '```bash',
    '# comentário não vira passo',
    'kubectl get pods -n {{namespace}}',
    '$ kubectl logs deploy/{{app}} -n {{namespace}} --tail=50',
    '```',
    'Se for memória, reinicie:',
    '```bash',
    'kubectl rollout restart deployment/{{app}} -n {{namespace}}',
    'kubectl delete pod -l app={{app}} -n {{namespace}}',
    'curl http://exemplo.com',
    '```',
    '```yaml',
    'apiVersion: v1',
    '```',
  ].join('\n')
  const segs = parseRunbook(md)
  const steps = segs.filter(s => s.type === 'step') as Extract<Segment, { type: 'step' }>[]
  assert.deepEqual(steps.map(s => s.line), [
    'kubectl get pods -n {{namespace}}',
    'kubectl logs deploy/{{app}} -n {{namespace}} --tail=50',
    'kubectl rollout restart deployment/{{app}} -n {{namespace}}',
    'kubectl delete pod -l app={{app}} -n {{namespace}}',
    'curl http://exemplo.com',
  ])
  assert.deepEqual(steps[1].vars, ['app', 'namespace'])
  assert.ok(segs.some(s => s.type === 'text' && s.md.includes('apiVersion: v1')), 'bloco yaml fica como texto')

  const v = { namespace: 'loja', app: 'api' }
  assert.equal(classify(steps[0].line, v, 'PRO').kind, 'read', 'leitura vale até em PRO')
  assert.deepEqual(classify(steps[2].line, v, 'HML'), { kind: 'write', args: ['rollout', 'restart', 'deployment/api', '-n', 'loja'], action: 'restart' })
  assert.equal(classify(steps[2].line, v, 'PRO').kind, 'blocked', 'PRO não escreve')
  assert.equal(classify(steps[3].line, v, 'DES').kind, 'blocked', 'DES não apaga')
  assert.match((classify(steps[4].line, v, 'DES') as { reason: string }).reason, /só o kubectl/)
  assert.match((classify(steps[0].line, {}, 'DES') as { reason: string }).reason, /preencha a variável namespace|fill in the variable namespace/)
  for (const bad of ['loja; rm -rf ~', '$(id)', 'a b', '--all-namespaces']) {
    assert.equal(classify(steps[0].line, { namespace: bad }, 'DES').kind, 'blocked', `valor ${bad}`)
  }
  assert.equal(classify('kubectl get secret db -n x -o yaml', {}, 'DES').kind, 'blocked', 'Secret nunca')
  assert.equal(classify('kubectl get pods --context=outro', {}, 'DES').kind, 'blocked', 'não troca de cluster')

  const root = mkdtempSync(join(tmpdir(), 'runbooks-'))
  try {
    mkdirSync(join(root, 'k8s'))
    writeFileSync(join(root, 'k8s', 'crash.md'), md)
    writeFileSync(join(root, 'leia.txt'), 'x')
    assert.deepEqual(listRunbooks(root), [{ file: join('k8s', 'crash.md'), title: 'Pod em CrashLoop' }])
    assert.throws(() => runbookPath(root, '../fora.md'), /fora da pasta|outside the configured folder/)
    assert.throws(() => runbookPath(root, 'leia.txt'), /fora da pasta|outside the configured folder/)
    assert.equal(runbookPath(root, 'k8s/crash.md'), join(root, 'k8s', 'crash.md'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  assert.ok(statSync(DEFAULT_ROOT, { throwIfNoEntry: false })?.isDirectory(), 'pasta padrão do projeto existe')
  const bundled = listRunbooks(DEFAULT_ROOT)
  assert.ok(bundled.length >= 16, 'runbooks padrão do projeto encontrados')
  // Em HML tudo que o painel aceita fica liberado (leitura, restart, scale); passo bloqueado lá é erro do runbook.
  for (const r of bundled) {
    for (const s of parseRunbook(readFileSync(runbookPath(DEFAULT_ROOT, r.file), 'utf-8'))) {
      if (s.type !== 'step') continue
      const c = classify(s.line, Object.fromEntries(s.vars.map(v => [v, 'x1'])), 'HML')
      assert.notEqual(c.kind, 'blocked', `${r.file}: passo bloqueado: ${s.line} (${c.kind === 'blocked' ? c.reason : ''})`)
    }
  }
  assert.equal(readRoot(), DEFAULT_ROOT, 'readRoot sem config retorna DEFAULT_ROOT')
  console.log('runbooks selfcheck: ok')
}

