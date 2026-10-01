import { useCallback, useEffect, useState } from 'react'

type State<T> = { data: T | null; error: string | null; loading: boolean }

export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true })

  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true, error: null }))
    load()
      .then(data => setState({ data, error: null, loading: false }))
      .catch((e: Error) => setState({ data: null, error: e.message, loading: false }))
  }, deps)

  useEffect(() => {
    reload()
  }, [reload])

  return { ...state, reload, setData: (data: T) => setState(s => ({ ...s, data })) }
}
