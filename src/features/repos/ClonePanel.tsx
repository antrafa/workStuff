import { Archive, CheckCircle2, Loader2, MinusCircle, Square, X, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cloneRepos, type CloneResult, type CloneStatus, type Source } from './api'
import { tx } from '@/lib/i18n'

export type CloneJob = { id: number; fullPath: string; kind: 'project' | 'group'; includeArchived: boolean }

const STATUS: Record<CloneStatus, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  cloned: { label: tx({ en: 'cloned', pt: 'clonado' }), icon: CheckCircle2, cls: 'is-ok' },
  exists: { label: tx({ en: 'already there', pt: 'já existia' }), icon: MinusCircle, cls: '' },
  skipped: { label: tx({ en: 'skipped', pt: 'pulado' }), icon: MinusCircle, cls: 'is-warn' },
  failed: { label: tx({ en: 'failed', pt: 'falhou' }), icon: XCircle, cls: 'is-fail' },
}

export type CloneRun = { job: CloneJob; total: number; archivedSkipped: number; results: CloneResult[]; running: boolean; error: string | null; stopped: boolean }

// The clone starts on the click (start), never in an effect: in dev StrictMode mounts effects twice,
// which would cancel and repeat the clone.
export function useClone(source: Source, onDone: () => void) {
  const [run, setRun] = useState<CloneRun | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const start = async (job: CloneJob) => {
    abort.current?.abort()
    abort.current = new AbortController()
    setRun({ job, total: 0, archivedSkipped: 0, results: [], running: true, error: null, stopped: false })
    const set = (p: Partial<CloneRun>) => setRun(r => r && r.job.id === job.id ? { ...r, ...p } : r)
    try {
      await cloneRepos(source.id, { fullPath: job.fullPath, kind: job.kind, includeArchived: job.includeArchived }, e => {
        if (e.type === 'start') set({ total: e.total, archivedSkipped: e.archivedSkipped })
        if (e.type === 'result') setRun(r => (r && r.job.id === job.id ? { ...r, results: [...r.results, e] } : r))
        if (e.type === 'done') set({ stopped: e.stopped })
      }, abort.current.signal)
    } catch (e) {
      set({ error: (e as Error).message })
    }
    set({ running: false })
    onDone()
  }
  return { run, start, stop: () => abort.current?.abort(), close: () => setRun(null) }
}

type Props = { run: CloneRun; show: (p: string | null) => string; onStop: () => void; onClose: () => void }

export function ClonePanel({ run, show, onStop, onClose }: Props) {
  const { job, total, archivedSkipped, results, running, error, stopped } = run
  const count = (s: CloneStatus) => results.filter(r => r.status === s).length
  const name = job.fullPath.split('/').pop()

  return (
    <div className="clone-panel">
      <div className="row">
        {running ? <Loader2 size={15} className="spin" /> : error || count('failed') ? <XCircle size={15} color="var(--crit)" /> : <CheckCircle2 size={15} color="var(--ok)" />}
        <b>{running
          ? tx({ en: `Cloning ${job.kind === 'group' ? 'the subgroup ' : ''}${name}…`, pt: `Clonando ${job.kind === 'group' ? 'o subgrupo' : ''} ${name}…` })
          : stopped ? tx({ en: 'Clone stopped', pt: 'Clone interrompido' }) : error ? tx({ en: 'The clone did not start', pt: 'O clone não começou' }) : tx({ en: 'Clone finished', pt: 'Clone concluído' })}</b>
        <span className="muted mono" style={{ fontSize: 12 }}>{tx({ en: `${results.length} of ${total || '…'}`, pt: `${results.length} de ${total || '…'}` })}</span>
        <div className="spacer" />
        {(['cloned', 'exists', 'skipped', 'failed'] as CloneStatus[]).map(s => count(s) > 0 && <span key={s} className={`badge ${s === 'cloned' ? 'badge-ok' : s === 'failed' ? 'badge-crit' : s === 'skipped' ? 'badge-warn' : ''}`}>{count(s)} {STATUS[s].label}</span>)}
        {running
          ? <button className="btn btn-sm" onClick={onStop} title={tx({ en: 'Stops after what is already running; half-done clones are removed', pt: 'Para depois do que já está em andamento; clones pela metade são removidos' })}><Square size={12} /> {tx({ en: 'Stop', pt: 'Parar' })}</button>
          : <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} title={tx({ en: 'Close', pt: 'Fechar' })}><X size={14} /></button>}
      </div>
      {total > 1 && <div className="clone-progress"><i style={{ width: `${Math.round((results.length / total) * 100)}%` }} /></div>}
      {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
      {archivedSkipped > 0 && <div className="muted" style={{ fontSize: 12 }}><Archive size={12} /> {tx({ en: `${archivedSkipped} archived project(s) left out.`, pt: `${archivedSkipped} projeto(s) arquivado(s) ficaram de fora.` })}</div>}
      {results.length > 0 && (
        <div className="clone-results">
          {results.map(r => {
            const st = STATUS[r.status]
            return (
              <div key={r.fullPath} className={`clone-result ${st.cls}`} title={r.detail}>
                <st.icon size={13} />
                <span className="mono">{show(r.dest)}</span>
                <span className="muted spacer">{r.status === 'cloned' ? '' : r.detail}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
