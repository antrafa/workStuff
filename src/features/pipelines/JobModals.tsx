import { AiStream, Async, CopyButton, Modal, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { explainJob, fetchJobLog, type ExplainEvent, type Job, type Watch } from './api'
import { tx } from '@/lib/i18n'

type Props = { watch: Watch; job: Job; onClose: () => void }

export function ExplainModal({ watch, job, branch, onClose }: Props & { branch: string }) {
  return (
    <Modal title={tx({ en: <>Why <span className="mono">{job.name}</span> failed</>, pt: <>Por que <span className="mono">{job.name}</span> falhou</> })} width={780} onClose={onClose}>
      <AiStream<ExplainEvent>
        initial={tx({ en: 'downloading the job log…', pt: 'baixando o log do job…' })}
        start={(onEvent, signal) => explainJob(watch.id, job, branch, onEvent, signal)}
        describe={e => {
          if (e.type !== 'log' || !('lines' in e)) return null
          return tx({
            en: `${e.lines} log lines${e.truncated ? ' (end of the log)' : ''} sent${e.clone ? `; the AI also reads the code in ${e.clone}` : '; project not cloned, log only'}…`,
            pt: `${e.lines} linhas de log${e.truncated ? ' (fim do log)' : ''} enviadas${e.clone ? `; a IA também lê o código em ${e.clone}` : '; projeto não clonado, só o log'}…`,
          })
        }}
      />
    </Modal>
  )
}

export function LogModal({ watch, job, onClose }: Props) {
  const log = useAsync(() => fetchJobLog(watch.id, job.id), [watch.id, job.id])
  return (
    <Modal title={tx({ en: <>Log of <span className="mono">{job.name}</span></>, pt: <>Log de <span className="mono">{job.name}</span></> })} width={960} onClose={onClose}>
      <Async state={log} skeleton={<SkeletonRows rows={8} height={14} />}>
        {d => (
          <div className="stack" style={{ ['--gap' as string]: '8px' }}>
            <div className="row">
              <span className="muted" style={{ fontSize: 12 }}>{d.truncated ? tx({ en: 'Long log: showing the end.', pt: 'Log longo: mostrando o fim.' }) : tx({ en: `${d.text.split('\n').length} lines`, pt: `${d.text.split('\n').length} linhas` })}</span>
              <div className="spacer" />
              <CopyButton value={d.text} label={tx({ en: 'Copy', pt: 'Copiar' })} />
            </div>
            <pre className="code pl-log">{d.text || tx({ en: '(empty log)', pt: '(log vazio)' })}</pre>
          </div>
        )}
      </Async>
    </Modal>
  )
}
