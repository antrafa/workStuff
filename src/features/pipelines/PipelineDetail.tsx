import { ExternalLink, FileText, Sparkles, Workflow } from 'lucide-react'
import { useState } from 'react'
import { Async, Empty, SkeletonRows } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { usePolling } from '@/features/cluster/usePolling'
import { ExplainModal, LogModal } from './JobModals'
import { STATUS, duration, fetchJobs, fetchPipelines, type Job, type Pipeline, type Watch } from './api'
import { tx } from '@/lib/i18n'

// Only one project is open at a time, so its detail can poll faster than the list.
const DETAIL_POLL_MS = 10_000

// A project's recent pipelines and the jobs of the chosen one (the latest by default), shown under its row.
export function PipelineDetail({ watch }: { watch: Watch }) {
  const pipelines = useAsync(() => fetchPipelines(watch.id), [watch.id])
  usePolling(pipelines.reload, true, DETAIL_POLL_MS)
  const [pipelineId, setPipelineId] = useState<string | null>(null)
  const current = pipelines.data?.find(p => p.id === pipelineId) ?? pipelines.data?.[0] ?? null

  return (
    <div className="stack">
      <Async
        state={pipelines}
        isEmpty={d => d.length === 0}
        skeleton={<SkeletonRows rows={2} height={32} />}
        empty={<Empty icon={Workflow} title={tx({ en: 'No pipeline in this project', pt: 'Nenhuma pipeline neste projeto' })} />}
      >
        {data => (
          <>
            <div className="pl-runs">
              {data.map(p => (
                <button key={p.id} className="chip" aria-pressed={p.id === current?.id} onClick={() => setPipelineId(p.id)} title={p.title}>
                  <span className={`dot ${dotFor(p)}`} />
                  <span className="mono">{p.ref}</span>
                  <span className="count">{relTime(p.createdAt)}</span>
                </button>
              ))}
            </div>
            {current && <Jobs key={current.id} watch={watch} pipeline={current} />}
          </>
        )}
      </Async>
    </div>
  )
}

const dotFor = (p: Pipeline) => (p.status === 'success' ? 'dot-ok' : p.status === 'failed' ? 'dot-crit' : 'dot-warn')

function Jobs({ watch, pipeline }: { watch: Watch; pipeline: Pipeline }) {
  const jobs = useAsync(() => fetchJobs(watch.id, pipeline.id), [watch.id, pipeline.id])
  usePolling(jobs.reload, true, DETAIL_POLL_MS)
  const [explaining, setExplaining] = useState<Job | null>(null)
  const [reading, setReading] = useState<Job | null>(null)

  return (
    <div className="stack" style={{ ['--gap' as string]: '10px' }}>
      <div className="row">
        <span className={`badge ${STATUS[pipeline.status].badge}`}>{STATUS[pipeline.status].label}</span>
        <span className="muted" style={{ fontSize: 12.5 }}>{pipeline.title} · <span className="mono">{pipeline.sha}</span> · {duration(pipeline.durationSec)}</span>
        <div className="spacer" />
        <a className="btn btn-sm" href={pipeline.webUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> {tx({ en: 'Open', pt: 'Abrir' })}</a>
      </div>
      <Async state={jobs} isEmpty={d => d.length === 0} skeleton={<SkeletonRows rows={4} height={36} />} empty={<p className="muted">{tx({ en: 'Pipeline with no jobs.', pt: 'Pipeline sem jobs.' })}</p>}>
        {data => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>{tx({ en: 'Stage', pt: 'Estágio' })}</th>
                  <th>Status</th>
                  <th className="num">{tx({ en: 'Duration', pt: 'Duração' })}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map(j => (
                  <tr key={j.id}>
                    <td>
                      <div className="mono">{j.name}</div>
                      {j.failedStep && <div className="muted" style={{ fontSize: 12 }}>{tx({ en: 'step:', pt: 'passo:' })} {j.failedStep}</div>}
                    </td>
                    <td className="muted">{j.stage || '—'}</td>
                    <td>
                      <span className={`badge ${STATUS[j.status].badge}`}>{STATUS[j.status].label}</span>
                      {j.allowFailure && j.status === 'failed' && <span className="muted" style={{ fontSize: 12 }}> {tx({ en: '(allowed)', pt: '(permitido)' })}</span>}
                    </td>
                    <td className="num mono">{duration(j.durationSec)}</td>
                    <td className="num">
                      <div className="row" style={{ ['--gap' as string]: '4px', justifyContent: 'flex-end' }}>
                        {j.status === 'failed' && <button className="btn btn-sm btn-primary" onClick={() => setExplaining(j)}><Sparkles size={13} /> {tx({ en: 'Explain failure', pt: 'Explicar falha' })}</button>}
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setReading(j)} title={tx({ en: 'See the log', pt: 'Ver o log' })}><FileText size={14} /></button>
                        <a className="btn btn-ghost btn-sm btn-icon" href={j.webUrl} target="_blank" rel="noreferrer" title={tx({ en: 'Open the job in the browser', pt: 'Abrir o job no navegador' })}><ExternalLink size={14} /></a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
      {explaining && <ExplainModal watch={watch} job={explaining} branch={pipeline.ref} onClose={() => setExplaining(null)} />}
      {reading && <LogModal watch={watch} job={reading} onClose={() => setReading(null)} />}
    </div>
  )
}
