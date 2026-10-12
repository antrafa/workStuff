// Prompts and envelope parsing for the ideation agents.
// Autoteste: node server/lib/ideation/envelopes.ts --selfcheck

import assert from 'node:assert/strict'
import { extractJsonFromMarkdown } from '../factory/envelopes.ts'
import type { ProjectRepo } from '../factory/types.ts'
import { PHASE_GUIDE } from './agents.ts'
import { renderIdeaMarkdown } from './store.ts'
import { DOC_KEYS, STACKS, type ChallengeAttack, type DocSection, type ExecutableTask, type Idea, type MasterTask, type Question, type Severity, type Stack } from './types.ts'

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : [])
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)

function envelopeInstruction(example: object): string {
  return ['Ao final da resposta, inclua um bloco JSON estrito no formato:', '```json', JSON.stringify(example, null, 2), '```'].join('\n')
}

// The prose before the envelope: what the chat shows.
export function proseOf(output: string): string {
  const fences = [...output.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g)]
  const last = fences.findLast(m => {
    try {
      JSON.parse(m[1])
      return true
    } catch {
      return false
    }
  })
  return (last?.index !== undefined ? output.slice(0, last.index) : output).trim()
}

const reposBlock = (repos: ProjectRepo[]) =>
  repos.length ? `Repositórios do projeto (use estes nomes):\n${repos.map(r => `- ${r.name}: ${r.path}`).join('\n')}` : 'O projeto ainda não tem nenhum repositório git.'

function conversationBlock(idea: Idea, last = 6): string {
  const turns = idea.turns.filter(t => t.role === 'user' || t.role === 'facilitator').slice(-last)
  if (!turns.length) return ''
  return `Últimas rodadas da conversa:\n${turns.map(t => `${t.role === 'user' ? 'Usuário' : 'Facilitador'}: ${t.text}`).join('\n\n')}`
}

// ── Facilitator ──────────────────────────────────────────────────────────────

export type FacilitatorEnvelope = {
  reply: string
  questions: Question[]
  doc: Partial<Record<DocSection, string>>
  recommendation?: 'go' | 'pivot' | 'stop'
  phaseReady: boolean
}

export function formatFacilitatorPrompt(idea: Idea, message: string, repos: ProjectRepo[]): string {
  return [
    PHASE_GUIDE[idea.phase] ?? '',
    reposBlock(repos),
    `Documento atual da ideia:\n\n${renderIdeaMarkdown(idea)}`,
    conversationBlock(idea),
    `Mensagem nova do usuário:\n${message || '(início da fase: abra a primeira rodada)'}`,
    envelopeInstruction({
      questions: [{ question: 'Pergunta objetiva?', recommendation: 'Resposta recomendada' }],
      doc: { problem: 'conteúdo completo da seção, só das seções que mudaram' },
      recommendation: null,
      phaseReady: false,
    }),
  ].filter(Boolean).join('\n\n')
}

export function parseFacilitator(output: string): FacilitatorEnvelope {
  const p = extractJsonFromMarkdown(output) ?? {}
  const doc: Partial<Record<DocSection, string>> = {}
  for (const [k, v] of Object.entries(p.doc ?? {})) {
    // 'original' is the developer's own words and 'mitigations' is rebuilt from the challenge decisions
    if (DOC_KEYS.includes(k as DocSection) && k !== 'original' && k !== 'mitigations' && text(v)) doc[k as DocSection] = text(v)
  }
  const questions = (Array.isArray(p.questions) ? p.questions : [])
    .map((q: any) => ({ question: text(q?.question), recommendation: text(q?.recommendation) }))
    .filter((q: Question) => q.question)
    .slice(0, 3)
  const recommendation = ['go', 'pivot', 'stop'].includes(p.recommendation) ? p.recommendation : undefined
  return { reply: proseOf(output), questions, doc, recommendation, phaseReady: p.phaseReady === true }
}

// ── Red × Blue ───────────────────────────────────────────────────────────────

export type RedEnvelope = { attacks: ChallengeAttack[]; assumptions: string; premortem: string }

function decidedBlock(idea: Idea): string {
  const decided = (idea.challenge ?? []).flatMap(r => r.attacks).filter(a => a.decision)
  if (!decided.length) return ''
  return `Ataques de rodadas anteriores e o que o usuário decidiu (não repita; ataque a versão já mitigada):\n${decided
    .map(a => `- ${a.attack} → ${a.decision}${a.mitigation ? ` (mitigação: ${a.mitigation})` : ''}${a.note ? ` — ${a.note}` : ''}`)
    .join('\n')}`
}

