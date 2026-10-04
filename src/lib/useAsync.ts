import { useCallback, useEffect, useState } from 'react'

type State<T> = { data: T | null; error: string | null; loading: boolean }
// `source` is the load function that produced `data`: it changes when deps change
type Tracked<T> = State<T> & { source: unknown }

export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<Tracked<T>>({ data: null, error: null, loading: true, source: null })

  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true, error: null }))
    load()
      .then(data => setState({ data, error: null, loading: false, source: load }))
      // A failed reload of the same query keeps what was on screen (a blip should not wipe
      // a page that polls); a failed load for new deps never shows the old deps' data.
      .catch((e: Error) =>
        setState(s => (s.source === load ? { ...s, error: e.message, loading: false } : { data: null, error: e.message, loading: false, source: null })),
      )
  }, deps)

  useEffect(() => {
    reload()
  }, [reload])

  const { source: _source, ...visible } = state
  return { ...visible, reload, setData: (data: T) => setState(s => ({ ...s, data })) }
}
