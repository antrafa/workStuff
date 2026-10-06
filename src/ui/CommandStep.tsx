import './code.css'
import { Lock, Play, Zap } from 'lucide-react'
import { CopyButton } from './CopyButton'
import { tx } from '@/lib/i18n'

export type CommandResult = { ok: boolean; output: string }

type Props = {
  command: string
  kind: 'read' | 'write' | 'blocked'
  reason?: string
  result?: CommandResult | 'running'
  disabled?: boolean
  onRun: () => void
}

// One executable step of a runbook: the command as a terminal line, what it does to the
// machine (read or write), and its output underneath.
export function CommandStep({ command, kind, reason, result, disabled, onRun }: Props) {
  return (
    <div className={`cmd-step cmd-${kind}`}>
      <div className="cmd-step-line">
        <span className="cmd-prompt">$</span>
        <code>{command}</code>
        <div className="cmd-step-actions">
          <span className="cmd-kind" title={reason}>
            {kind === 'blocked' && <Lock size={10} />}
            {kind === 'read' ? tx({ en: 'read', pt: 'leitura' }) : kind === 'write' ? tx({ en: 'write', pt: 'escrita' }) : tx({ en: 'blocked', pt: 'bloqueado' })}
          </span>
          <CopyButton value={command} />
          {kind !== 'blocked' && (
            <button className={`btn btn-sm ${kind === 'write' ? 'btn-danger' : 'btn-primary'}`} disabled={disabled || result === 'running'} onClick={onRun}>
              {kind === 'write' ? <><Zap size={12} /> {tx({ en: 'Execute', pt: 'Executar' })}</> : <><Play size={12} /> {tx({ en: 'Run', pt: 'Rodar' })}</>}
            </button>
          )}
        </div>
      </div>
      {kind === 'blocked' && reason && <div className="cmd-note">{reason}</div>}
      {result === 'running' && <div className="cmd-note">executando…</div>}
      {result && result !== 'running' && (
        <pre className={`cmd-out ${result.ok ? 'is-ok' : 'is-fail'}`}>{result.output || tx({ en: '(ran, no output)', pt: '(executado, sem saída)' })}</pre>
      )}
    </div>
  )
}