export function formatRedPrompt(idea: Idea, repos: ProjectRepo[]): string {
  return [
    reposBlock(repos),
    `Documento da ideia:\n\n${renderIdeaMarkdown(idea)}`,
    decidedBlock(idea),
    envelopeInstruction({
      attacks: [{ id: 'A1', target: 'premissa atacada', attack: 'o ataque, concreto', severity: 'alta|media|baixa', evidence: 'forte|fraca|nenhuma' }],
      assumptions: '| Premissa | Lente | Importância | Evidência |\n|---|---|---|---|\n| … | D | alta | fraca |',
      premortem: 'Seis meses depois falhou porque…',
    }),
  ].filter(Boolean).join('\n\n')
}

export function parseRed(output: string): RedEnvelope {
  const p = extractJsonFromMarkdown(output) ?? {}
  const attacks: ChallengeAttack[] = (Array.isArray(p.attacks) ? p.attacks : [])
    .map((a: any, i: number) => ({
      id: text(a?.id) || `A${i + 1}`,
      target: text(a?.target),
      attack: text(a?.attack),
      severity: oneOf<Severity>(a?.severity, ['alta', 'media', 'baixa'], 'media'),
      evidence: oneOf(a?.evidence, ['forte', 'fraca', 'nenhuma'] as const, 'nenhuma'),
    }))
    .filter((a: ChallengeAttack) => a.attack)
    .slice(0, 8)
  return { attacks, assumptions: text(p.assumptions), premortem: text(p.premortem) }
}

export function formatBluePrompt(idea: Idea, attacks: ChallengeAttack[], repos: ProjectRepo[]): string {
  return [
    reposBlock(repos),
    `Documento da ideia:\n\n${renderIdeaMarkdown(idea)}`,
    `Ataques do red team:\n${attacks.map(a => `- ${a.id} [${a.severity}, evidência ${a.evidence}] ${a.target}: ${a.attack}`).join('\n')}`,
    envelopeInstruction({ responses: [{ id: 'A1', stance: 'defende|mitiga|concede', argument: 'por quê', mitigation: 'requisito concreto, se mitiga' }] }),
  ].join('\n\n')
}

// Blue's answers merged into the attacks, by id; an attack blue skipped stays unanswered.
export function mergeBlue(attacks: ChallengeAttack[], output: string): ChallengeAttack[] {
  const p = extractJsonFromMarkdown(output) ?? {}
  const responses = new Map<string, any>((Array.isArray(p.responses) ? p.responses : []).map((r: any) => [text(r?.id), r]))
  return attacks.map(a => {
    const r = responses.get(a.id)
    if (!r) return a
    return { ...a, stance: oneOf(r.stance, ['defende', 'mitiga', 'concede'] as const, 'concede'), argument: text(r.argument), mitigation: text(r.mitigation) || undefined }
  })
}

// ── Planner and Splitter ─────────────────────────────────────────────────────

export function formatPlannerPrompt(idea: Idea, repos: ProjectRepo[], instructions: string, previousErrors: string[] = []): string {
  return [
    reposBlock(repos),
    `Ideia refinada:\n\n${renderIdeaMarkdown({ ...idea, masters: undefined, tasks: undefined })}`,
    idea.masters?.length ? `Plano anterior (ajuste em vez de recomeçar, se as instruções pedirem mudança pontual):\n\`\`\`json\n${JSON.stringify(idea.masters, null, 2)}\n\`\`\`` : '',
    instructions ? `Instruções do usuário para este plano:\n${instructions}` : '',
    previousErrors.length ? `A tentativa anterior foi recusada pela verificação. Corrija:\n${previousErrors.map(e => `- ${e}`).join('\n')}` : '',
    envelopeInstruction({
      masters: [{ key: 'M1', title: 'título', objective: 'o que entrega', inScope: ['…'], outOfScope: ['…'], repos: ['nome-do-repo'], newRepos: [], scenarios: ['Cenário: …\n  Dado …\n  Quando …\n  Então …'], dependsOn: [], walkingSkeleton: true }],
    }),
  ].filter(Boolean).join('\n\n')
}

export function parseMasters(output: string): MasterTask[] {
  return normalizeMasters(extractJsonFromMarkdown(output)?.masters)
}

// Also used on the developer's own edits, which arrive as JSON from the screen.
export function normalizeMasters(raw: unknown): MasterTask[] {
  return (Array.isArray(raw) ? raw : []).map((m: any, i: number) => ({
    key: text(m?.key) || `M${i + 1}`,
    title: text(m?.title),
    objective: text(m?.objective),
    inScope: strings(m?.inScope),
    outOfScope: strings(m?.outOfScope),
    repos: strings(m?.repos),
    newRepos: strings(m?.newRepos),
    scenarios: strings(m?.scenarios),
    dependsOn: strings(m?.dependsOn),
    walkingSkeleton: m?.walkingSkeleton === true,
  }))
}

