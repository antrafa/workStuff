import { useEffect } from 'react'

const POLL_MS = 30_000

// Recarrega a cada 30s (ou `ms`) enquanto a aba do navegador está visível.
export function usePolling(reload: () => void, enabled: boolean, ms = POLL_MS) {
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => document.visibilityState === 'visible' && reload(), ms)
    return () => clearInterval(id)
  }, [reload, enabled, ms])
}
