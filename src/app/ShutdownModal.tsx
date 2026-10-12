import { CheckCircle2, Power } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/ui'
import { requestShutdown } from '@/lib/status'
import { tx } from '@/lib/i18n'

type Props = {
  onClose: () => void
}

export function ShutdownModal({ onClose }: Props) {
  const [shuttingDown, setShuttingDown] = useState(false)
  const [shutDownDone, setShutDownDone] = useState(false)

  const handleShutdown = async () => {
    setShuttingDown(true)
    try {
      await requestShutdown()
    } catch {
      // In case the connection dropped immediately upon kill
    }
    setShutDownDone(true)
    setShuttingDown(false)
  }

  const handleCloseTab = () => {
    window.close()
  }

  if (shutDownDone) {
    return (
      <Modal
        title={tx({ en: 'workStuff stopped', pt: 'workStuff encerrado' })}
        onClose={onClose}
        width={480}
        footer={
          <button className="btn btn-primary" onClick={handleCloseTab}>
            {tx({ en: 'Close tab', pt: 'Fechar aba' })}
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', textAlign: 'center', padding: '16px 8px' }}>
          <div style={{ color: 'var(--ok, #10b981)', display: 'grid', placeItems: 'center' }}>
            <CheckCircle2 size={44} />
          </div>
          <h3 style={{ margin: 0 }}>
            {tx({ en: 'Processes terminated', pt: 'Processos finalizados' })}
          </h3>
          <p className="muted" style={{ margin: 0 }}>
            {tx({
              en: 'The local web server and API processes have shut down. You can safely close this browser tab.',
              pt: 'Os processos do servidor web e da API foram encerrados. Você já pode fechar esta aba com segurança.',
            })}
          </p>
          <span className="mono muted" style={{ fontSize: '0.8rem' }}>
            {tx({ en: 'Shortcut: Ctrl+W or Cmd+W', pt: 'Atalho: Ctrl+W ou Cmd+W' })}
          </span>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Power size={16} style={{ color: 'var(--crit, #ef4444)' }} />
          <span>{tx({ en: 'Shut down workStuff', pt: 'Encerrar o workStuff' })}</span>
        </div>
      }
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={shuttingDown}>
            {tx({ en: 'Cancel', pt: 'Cancelar' })}
          </button>
          <button
            className="btn btn-danger-solid"
            onClick={handleShutdown}
            disabled={shuttingDown}
          >
            <Power size={14} />
            {shuttingDown
              ? tx({ en: 'Shutting down…', pt: 'Encerrando…' })
              : tx({ en: 'Shut down', pt: 'Encerrar' })}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ margin: 0 }}>
          {tx({
            en: 'Are you sure you want to stop workStuff?',
            pt: 'Tem certeza que deseja encerrar o workStuff?',
          })}
        </p>
        <p className="muted" style={{ margin: 0 }}>
          {tx({
            en: 'This will terminate both the local API server and the web interface processes. Any ongoing background tasks will be stopped.',
            pt: 'Isso vai encerrar os processos do servidor da API e da interface web. Quaisquer tarefas em segundo plano serão interrompidas.',
          })}
        </p>
        <div className="callout" style={{ fontSize: '0.875rem' }}>
          {tx({
            en: <>To start it again later, click the <b>workStuff</b> app shortcut or run <code className="inline">npm run dev</code>.</>,
            pt: <>Para reiniciar mais tarde, abra o atalho do <b>workStuff</b> ou execute <code className="inline">npm run dev</code>.</>,
          })}
        </div>
      </div>
    </Modal>
  )
}