export function formatSplitterPrompt(idea: Idea, master: MasterTask, repos: ProjectRepo[], instructions: string, previousErrors: string[] = []): string {
  const others = (idea.masters ?? []).filter(m => m.key !== master.key)
  return [
    reposBlock(repos),
    `Ideia refinada:\n\n${renderIdeaMarkdown({ ...idea, masters: undefined, tasks: undefined })}`,
    `Master a quebrar:\n\`\`\`json\n${JSON.stringify(master, null, 2)}\n\`\`\``,
    others.length ? `Outras masters do plano (só contexto; não as quebre):\n${others.map(m => `- ${m.key}: ${m.title}`).join('\n')}` : '',
    instructions ? `Instruções do usuário:\n${instructions}` : '',
    previousErrors.length ? `A tentativa anterior foi recusada pela verificação. Corrija:\n${previousErrors.map(e => `- ${e}`).join('\n')}` : '',
    envelopeInstruction({
      tasks: [{ key: `${master.key}.T1`, title: 'título', repo: master.repos[0] ?? 'repo', stack: 'backend', objective: '2 a 4 frases concretas', inScope: ['…'], outOfScope: ['…'], contracts: ['…'], scenarios: [master.scenarios[0] ?? 'Cenário copiado literalmente'], dependsOn: [], verifyHint: 'npm test' }],
    }),
  ].filter(Boolean).join('\n\n')
}

export function parseTasks(output: string, masterKey: string): ExecutableTask[] {
  return normalizeTasks(extractJsonFromMarkdown(output)?.tasks, masterKey)
}

// Without masterKey (the developer's edits), each task keeps the master it names.
export function normalizeTasks(raw: unknown, masterKey?: string): ExecutableTask[] {
  return (Array.isArray(raw) ? raw : []).map((t: any, i: number) => ({
    key: text(t?.key) || `${masterKey ?? text(t?.masterKey)}.T${i + 1}`,
    masterKey: masterKey ?? text(t?.masterKey),
    title: text(t?.title),
    repo: text(t?.repo),
    // An invalid stack is kept as written so the guard names it
    stack: (STACKS as readonly string[]).includes(t?.stack) ? (t.stack as Stack) : (text(t?.stack) as Stack),
    objective: text(t?.objective),
    inScope: strings(t?.inScope),
    outOfScope: strings(t?.outOfScope),
    contracts: strings(t?.contracts),
    scenarios: strings(t?.scenarios),
    dependsOn: strings(t?.dependsOn),
    verifyHint: text(t?.verifyHint) || undefined,
  }))
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const out = 'EXPLORAR · pergunta 1 de ~6\n\nTexto.\n\n```json\n{"questions":[{"question":"A?","recommendation":"sim"},{"question":"B?"},{"question":"C?"},{"question":"D?"}],"doc":{"problem":"P","original":"X","mitigations":"M","bogus":"Y"},"recommendation":"go","phaseReady":true}\n```'
  const f = parseFacilitator(out)
  assert.equal(f.reply, 'EXPLORAR · pergunta 1 de ~6\n\nTexto.')
  assert.equal(f.questions.length, 3, 'no máximo 3 perguntas')
  assert.deepEqual(f.doc, { problem: 'P' }, 'original e seções desconhecidas ignoradas')
  assert.equal(f.recommendation, 'go')
  assert.equal(parseFacilitator('só texto').reply, 'só texto')

  const red = parseRed('```json\n{"attacks":[{"attack":"x","severity":"crítica"},{"id":"A9","attack":"y","severity":"alta","evidence":"forte"},{"attack":""}],"premortem":"pm"}\n```')
  assert.equal(red.attacks.length, 2)
  assert.equal(red.attacks[0].id, 'A1')
  assert.equal(red.attacks[0].severity, 'media', 'severidade desconhecida vira media')
  const merged = mergeBlue(red.attacks, '```json\n{"responses":[{"id":"A9","stance":"mitiga","argument":"a","mitigation":"m"}]}\n```')
  assert.equal(merged[1].mitigation, 'm')
  assert.equal(merged[0].stance, undefined, 'ataque sem resposta fica sem resposta')

  const masters = parseMasters('```json\n{"masters":[{"title":"x","repos":["api"],"walkingSkeleton":true}]}\n```')
  assert.equal(masters[0].key, 'M1')
  assert.equal(masters[0].walkingSkeleton, true)
  const tasks = parseTasks('```json\n{"tasks":[{"title":"t","stack":"fullstack"}]}\n```', 'M2')
  assert.equal(tasks[0].key, 'M2.T1')
  assert.equal(tasks[0].stack, 'fullstack', 'stack inválida chega à guarda')

  console.log('ideation envelopes selfcheck: ok')
}
