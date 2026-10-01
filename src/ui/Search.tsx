import { Search as SearchIcon, X } from 'lucide-react'

type Props = { value: string; onChange: (v: string) => void; placeholder: string; width?: number }

export function Search({ value, onChange, placeholder, width = 280 }: Props) {
  return (
    <label className="search" style={{ width }}>
      <SearchIcon size={14} />
      <input className="input" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {value && (
        <button className="btn btn-ghost btn-sm btn-icon" style={{ position: 'absolute', right: 3 }} onClick={() => onChange('')} title="Limpar busca">
          <X size={13} />
        </button>
      )}
    </label>
  )
}
