import { AlertTriangle, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'

type Props<T> = {
  state: { data: T | null; error: string | null; loading: boolean; reload: () => void }
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}

// Estado padrão de carregando / erro / vazio para qualquer dado assíncrono.
export function Async<T>({ state, isEmpty, empty, skeleton, children }: Props<T>) {
  const failure = state.error && (
    <div className="callout callout-crit">
      <AlertTriangle size={16} />
      <div className="spacer">{state.error}</div>
      <button className="btn btn-sm" onClick={state.reload}>
        <RotateCw size={13} /> Tentar de novo
      </button>
    </div>
  )
  // Without data the error is the whole answer; with data from an earlier load, it sits on top
  if (state.error && !state.data) return failure
  if (state.loading && !state.data) return <>{skeleton ?? <SkeletonRows />}</>
  if (!state.data) return null
  if (isEmpty?.(state.data)) return <>{failure}{empty}</>
  return (
    <>
      {failure}
      {children(state.data)}
    </>
  )
}

export function SkeletonRows({ rows = 4, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  )
}
