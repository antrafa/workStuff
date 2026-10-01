type Option<T extends string> = { id: T; label: string; count?: number }
type Props<T extends string> = { options: Option<T>[]; value: T; onChange: (v: T) => void }

export function Chips<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div className="row" style={{ ['--gap' as string]: '6px' }}>
      {options.map(o => (
        <button key={o.id} className="chip" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count !== undefined && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div className="segmented">
      {options.map(o => (
        <button key={o.id} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
