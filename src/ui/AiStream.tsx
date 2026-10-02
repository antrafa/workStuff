import { Sparkles, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CopyButton } from './CopyButton'
import { Markdown } from './Markdown'
import { SkeletonRows } from './Async'

// Eventos que toda rota de IA manda por SSE; cada tela pode mandar um evento próprio de contexto,
// que vira a linha de progresso por describe().
export type AiStreamEvent = { type: string; text?: string; message?: string; provider?: string; model?: string; durationMs?: number; stopped?: boolean }

type Props<E extends AiStreamEvent> = {
  start: (onEvent: (e: E) => void, signal: AbortSignal) => Promise<void>
  initial: string
  describe?: (e: E) => string | null
}

// Resposta da IA chegando aos poucos: progresso, parar, copiar e refazer. Começa sozinha ao montar.
export function AiStream<E extends AiStreamEvent>({ start, initial, describe }: Props<E>) {
  const [phase, setPhase] = useState<'running' | 'done' | 'error'>('running')
  const [text, setText] = useState('')
  const [info, setInfo] = useState(initial)
  const abort = useRef<AbortController | null>(null)

  const run = async () => {
    abort.current?.abort()
    abort.current = new AbortController()
    setPhase('running')
    setText('')
    setInfo(initial)
    let failed = false
    try {
      await start(e => {
        const custom = describe?.(e)
        if (custom) setInfo(custom)
        if (e.type === 'text' && e.text) setText(t => t + e.text)
        if (e.type === 'error') ((failed = true), setInfo(e.message ?? 'a IA falhou'))
        if (e.type === 'done') setInfo(`${e.provider} · ${e.model || 'modelo padrão'} · ${Math.round((e.durationMs ?? 0) / 1000)}s${e.stopped ? ' · parado por você' : ''}`)
      }, abort.current.signal)
    } catch (e) {
      failed = true
      setInfo((e as Error).message)
    }
    setPhase(failed ? 'error' : 'done')
  }

  useEffect(() => {
    run()
    return () => abort.current?.abort()
  }, [])

  return (
    <div className="stack">
      <div className="row">
        <span className="muted mono" style={{ fontSize: 12 }}>{info}</span>
        <div className="spacer" />
        {phase === 'running' ? (
          <button className="btn btn-sm" onClick={() => abort.current?.abort()} title="Encerra o agente; o que já chegou fica na tela"><Square size={12} /> Parar</button>
        ) : (
          <>
            {text && <CopyButton value={text} label="Copiar" />}
            <button className="btn btn-sm" onClick={run}><Sparkles size={13} /> Refazer</button>
          </>
        )}
      </div>
      {phase === 'error' && <div className="callout callout-crit">{info}</div>}
      {text ? <Markdown>{text}</Markdown> : phase === 'running' && <SkeletonRows rows={4} height={18} />}
      <p className="muted" style={{ fontSize: 12 }}>
        Provedor de IA definido em <Link to="/configuracoes/ia">Configurações</Link>. O agente só lê; nada é executado.
      </p>
    </div>
  )
}
