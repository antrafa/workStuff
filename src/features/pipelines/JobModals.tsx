import { Square, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Async, CopyButton, Markdown, Modal, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { explainJob, fetchJobLog, type Job, type Watch } from './api'

type Props = { watch: Watch; job: Job; onClose: () => void }

export function ExplainModal({ watch, job, branch, onClose }: Props & { branch: string }) {
  const [phase, setPhase] = useState<'running' | 'done' | 'error'>('running')
  const [text, setText] = useState('')
  const [info, setInfo] = useState('baixando o log do job…')
  const abort = useRef<AbortController | null>(null)

  const run = async () => {
    abort.current?.abort()
    abort.current = new AbortController()
    setPhase('running')
    setText('')
    setInfo('baixando o log do job…')
    let failed = false
    try {
      await explainJob(watch.id, job, branch, e => {
        if (e.type === 'log' && 'lines' in e) {
          const where = e.clone ? `; a IA também lê o código em ${e.clone}` : '; projeto não clonado, só o log'
          setInfo(`${e.lines} linhas de log${e.truncated ? ' (fim do log)' : ''} enviadas${where}…`)
        }
        if (e.type === 'text' && 'text' in e) setText(t => t + e.text)
        if (e.type === 'error' && 'message' in e) ((failed = true), setInfo(e.message))
        if (e.type === 'done' && 'durationMs' in e) setInfo(`${e.provider} · ${e.model || 'modelo padrão'} · ${Math.round(e.durationMs / 1000)}s${e.stopped ? ' · parado por você' : ''}`)
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
    <Modal title={<>Por que <span className="mono">{job.name}</span> falhou</>} width={780} onClose={onClose}>
      <div className="stack">
        <div className="row">
          <span className="muted mono" style={{ fontSize: 12 }}>{info}</span>
          <div className="spacer" />
          {phase === 'running' ? (
            <button className="btn btn-sm" onClick={() => abort.current?.abort()} title="Encerra o agente; o que já chegou fica na tela"><Square size={12} /> Parar</button>
          ) : (
            <>
              {text && <CopyButton value={text} label="Copiar" />}
              <button className="btn btn-sm" onClick={run}><Sparkles size={13} /> Reanalisar</button>
            </>
          )}
        </div>
        {phase === 'error' && <div className="callout callout-crit">{info}</div>}
        {text ? <Markdown>{text}</Markdown> : phase === 'running' && <SkeletonRows rows={4} height={18} />}
        <p className="muted" style={{ fontSize: 12 }}>
          Provedor de IA definido em <Link to="/configuracoes/ia">Configurações</Link>. O agente só lê; nada é executado.
        </p>
      </div>
    </Modal>
  )
}

export function LogModal({ watch, job, onClose }: Props) {
  const log = useAsync(() => fetchJobLog(watch.id, job.id), [watch.id, job.id])
  return (
    <Modal title={<>Log de <span className="mono">{job.name}</span></>} width={960} onClose={onClose}>
      <Async state={log} skeleton={<SkeletonRows rows={8} height={14} />}>
        {d => (
          <div className="stack" style={{ ['--gap' as string]: '8px' }}>
            <div className="row">
              <span className="muted" style={{ fontSize: 12 }}>{d.truncated ? 'Log longo: mostrando o fim.' : `${d.text.split('\n').length} linhas`}</span>
              <div className="spacer" />
              <CopyButton value={d.text} label="Copiar" />
            </div>
            <pre className="code pl-log">{d.text || '(log vazio)'}</pre>
          </div>
        )}
      </Async>
    </Modal>
  )
}
