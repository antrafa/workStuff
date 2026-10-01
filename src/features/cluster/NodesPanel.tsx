import { RotateCw, Server } from 'lucide-react'
import { Async, Empty, Meter, SkeletonRows } from '@/ui'
import { pct } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { usePolling } from './usePolling'
import { fetchNodes } from './api'

export function NodesPanel() {
  const state = useAsync(fetchNodes)
  usePolling(state.reload, true)
  const nodes = state.data?.nodes ?? []

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title spacer">Nodes</div>
        {state.data?.metricsUnavailable && !state.data.limitedRbac && (
          <span className="badge badge-warn" title="Sem metrics-server: mostra o reservado pelos requests, não o uso real">sem métricas</span>
        )}
        <span className="mono muted" style={{ fontSize: 12 }}>{nodes.length} nodes</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={state.reload} title="Atualizar nodes">
          <RotateCw size={13} className={state.loading ? 'spin' : ''} />
        </button>
      </div>
      <div className="card-pad nodes-grid">
        <Async
          state={state}
          isEmpty={d => d.nodes.length === 0}
          empty={
            <Empty icon={Server} title={state.data?.limitedRbac ? 'Nodes ocultos pelo RBAC' : 'Nenhum node visível'}>
              {state.data?.limitedRbac ? 'Este usuário não tem permissão para listar nodes; os pods continuam visíveis abaixo.' : 'O cluster não devolveu nodes.'}
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

// Barra = uso real (métricas); sem métricas, cai para o reservado pelos requests. Reservado sempre como texto.
function Usage({ label, used, requested, capacity, unit }: { label: string; used: number | null; requested: number; capacity: number; unit: string }) {
  const value = used ?? requested
  const percent = pct(value, capacity)
  return (
    <div className="stack" style={{ ['--gap' as string]: '4px' }}>
      <div className="row" style={{ fontSize: 11.5 }}>
        <span className="eyebrow">{label}</span>
        <span className="mono muted" title={used === null ? 'Sem métricas: valor reservado pelos requests' : 'Uso medido agora'}>
          {value} / {capacity} {unit}{used === null && ' reservado'}
        </span>
        <div className="spacer" />
        <b className="mono">{percent}%</b>
      </div>
      <Meter percent={percent} />
      {used !== null && <span className="muted mono" style={{ fontSize: 10.5 }}>reservado {requested} {unit} ({pct(requested, capacity)}%)</span>}
    </div>
  )
}
