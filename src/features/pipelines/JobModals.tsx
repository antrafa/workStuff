import { AiStream, Async, CopyButton, Modal, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { explainJob, fetchJobLog, type ExplainEvent, type Job, type Watch } from './api'

type Props = { watch: Watch; job: Job; onClose: () => void }

export function ExplainModal({ watch, job, branch, onClose }: Props & { branch: string }) {
  return (
    <Modal title={<>Por que <span className="mono">{job.name}</span> falhou</>} width={780} onClose={onClose}>
      <AiStream<ExplainEvent>
        initial="baixando o log do job…"
        start={(onEvent, signal) => explainJob(watch.id, job, branch, onEvent, signal)}
        describe={e => {
          if (e.type !== 'log' || !('lines' in e)) return null
          const where = e.clone ? `; a IA também lê o código em ${e.clone}` : '; projeto não clonado, só o log'
          return `${e.lines} linhas de log${e.truncated ? ' (fim do log)' : ''} enviadas${where}…`
        }}
      />
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
