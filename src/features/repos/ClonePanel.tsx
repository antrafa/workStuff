import { Archive, CheckCircle2, Loader2, MinusCircle, Square, X, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cloneRepos, type CloneResult, type CloneStatus, type Source } from './api'

export type CloneJob = { id: number; fullPath: string; kind: 'project' | 'group'; includeArchived: boolean }

const STATUS: Record<CloneStatus, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  cloned: { label: 'clonado', icon: CheckCircle2, cls: 'is-ok' },
  exists: { label: 'já existia', icon: MinusCircle, cls: '' },
  skipped: { label: 'pulado', icon: MinusCircle, cls: 'is-warn' },
  failed: { label: 'falhou', icon: XCircle, cls: 'is-fail' },
}

export type CloneRun = { job: CloneJob; total: number; archivedSkipped: number; results: CloneResult[]; running: boolean; error: string | null; stopped: boolean }

// O clone dispara no clique (start), nunca num efeito: em dev o StrictMode monta efeitos duas vezes,
// o que cancelaria e repetiria o clone.
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
        <b>{running ? `Clonando ${job.kind === 'group' ? 'o subgrupo' : ''} ${name}…` : stopped ? 'Clone interrompido' : error ? 'O clone não começou' : 'Clone concluído'}</b>
        <span className="muted mono" style={{ fontSize: 12 }}>{results.length} de {total || '…'}</span>
        <div className="spacer" />
        {(['cloned', 'exists', 'skipped', 'failed'] as CloneStatus[]).map(s => count(s) > 0 && <span key={s} className={`badge ${s === 'cloned' ? 'badge-ok' : s === 'failed' ? 'badge-crit' : s === 'skipped' ? 'badge-warn' : ''}`}>{count(s)} {STATUS[s].label}</span>)}
        {running
          ? <button className="btn btn-sm" onClick={onStop} title="Para depois do que já está em andamento; clones pela metade são removidos"><Square size={12} /> Parar</button>
          : <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} title="Fechar"><X size={14} /></button>}
      </div>
      {total > 1 && <div className="clone-progress"><i style={{ width: `${Math.round((results.length / total) * 100)}%` }} /></div>}
      {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
      {archivedSkipped > 0 && <div className="muted" style={{ fontSize: 12 }}><Archive size={12} /> {archivedSkipped} projeto(s) arquivado(s) ficaram de fora.</div>}
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
