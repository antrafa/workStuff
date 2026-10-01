// Prompts da análise arquitetural e limpeza do relatório. Texto do relatório
// (report-prompt.md). Autoteste: node server/lib/analysis/prompts.ts --selfcheck

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const REPORT_BODY = readFileSync(new URL('./report-prompt.md', import.meta.url), 'utf-8')

const INTRO = `Você está gerando um relatório arquitetural completo de um projeto de software.`

// A persona vem do Catálogo (persona arquiteto-software). Sem ela o relatório roda com o próprio
// prompt, que já traz os critérios de rigor; só perde o raciocínio da persona.
export function buildReportSystemPrompt(persona: string | null) {
  const personaBlock = persona
    ? `Assuma o raciocínio da persona abaixo — trade-off explícito, ceticismo com modismo, exigir evidência antes
de opinar — mas ignore o "Formato de resposta" dela: o formato deste relatório é o definido abaixo.

${persona}

---

`
    : ''
  return `${INTRO}\n\n${personaBlock}${REPORT_BODY}`
}

export const REPORT_PROMPT = 'Gere o relatório arquitetural completo deste projeto, seguindo as seções definidas no system prompt.'

export type ChatTurn = { role: 'user' | 'ai'; text: string }

const REPORT_EXCERPT_CHARS = 12_000
const TURN_CHARS = 3_000
const MAX_TURNS = 6

// Sem sessão retomada, cada pergunta leva o contexto consigo: um trecho do relatório salvo e as
// últimas trocas. O agente confirma no código com Read/Grep/Glob antes de afirmar.
export function buildChatSystemPrompt(report: string | null) {
  const excerpt = report
    ? report.length > REPORT_EXCERPT_CHARS
      ? `${report.slice(0, REPORT_EXCERPT_CHARS)}\n... (relatório truncado)`
      : report
    : '(ainda não há relatório salvo para este projeto)'
  return `Você responde perguntas sobre a arquitetura de um projeto de software, cujo diretório é o
de trabalho. Use Read, Grep e Glob para abrir o código (sem Bash, sem escrita).

Relatório arquitetural já gerado para este projeto, como ponto de partida — pode estar desatualizado:

${excerpt}

---

## Como responder
- Responda pelo que está no código. Cite o arquivo (caminho:linha) e abra com Read para confirmar antes
  de afirmar algo que decide alguma coisa.
- Separe fato (li no código) de inferência. Informação insuficiente é resposta legítima: diga o que
  faltou e onde procurar.
- Sem preâmbulo, sem repetir a pergunta. Português, direto, Markdown leve (bullet, negrito, tabela).
  Se um diagrama esclarecer, use bloco \`\`\`mermaid sem parênteses, colchetes ou acento no texto dos nós.`
}

export function buildChatPrompt(history: ChatTurn[], question: string) {
  const turns = history.slice(-MAX_TURNS).map(t => {
    const text = t.text.length > TURN_CHARS ? `${t.text.slice(0, TURN_CHARS)} …` : t.text
    return `${t.role === 'user' ? 'Pergunta anterior' : 'Sua resposta anterior'}:\n${text}`
  })
  return turns.length ? `${turns.join('\n\n')}\n\nPergunta atual:\n${question}` : question
}

// Remove o ruído que o modelo às vezes emite: o relatório inteiro num code fence, ou frase de
// transição antes do título. Feito no servidor porque o .md gravado no projeto vira commit.
export function sanitizeReport(text: string) {
  const fenced = text.trim().match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/)
  const unwrapped = fenced ? fenced[1] : text
  const trimmed = unwrapped.trimStart()
  if (trimmed.startsWith('#')) return trimmed
  const heading = trimmed.match(/#{1,3}\s+\S/)
  // Só descarta o que vem antes se o título estiver logo no começo, para não cortar conteúdo real.
  if (!heading || heading.index === undefined || heading.index > 300) return unwrapped
  return trimmed.slice(heading.index)
}

// Um arquivo por dia em docs/arquitetura/: versões lado a lado, e reanálise no mesmo dia sobrescreve.
export function reportFileName(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `arquitetura-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.md`
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.equal(sanitizeReport('```markdown\n# Relatório\ntexto\n```'), '# Relatório\ntexto', 'tira o fence do relatório inteiro')
  assert.equal(sanitizeReport('Vou explorar o projeto.\n\n# Relatório\nx'), '# Relatório\nx', 'tira frase de transição')
  assert.equal(sanitizeReport(`${'a'.repeat(400)}\n# Título tardio`), `${'a'.repeat(400)}\n# Título tardio`, 'não corta conteúdo longo')
  assert.equal(reportFileName(new Date(2026, 8, 3)), 'arquitetura-2026-09-03.md')

  const withPersona = buildReportSystemPrompt('PERSONA-X')
  assert.ok(withPersona.includes('PERSONA-X') && withPersona.includes('## Estrutura do relatório'))
  assert.ok(!buildReportSystemPrompt(null).includes('persona abaixo'), 'sem persona não cita persona')
  assert.ok(withPersona.includes('```mermaid'), 'crases do prompt original preservadas')

  const long = 'x'.repeat(20_000)
  assert.ok(buildChatSystemPrompt(long).includes('(relatório truncado)'))
  const history: ChatTurn[] = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'ai' : 'user', text: `t${i}` }))
  const prompt = buildChatPrompt(history, 'e agora?')
  assert.ok(!prompt.includes('t3') && prompt.includes('t4') && prompt.endsWith('e agora?'), 'só as últimas 6 trocas')
  assert.equal(buildChatPrompt([], 'direto'), 'direto')

  console.log('analysis prompts selfcheck: ok')
}
