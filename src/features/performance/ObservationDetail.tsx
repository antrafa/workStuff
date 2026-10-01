import { History } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Empty, Meter, Segmented, SkeletonRows, useToast } from '@/ui'
import { fetchHistory, openStream, type MeshWindow, type Observation, type Sample } from './api'
import { containerStats, formatHours } from './trend'

type Metric = 'cpu' | 'mem'

export function ObservationDetail({ observation }: { observation: Observation }) {
  const [live, setLive] = useState<Sample[] | null>(null)
  const [history, setHistory] = useState<Sample[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [metric, setMetric] = useState<Metric>('mem')
  const [seriesKey, setSeriesKey] = useState<string | null>(null)
  const toast = useToast()

  useEffect(
    () =>
      openStream(observation.id, e => {
        if (e.type === 'backlog') setLive(e.samples)
        if (e.type === 'sample') setLive(s => [...(s ?? []), e.sample])
      }),
    [observation.id],
  )

  // Histórico do Prometheus antes do primeiro ponto ao vivo: mesma linha do tempo, marcado como reconstruído.
  const samples = useMemo(() => {
    const first = live?.[0]?.t
    return [...history.filter(h => !first || h.t < first), ...(live ?? [])]
  }, [history, live])
  const stats = useMemo(() => containerStats(samples), [samples])
  const current = seriesKey ?? stats[0]?.key ?? null
  const meshLatest = useMemo(() => [...samples].reverse().find(s => s.mesh?.length)?.mesh ?? null, [samples])

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const r = await fetchHistory(observation.id, 24)
      setHistory(r.samples)
      toast(`${r.samples.length} pontos das últimas ${r.hours}h reconstruídos do Prometheus`)
    } catch (e) {
      toast((e as Error).message)
    }
    setLoadingHistory(false)
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title spacer">{observation.namespace} · detalhe</div>
        {history.length > 0 && <span className="muted" style={{ fontSize: 12 }}>{history.length} pontos reconstruídos</span>}
        <button className="btn btn-sm" onClick={loadHistory} disabled={loadingHistory} title="Reconstrói as últimas 24h a partir do Prometheus do cluster">
          <History size={13} className={loadingHistory ? 'spin' : ''} /> {history.length ? 'Recarregar histórico' : 'Histórico Prometheus'}
        </button>
      </div>
      {live === null ? (
        <div className="card-pad"><SkeletonRows rows={3} height={90} /></div>
      ) : samples.length === 0 ? (
        <Empty icon={History} title="Nenhum ponto coletado ainda">
          {observation.status === 'running' ? `A primeira coleta acontece em até ${observation.intervalSeconds}s.` : 'Esta observação não chegou a coletar. Retome para começar.'}
        </Empty>
      ) : (
        <div className="card-pad stack" style={{ ['--gap' as string]: '16px' }}>
          <div className="grid" style={{ ['--min' as string]: '260px' }}>
            {stats.map(s => (
              <button key={s.key} className="stat" aria-pressed={s.key === current} onClick={() => setSeriesKey(s.key)} title={`${s.pod} · clique para ver no gráfico`}>
                <div className="row">
                  <span className="eyebrow spacer">{s.container}</span>
                  {s.restartCount > 0 && <span className="badge badge-crit">{s.restartCount} restarts</span>}
                </div>
                <span className="mono muted" style={{ fontSize: 11 }}>{s.pod}</span>
                <MetricLine label="CPU" value={s.cpuMilli == null ? 'sem métrica' : `${Math.round(s.cpuMilli)}m${s.cpuPct != null ? ` · ${Math.round(s.cpuPct)}%` : ' · sem limite'}`} percent={s.cpuPct} />
                <MetricLine label="MEM" value={s.memMiB == null ? 'sem métrica' : `${Math.round(s.memMiB)}Mi${s.memPct != null ? ` · ${Math.round(s.memPct)}%` : ' · sem limite'}`} percent={s.memPct} />
                <small>
                  {observation.throttleOff ? 'throttle indisponível' : `throttle ${s.throttlePct == null ? '—' : `${s.throttlePct.toFixed(0)}%`}`}
                  {' · '}
                  {s.memTrendMiBPerHour == null
                    ? 'memória estável'
                    : `+${s.memTrendMiBPerHour.toFixed(0)} MiB/h${s.hoursToMemLimit != null ? `, bate no limite em ~${formatHours(s.hoursToMemLimit)}` : ''}`}
                </small>
              </button>
            ))}
          </div>

          {observation.throttleOff && <small className="muted">Throttling: {observation.throttleOff}.</small>}

          {current && (
            <div className="stack" style={{ ['--gap' as string]: '8px' }}>
              <div className="row">
                <span className="eyebrow spacer">No tempo · {current.split('/')[1]}</span>
                <Segmented value={metric} onChange={setMetric} options={[{ id: 'cpu', label: 'CPU no tempo' }, { id: 'mem', label: 'Memória no tempo' }]} />
              </div>
              <LineChart samples={samples} seriesKey={current} metric={metric} />
            </div>
          )}

          <div className="stack" style={{ ['--gap' as string]: '8px' }}>
            <span className="eyebrow">Malha (Istio)</span>
            {observation.meshOff ? (
              <span className="muted">indisponível: {observation.meshOff}.</span>
            ) : meshLatest ? (
              <MeshTable rows={meshLatest} />
            ) : (
              <span className="muted">sem janela medida ainda: a latência aparece a partir da 2ª coleta, e só para serviços que recebem tráfego pelo gateway.</span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function MeshTable({ rows }: { rows: MeshWindow[] }) {
  const ms = (v: number | null) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)} ms`)
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Serviço</th><th className="num">req/s</th><th className="num">p50 · p95</th><th className="num">erro</th></tr></thead>
        <tbody>
          {rows.map(m => {
            const errPct = m.requests ? (m.errors / m.requests) * 100 : 0
            return (
              <tr key={m.workload}>
                <td className="mono" style={{ fontSize: 12.5 }}>{m.workload}</td>
                <td className="num">{m.rps == null ? '—' : m.rps.toFixed(1)}</td>
                <td className="num">{ms(m.p50Ms)} · {ms(m.p95Ms)}</td>
                <td className="num" style={{ color: errPct >= 5 ? 'var(--crit)' : errPct >= 1 ? 'var(--warn)' : undefined }}>{errPct.toFixed(1)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MetricLine({ label, value, percent }: { label: string; value: string; percent: number | null }) {
  return (
    <div className="stack" style={{ ['--gap' as string]: '4px' }}>
      <div className="row" style={{ fontSize: 12 }}>
        <span className="eyebrow">{label}</span>
        <span className="mono spacer">{value}</span>
      </div>
      <Meter percent={percent ?? 0} />
    </div>
  )
}

const W = 900
const H = 220
const PAD = { l: 56, r: 12, t: 14, b: 26 }

// Linha do container escolhido + linha tracejada do limite + marcadores de restart e OOMKilled.
function LineChart({ samples, seriesKey, metric }: { samples: Sample[]; seriesKey: string; metric: Metric }) {
  const [pod, container] = seriesKey.split('/')
  const points = samples.flatMap(s => {
    const p = s.pods.find(x => x.pod === pod && x.container === container)
    const v = metric === 'cpu' ? p?.cpuMilli : p?.memBytes != null ? p.memBytes / 1048576 : null
    return p && v != null ? [{ t: new Date(s.t).getTime(), v, limit: metric === 'cpu' ? p.cpuLimitMilli : p.memLimitBytes != null ? p.memLimitBytes / 1048576 : null, restarts: p.restartCount, backfilled: Boolean(s.backfilled) }] : []
  })
  if (points.length < 2) return <div className="muted" style={{ fontSize: 13 }}>Pontos insuficientes para o gráfico ainda ({points.length}).</div>

  const limit = [...points].reverse().find(p => p.limit != null)?.limit ?? null
  const max = Math.max(...points.map(p => p.v), limit ?? 0) * 1.1 || 1
  const [t0, t1] = [points[0].t, points[points.length - 1].t]
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const unit = metric === 'cpu' ? 'm' : 'Mi'
  const restarts = points.filter((p, i) => i > 0 && p.restarts > points[i - 1].restarts)
  const firstLive = points.find(p => !p.backfilled)
  const events = samples.flatMap(s => s.events.filter(e => e.pod === pod && /OOM|Kill|BackOff/i.test(e.reason)).map(e => ({ t: new Date(e.t).getTime(), label: `${e.reason}: ${e.message}` }))).filter(e => e.t >= t0 && e.t <= t1)
  const fmt = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <svg className="perf-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric === 'cpu' ? 'CPU' : 'Memória'} de ${container} de ${fmt(t0)} a ${fmt(t1)}`}>
      {[0, 0.5, 1].map(f => (
        <g key={f}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f / 1.1)} y2={y(max * f / 1.1)} className="grid-line" />
          <text x={PAD.l - 8} y={y(max * f / 1.1) + 4} textAnchor="end" className="axis">{Math.round((max * f) / 1.1)}{unit}</text>
        </g>
      ))}
      {[t0, (t0 + t1) / 2, t1].map(t => <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="axis">{fmt(t)}</text>)}
      {firstLive && firstLive.t > t0 && <line x1={x(firstLive.t)} x2={x(firstLive.t)} y1={PAD.t} y2={y(0)} className="grid-line"><title>à esquerda: histórico do Prometheus; à direita: coleta desta observação</title></line>}
      {limit != null && <line x1={PAD.l} x2={W - PAD.r} y1={y(limit)} y2={y(limit)} className="marker-line"><title>limite {Math.round(limit)}{unit}</title></line>}
      <path d={`${path} L${x(t1)},${y(0)} L${x(t0)},${y(0)} Z`} className="area" />
      <path d={path} className="line" />
      {[...restarts.map(r => ({ t: r.t, label: `restart (${r.restarts} no total)` })), ...events].map((m, i) => (
        <circle key={i} cx={x(m.t)} cy={PAD.t + 4} r={4} className="marker-dot"><title>{m.label} · {fmt(m.t)}</title></circle>
      ))}
    </svg>
  )
}
