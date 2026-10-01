import { HeartPulse, RotateCcw, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { Async, Empty, SkeletonRows } from '@/ui'
import { RestartModal } from './RestartModal'
import { restartTitle } from './PodsTable'
import { canWrite, type Environment, type Pod } from './api'

type State = { data: Pod[] | null; error: string | null; loading: boolean; reload: () => void }
type Props = { state: State; env: Environment | null; onOpen: (p: Pod) => void; onLogs: (p: Pod) => void }

export function ProblemsPanel({ state, env, onOpen, onLogs }: Props) {
  const [restarting, setRestarting] = useState<Pod | null>(null)

  return (
    <>
      <Async
        state={state}
        isEmpty={d => d.every(p => p.health.level === 'ok')}
        empty={
          <div className="card">
            <Empty icon={HeartPulse} title="Nenhum problema encontrado">Todos os pods deste escopo estão saudáveis.</Empty>
          </div>
        }
        skeleton={<SkeletonRows rows={3} height={96} />}
      >
        {pods => (
          <div className="grid" style={{ ['--min' as string]: '360px' }}>
            {pods
              .filter(p => p.health.level !== 'ok')
              .sort((a, b) => (a.health.level === 'critical' ? -1 : 1) - (b.health.level === 'critical' ? -1 : 1))
              .map(p => {
                const critical = p.health.level === 'critical'
                return (
                  <article key={`${p.namespace}/${p.name}`} className={`card interactive problem ${critical ? 'is-crit' : 'is-warn'}`} onClick={() => onOpen(p)}>
                    <div className="row">
                      <span className={`badge ${critical ? 'badge-crit' : 'badge-warn'}`}>{critical ? 'crítico' : 'atenção'}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{p.namespace}</span>
                    </div>
                    <b className="mono" style={{ fontSize: 13 }}>{p.name}</b>
                    <div style={{ fontSize: 13 }}>{p.health.reasons.join(' · ')}</div>
                    <div className="row muted mono" style={{ fontSize: 11.5 }}>
                      <span>ready {p.readyContainers}</span>
                      <span>restarts {p.restartCount}</span>
                      <span>{p.nodeName}</span>
                    </div>
                    <div className="row" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm" onClick={() => onLogs(p)}><ScrollText size={13} /> Logs</button>
                      <button className="btn btn-sm" disabled={!canWrite(env) || !p.workload} onClick={() => setRestarting(p)} title={restartTitle(env, p)}>
                        <RotateCcw size={13} /> Reiniciar
                      </button>
                      <div className="spacer" />
                      <span className="muted" style={{ fontSize: 12 }}>clique para ver eventos</span>
                    </div>
                  </article>
                )
              })}
          </div>
        )}
      </Async>
      {restarting && <RestartModal pod={restarting} env={env} onDone={state.reload} onClose={() => setRestarting(null)} />}
    </>
  )
}
