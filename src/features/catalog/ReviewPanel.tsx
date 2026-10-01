import { Bot, FileSearch, Sparkles, Square } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CopyButton, Empty } from '@/ui'
import { streamPost } from '@/lib/stream'
import type { CatalogItem } from './api'

type ReviewEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: string; input: Record<string, unknown> }
  | { type: 'status'; message: string }
  | { type: 'done'; provider: string; model: string; durationMs: number; stopped: boolean }
  | { type: 'error'; message: string }
  | { type: 'thinking' | 'tool-result' | 'result' }

type Phase = 'idle' | 'running' | 'done' | 'error'

// Nome curto do que o agente está lendo, para o usuário ver que ele trabalha e em quê.
function toolLabel(e: { tool: string; input: Record<string, unknown> }) {
  const target = e.input.file_path ?? e.input.path ?? e.input.pattern ?? e.input.command ?? ''
  return `${e.tool} ${String(target).split('/').slice(-2).join('/')}`.trim()
}

export function ReviewPanel({ item }: { item: CatalogItem }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [info, setInfo] = useState('')
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const run = async () => {
    abort.current = new AbortController()
    setPhase('running')
    setText('')
    setSteps([])
    setInfo('')
    let failed = false
    try {
      await streamPost<ReviewEvent>(`/catalog/items/${item.id}/review`, e => {
        if (e.type === 'text') setText(t => t + e.text)
        if (e.type === 'tool') setSteps(s => [...s, toolLabel(e)])
        if (e.type === 'error') ((failed = true), setInfo(e.message))
        if (e.type === 'done') setInfo(`${e.provider} · ${e.model || 'modelo padrão'} · ${Math.round(e.durationMs / 1000)}s${e.stopped ? ' · parado por você' : ''}`)
      }, abort.current.signal)
    } catch (e) {
      failed = true
      setInfo((e as Error).message)
    }
    setPhase(failed ? 'error' : 'done')
  }

  if (phase === 'idle') {
    return (
      <Empty
        icon={Bot}
        title="Revisão crítica com IA"
        action={<button className="btn btn-primary" onClick={run}><Sparkles size={14} /> Pedir revisão</button>}
      >
        O agente lê o item{item.notes ? ' e as suas notas' : ''} e aponta pontos fortes, o que melhorar e o próximo passo. Roda em modo leitura: não
        altera nenhum arquivo. Usa o provedor e o modelo de <Link to="/configuracoes/ia">Configurações</Link>.
      </Empty>
    )
  }

  return (
    <div className="stack review">
      <div className="row">
        {phase === 'running' ? (
          <>
            <span className="muted"><FileSearch size={13} className="spin" /> {steps.at(-1) ?? 'iniciando o agente…'}</span>
            <div className="spacer" />
            <button className="btn btn-sm" onClick={() => abort.current?.abort()} title="Encerra o processo do agente; o que já chegou fica na tela">
              <Square size={12} /> Parar
            </button>
          </>
        ) : (
          <>
            <span className="muted mono" style={{ fontSize: 12 }}>{phase === 'done' ? info : 'falhou'}</span>
            <div className="spacer" />
            {text && <CopyButton value={text} label="Copiar revisão" />}
            <button className="btn btn-sm" onClick={run}><Sparkles size={13} /> Revisar de novo</button>
          </>
        )}
      </div>
      {phase === 'error' && <div className="callout callout-crit">{info}</div>}
      {text ? <div className="review-text">{renderMarkdown(text)}</div> : phase === 'running' && <div className="skeleton" style={{ height: 80 }} />}
    </div>
  )
}

// Markdown mínimo da revisão: parágrafos, listas, **negrito** e `código`. Montado em JSX, sem innerHTML.
// ponytail: sem tabelas, títulos nem blocos de código; trocar por react-markdown quando a Análise precisar.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i}>{inline(part.slice(2, -2))}</b>
      : part.split(/(`[^`]+`)/g).map((p, j) => (p.startsWith('`') && p.endsWith('`') ? <code key={`${i}-${j}`} className="inline">{p.slice(1, -1)}</code> : p)),
  )
}

const BULLET = /^\s*[-*]\s+/

function renderMarkdown(md: string): ReactNode {
  const out: ReactNode[] = []
  let list: string[] = []
  let para: string[] = []
  const flushList = () => list.length && (out.push(<ul key={out.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>), (list = []))
  const flushPara = () => para.length && (out.push(<p key={out.length}>{para.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l)}</Fragment>)}</p>), (para = []))

  for (const raw of md.split('\n')) {
    const line = raw.replace(/^#+\s*/, '')
    if (!line.trim()) {
      flushList()
      flushPara()
    } else if (BULLET.test(line)) {
      flushPara()
      list.push(line.replace(BULLET, ''))
    } else {
      flushList()
      para.push(line)
    }
  }
  flushList()
  flushPara()
  return out
}
