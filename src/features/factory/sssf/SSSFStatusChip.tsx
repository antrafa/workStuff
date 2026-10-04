type Props = {
  status?: string
}

export function SSSFStatusChip({ status = 'queued' }: Props) {
  const isSuccess = status === 'success' || status === 'done' || status === 'review'
  const isRunning = status === 'running' || status === 'planning' || status === 'building' || status === 'qa_security'
  const isFail = status === 'fail' || status === 'error'

  if (isSuccess) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 10px',
          borderRadius: 999,
          background: 'rgba(74, 222, 128, 0.15)',
          border: '1px solid rgba(74, 222, 128, 0.35)',
          color: '#4ade80',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span>✓</span>
        <span>success</span>
      </span>
    )
  }

  if (isRunning) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 10px',
          borderRadius: 999,
          background: 'rgba(108, 182, 255, 0.15)',
          border: '1px solid rgba(108, 182, 255, 0.45)',
          color: '#6cb6ff',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#6cb6ff', boxShadow: '0 0 8px #6cb6ff', animation: 'pulse 1.4s infinite' }} />
        <span>running</span>
      </span>
    )
  }

  if (isFail) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 10px',
          borderRadius: 999,
          background: 'rgba(255, 111, 103, 0.15)',
          border: '1px solid rgba(255, 111, 103, 0.45)',
          color: '#ff6f67',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span>✕</span>
        <span>error</span>
      </span>
    )
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        borderRadius: 999,
        background: 'rgba(139, 156, 182, 0.12)',
        border: '1px solid rgba(139, 156, 182, 0.25)',
        color: '#8b9cb6',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 12,
      }}
    >
      <span>○</span>
      <span>{status}</span>
    </span>
  )
}
