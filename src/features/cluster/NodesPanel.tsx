import { RotateCw, Server } from 'lucide-react'
import { Async, Empty, Meter, SkeletonRows } from '@/ui'
import { pct } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { usePolling } from './usePolling'
import { fetchNodes } from './api'
import { tx } from '@/lib/i18n'

export function NodesPanel() {
  const state = useAsync(fetchNodes)
  usePolling(state.reload, true)
  const nodes = state.data?.nodes ?? []

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title spacer">Nodes</div>
        {state.data?.metricsUnavailable && !state.data.limitedRbac && (
          <span className="badge badge-warn" title={tx({ en: 'No metrics-server: shows what the requests reserve, not the real use', pt: 'Sem metrics-server: mostra o reservado pelos requests, não o uso real' })}>{tx({ en: 'no metrics', pt: 'sem métricas' })}</span>
        )}
        <span className="mono muted" style={{ fontSize: 12 }}>{nodes.length} nodes</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={state.reload} title={tx({ en: 'Refresh nodes', pt: 'Atualizar nodes' })}>
          <RotateCw size={13} className={state.loading ? 'spin' : ''} />
        </button>
      </div>
      <div className="card-pad nodes-grid">
        <Async
          state={state}
          isEmpty={d => d.nodes.length === 0}
          empty={
            <Empty icon={Server} title={state.data?.limitedRbac ? tx({ en: 'Nodes hidden by RBAC', pt: 'Nodes ocultos pelo RBAC' }) : tx({ en: 'No node visible', pt: 'Nenhum node visível' })}>
              {state.data?.limitedRbac ? tx({ en: 'This user has no permission to list nodes; the pods are still visible below.', pt: 'Este usuário não tem permissão para listar nodes; os pods continuam visíveis abaixo.' }) : tx({ en: 'The cluster returned no nodes.', pt: 'O cluster não devolveu nodes.' })}
            </Empty>
          }
          skeleton={<SkeletonRows rows={1} height={110} />}
        >
          {({ nodes }) =>
            nodes.map(n => (
              <div key={n.name} className="node">
                <div className="row">
                  <span className={`dot ${n.status === 'Ready' ? 'dot-ok' : 'dot-crit'}`} title={n.status} />
                  <b className="mono" style={{ fontSize: 12.5 }}>{n.name}</b>
                  <div className="spacer" />
                  {n.pressures.map(p => <span key={p} className="badge badge-warn">{p}</span>)}
                </div>
                <div className="muted mono" style={{ fontSize: 11 }}>{n.kubeletVersion} · {n.internalIP}</div>
                <Usage label="CPU" used={n.cpuUsage} requested={n.cpuRequested} capacity={n.cpuCapacity} unit="cores" />
                <Usage label="MEM" used={n.memUsageGi} requested={n.memRequestedGi} capacity={n.memCapacityGi} unit="Gi" />
              </div>
            ))
          }
        </Async>
      </div>
    </section>
  )
}

// Bar = real use (metrics); without metrics it falls back to what the requests reserve. Reserved always as text.
function Usage({ label, used, requested, capacity, unit }: { label: string; used: number | null; requested: number; capacity: number; unit: string }) {
  const value = used ?? requested
  const percent = pct(value, capacity)
  return (
    <div className="stack" style={{ ['--gap' as string]: '4px' }}>
      <div className="row" style={{ fontSize: 11.5 }}>
        <span className="eyebrow">{label}</span>
        <span className="mono muted" title={used === null ? tx({ en: 'No metrics: value reserved by the requests', pt: 'Sem métricas: valor reservado pelos requests' }) : tx({ en: 'Use measured now', pt: 'Uso medido agora' })}>
          {value} / {capacity} {unit}{used === null && tx({ en: ' reserved', pt: ' reservado' })}
        </span>
        <div className="spacer" />
        <b className="mono">{percent}%</b>
      </div>
      <Meter percent={percent} />
      {used !== null && <span className="muted mono" style={{ fontSize: 10.5 }}>{tx({ en: 'reserved', pt: 'reservado' })} {requested} {unit} ({pct(requested, capacity)}%)</span>}
    </div>
  )
}
