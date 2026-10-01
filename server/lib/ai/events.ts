// Traduz a saída em linhas JSON de cada CLI para um formato único de evento.
// Autoteste: node server/lib/ai/events.ts --selfcheck

import assert from 'node:assert/strict'
import type { ProviderId } from '../aiProviders.ts'

export type AiEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool'; id: string; tool: string; input: unknown }
  | { type: 'tool-result'; id: string; tool?: string; isError: boolean; content: string }
  | { type: 'status'; message: string }
  | { type: 'result'; ok: boolean; text: string }

type Json = Record<string, any>

function toolContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(c => (typeof c === 'string' ? c : c?.type === 'text' ? c.text : '')).filter(Boolean).join('\n')
  if (content && typeof content === 'object') return JSON.stringify(content, null, 2)
  return String(content ?? '')
}

// Cada execução tem seu parser: o Claude manda o texto em pedaços e depois repete a mensagem inteira,
// e o parser precisa lembrar que já recebeu os pedaços para não duplicar.
export function createParser(provider: ProviderId) {
  let sawDeltas = false
  const toolNames = new Map<string, string>()
  let text = ''
  // Id da conversa no CLI, para continuar depois (claude --resume).
  let sessionId: string | null = null

  const claude = (e: Json): AiEvent[] => {
    if (typeof e.session_id === 'string') sessionId = e.session_id
    if (e.type === 'stream_event') {
      const d = e.event?.delta
      if (e.event?.type !== 'content_block_delta' || !d) return []
      if (d.type === 'text_delta') return (sawDeltas = true), (text += d.text), [{ type: 'text', text: d.text }]
      if (d.type === 'thinking_delta') return (sawDeltas = true), [{ type: 'thinking', text: d.thinking }]
      return []
    }
    if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
      const out: AiEvent[] = []
      for (const b of e.message.content) {
        if (b.type === 'tool_use') {
          toolNames.set(b.id, b.name)
          out.push({ type: 'tool', id: b.id, tool: b.name, input: b.input })
        } else if (!sawDeltas && b.type === 'text') {
          text += b.text
          out.push({ type: 'text', text: b.text })
        }
      }
      return out
    }
    if (e.type === 'user' && Array.isArray(e.message?.content)) {
      return e.message.content
        .filter((b: Json) => b.type === 'tool_result')
        .map((b: Json) => ({ type: 'tool-result', id: b.tool_use_id, tool: toolNames.get(b.tool_use_id), isError: Boolean(b.is_error), content: toolContent(b.content) }))
    }
    if (e.type === 'system' && e.subtype === 'api_retry') return [{ type: 'status', message: `API instável, nova tentativa ${e.attempt ?? ''}` }]
    if (e.type === 'result') return [{ type: 'result', ok: !e.is_error, text: typeof e.result === 'string' ? e.result : text }]
    return []
  }

  const codex = (e: Json): AiEvent[] => {
    const item = e.item
    if (e.type === 'item.started' && item?.type === 'command_execution') {
      return [{ type: 'tool', id: item.id ?? '', tool: 'shell', input: { command: item.command } }]
    }
    if (e.type === 'item.completed' && item?.type === 'agent_message' && typeof item.text === 'string') {
      // Cada agent_message é um parágrafo completo; sem separador eles grudam ("ambiente.O número").
      const chunk = text ? `\n\n${item.text}` : item.text
      text += chunk
      return [{ type: 'text', text: chunk }]
    }
    if (e.type === 'item.completed' && item?.type === 'command_execution') {
      return [{ type: 'tool-result', id: item.id ?? '', tool: 'shell', isError: item.exit_code !== 0, content: toolContent(item.aggregated_output) }]
    }
    if (e.type === 'turn.completed') return [{ type: 'result', ok: true, text }]
    if (e.type === 'turn.failed' || e.type === 'error') return [{ type: 'result', ok: false, text: e.error?.message ?? e.message ?? 'falhou' }]
    return []
  }

  const agy = (e: Json): AiEvent[] => {
    const s = e.step_update
    if (e.event === 'step_update' && s?.step_type === 'agent_response' && s.text_delta) {
      text += s.text_delta
      return [{ type: 'text', text: s.text_delta }]
    }
    if (e.event === 'step_update' && s?.step_type === 'tool') {
      const id = String(s.step_index ?? '')
      if (s.state === 'ACTIVE') return [{ type: 'tool', id, tool: s.tool_name, input: s.tool_info?.parameters ?? {} }]
      if (s.state === 'DONE' || s.state === 'ERROR') {
        return [{ type: 'tool-result', id, tool: s.tool_name, isError: s.state === 'ERROR', content: toolContent(s.tool_info?.output ?? s.tool_info?.error?.message ?? '') }]
      }
    }
    if (e.event === 'result') return [{ type: 'result', ok: e.result?.status === 'SUCCESS', text: e.result?.response ?? text }]
    return []
  }

  const parse = { claude, codex, agy }[provider]
  return {
    line(line: string): AiEvent[] {
      if (!line.trim()) return []
      try {
        return parse(JSON.parse(line))
      } catch {
        return [{ type: 'status', message: line.slice(0, 240) }]
      }
    },
    text: () => text,
    sessionId: () => sessionId,
  }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const run = (provider: ProviderId, lines: object[]) => {
    const p = createParser(provider)
    const events = lines.flatMap(l => p.line(JSON.stringify(l)))
    return { events, text: p.text() }
  }

  const claude = run('claude', [
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Olá ' } } },
    { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'mundo' } } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Olá mundo' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/a' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'conteúdo' }] }] } },
    { type: 'result', is_error: false, result: 'Olá mundo' },
  ])
  assert.equal(claude.text, 'Olá mundo', 'mensagem repetida depois dos pedaços não duplica')
  assert.deepEqual(claude.events.find(e => e.type === 'tool-result'), { type: 'tool-result', id: 't1', tool: 'Read', isError: false, content: 'conteúdo' })
  assert.deepEqual(claude.events.at(-1), { type: 'result', ok: true, text: 'Olá mundo' })

  const codex = run('codex', [
    { type: 'item.started', item: { id: 'c1', type: 'command_execution', command: 'cat SKILL.md' } },
    { type: 'item.completed', item: { id: 'c1', type: 'command_execution', exit_code: 0, aggregated_output: 'x' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Vou ler.' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Revisão pronta' } },
    { type: 'turn.completed', usage: {} },
  ])
  assert.deepEqual(codex.events.at(-1), { type: 'result', ok: true, text: 'Vou ler.\n\nRevisão pronta' })

  const agy = run('agy', [
    { event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'Parte 1' } },
    { event: 'result', result: { status: 'SUCCESS', response: 'Parte 1' } },
  ])
  assert.deepEqual(agy.events.at(-1), { type: 'result', ok: true, text: 'Parte 1' })

  assert.deepEqual(createParser('claude').line('não é json'), [{ type: 'status', message: 'não é json' }])
  console.log('ai events selfcheck: ok')
}
