import { Search, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useClusterShared } from '@/features/cluster/api'
import { NAV, type NavItem } from './nav'
import { toggleFavorite, useFavorites, useHiddenPaths, useRecents } from './menu'

type Entry = { item: NavItem; group: string; signal?: string }
type Section = { title: string; entries: Entry[] }

const ALL: Entry[] = NAV.flatMap(g => g.items.map(item => ({ item, group: g.label })))
const byPath = (path: string) => ALL.find(e => e.item.path === path)

// Sem acento e minúsculo: "comparar" acha "Comparar", "servico" acha "Serviços".
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Ctrl K: ir para qualquer tela pelo nome ou pelo que ela faz. Ctrl D fixa a tela marcada nos favoritos.
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const navigate = useNavigate()
  const favorites = useFavorites()
  const recents = useRecents()
  const hidden = useHiddenPaths()
  const { session, problems } = useClusterShared()

  const sections = useMemo<Section[]>(() => {
    const q = fold(query.trim())
    if (q) {
      const hits = ALL.filter(e => fold(`${e.item.label} ${e.item.hint} ${e.group}`).includes(q))
      return [{ title: `Telas · ${hits.length}`, entries: hits }]
    }
    const urgent: Entry[] = session && problems > 0
      ? [{ ...byPath('/cluster')!, signal: `${problems} pods com problema · ${session.kubeconfig.environment ?? 'sem ambiente'}` }]
      : []
    const pick = (paths: string[]) => paths.map(byPath).filter((e): e is Entry => Boolean(e))
    return [
      { title: 'Precisa de você agora', entries: urgent },
      { title: 'Favoritos · Alt 1–9', entries: pick(favorites) },
      { title: 'Recentes', entries: pick(recents.filter(p => !favorites.includes(p))) },
      { title: 'Todas as telas', entries: ALL.filter(e => !hidden.includes(e.item.path)) },
    ].filter(s => s.entries.length > 0)
  }, [query, favorites, recents, hidden, session, problems])

  const flat = sections.flatMap(s => s.entries)
  const selected = Math.min(cursor, flat.length - 1)
  const active = flat[selected]

  useEffect(() => setCursor(0), [query])

  const open = (e: Entry | undefined) => {
    if (!e) return
    navigate(e.item.path)
    onClose()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setCursor(c => Math.min(c + 1, flat.length - 1)))
    else if (e.key === 'ArrowUp') (e.preventDefault(), setCursor(c => Math.max(c - 1, 0)))
    else if (e.key === 'Enter') open(active)
    else if (e.key === 'Escape') onClose()
    else if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey) && active) (e.preventDefault(), toggleFavorite(active.item.path))
  }

  let index = -1
  return (
    <div className="overlay palette-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Ir para tela" onKeyDown={onKey}>
        <div className="palette-input">
          <Search size={16} />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Tela ou o que ela faz…" spellCheck={false} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list">
          {sections.map(s => (
            <section key={s.title}>
              <div className="eyebrow palette-section">{s.title}</div>
              {s.entries.map(entry => {
                index += 1
                const i = index
                const Icon = entry.item.icon
                return (
                  <button
                    key={`${s.title}${entry.item.path}`}
                    className="palette-item"
                    aria-selected={i === selected}
                    onMouseMove={() => setCursor(i)}
                    onClick={() => open(entry)}
                  >
                    <Icon size={15} />
                    <span className="palette-label">{entry.item.label}</span>
                    {entry.signal ? <span className="badge badge-crit">{entry.signal}</span> : <span className="muted palette-hint">{entry.item.hint}</span>}
                    {favorites.includes(entry.item.path) && <Star size={12} className="palette-star" />}
                    <span className="eyebrow">{entry.group}</span>
                  </button>
                )
              })}
            </section>
          ))}
          {flat.length === 0 && <p className="muted palette-empty">Nenhuma tela casa com “{query}”.</p>}
        </div>
        <div className="palette-foot">
          <span><kbd>↑↓</kbd> mover</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>Ctrl D</kbd> {active && favorites.includes(active.item.path) ? 'tirar dos favoritos' : 'favoritar'}</span>
        </div>
      </div>
    </div>
  )
}
