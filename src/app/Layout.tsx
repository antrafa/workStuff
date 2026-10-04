import { AlertTriangle, ChevronRight, FlaskConical, Menu, Moon, Search, Settings, Star, Sun } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { EnvStamp, PageHelpContext, SkeletonRows } from '@/ui'
import { favoriteAt, recordVisit, toggleFavorite, toggleGroup, useFavorites, useHiddenPaths, useOpenGroups } from './menu'
import { NAV, findNav, type NavItem } from './nav'
import { CommandPalette } from './CommandPalette'
import { HelpModal } from './HelpModal'
import { StatusBar } from './StatusBar'
import { helpFor } from './help'
import { setTheme, useTheme } from './theme'
import { refreshSession, useClusterShared } from '@/features/cluster/api'

// O que a moldura avisa em cada ambiente; sem classificação vale como PRO.
const FRAME_TAG: Record<string, string> = {
  DES: 'DES · desenvolvimento · ações com confirmação',
  ITG: 'ITG · integração · ações com confirmação',
  HML: 'HML · homologação · ações com confirmação',
  PRO: 'PRO · produção · somente leitura',
  none: 'sem ambiente · somente leitura até classificar',
}

export function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const cluster = useClusterShared()
  useEffect(() => void refreshSession(), [])
  const current = findNav(pathname)
  const theme = useTheme()
  const dark = document.documentElement.dataset.theme !== 'light'
  const favorites = useFavorites()
  const [navOpen, setNavOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const help = helpFor(pathname)
  const pageHelp = help ? { purpose: help.purpose, open: () => setHelpOpen(true) } : null

  // A moldura só aparece nas telas que agem sobre o cluster conectado; o resto é esta máquina.
  const onCluster = current?.group.label === 'Kubernetes' && cluster.session
  const env = onCluster ? (cluster.session!.kubeconfig.environment ?? 'none') : null

  // No celular o menu é gaveta: fecha sozinho ao trocar de tela.
  useEffect(() => {
    setNavOpen(false)
    setHelpOpen(false)
    if (current) recordVisit(current.item.path)
  }, [pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(open => !open)
      }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const path = favoriteAt(Number(e.key) - 1)
        if (path) (e.preventDefault(), navigate(path))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`} data-env={env ?? undefined}>
      {env && <div className="env-frame" aria-hidden />}
      {env && <div className="env-tag" role="status">{FRAME_TAG[env]}</div>}
      <div className="nav-backdrop" onClick={() => setNavOpen(false)} />
      <Sidebar currentGroup={current?.group.label} favorites={favorites} onSearch={() => setPaletteOpen(true)} />

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon nav-toggle" onClick={() => setNavOpen(true)} title="Abrir menu">
            <Menu size={18} />
          </button>
          {onCluster ? (
            <div className="topbar-env">
              <EnvStamp env={cluster.session!.kubeconfig.environment} large />
              <div className="topbar-env-name mono">
                <b>{cluster.session!.kubeconfig.filename.replace(/\.(ya?ml|kubeconfig)$/, '')}</b>
                <small>{cluster.session!.context}</small>
              </div>
              <Link to="/cluster" className="btn btn-sm">trocar</Link>
            </div>
          ) : (
            <div className="topbar-env">
              <EnvStamp env="LOCAL" large />
              <span className="mono muted topbar-env-name">esta máquina</span>
            </div>
          )}
          <div className="crumbs">
            {current ? (
              <>
                <span className="eyebrow">{current.group.label}</span> <ChevronRight size={12} /> <b>{current.item.label}</b>
                <button
                  className={`btn btn-ghost btn-sm btn-icon fav-toggle ${favorites.includes(current.item.path) ? 'on' : ''}`}
                  onClick={() => toggleFavorite(current.item.path)}
                  title={favorites.includes(current.item.path) ? 'Tirar dos favoritos' : 'Favoritar: aparece no topo do menu e abre com Alt + número'}
                >
                  <Star size={14} />
                </button>
              </>
            ) : (
              <b>Configurações</b>
            )}
          </div>
          <div className="spacer" />
          {cluster.session && cluster.problems > 0 && (
            <Link to="/cluster/problemas" className="pill-link crit" title="Pods com problema na última leitura do cluster ativo">
              <AlertTriangle size={13} />
              {cluster.problems} pods com problema
            </Link>
          )}
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            title={`Tema atual: ${theme}. Clique para ${dark ? 'claro' : 'escuro'}`}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>
        <main className="content">
          {current?.item.mock && (
            <div className="mock-banner" role="status">
              <FlaskConical size={15} />
              <span>
                <b>Tela em mock.</b> Os dados são de exemplo e as ações só simulam o resultado: nada é lido nem alterado de verdade.
              </span>
            </div>
          )}
          <PageHelpContext.Provider value={pageHelp}>
            <Suspense fallback={<SkeletonRows rows={6} height={56} />}>
              <Outlet />
            </Suspense>
          </PageHelpContext.Provider>
          {helpOpen && <HelpModal pathname={pathname} title={current?.item.label ?? 'Configurações'} onClose={() => setHelpOpen(false)} />}
        </main>
        <StatusBar />
      </div>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  )
}

type SidebarProps = { currentGroup?: string; favorites: string[]; onSearch: () => void }

function Sidebar({ currentGroup, favorites, onSearch }: SidebarProps) {
  const hidden = useHiddenPaths()
  const openGroups = useOpenGroups()
  const favoriteItems = favorites.map(path => NAV.flatMap(g => g.items).find(i => i.path === path)).filter((i): i is NavItem => Boolean(i))

  return (
    <aside className="sidebar">
      <Link to="/" className="brand">
        <span className="brand-name display">workStuff</span>
      </Link>
      <button className="nav-search" onClick={onSearch} title="Ir para qualquer tela pelo nome ou pelo que ela faz">
        <Search size={14} /> <span>Buscar tela</span> <kbd>Ctrl K</kbd>
      </button>
      <nav className="nav">
        {favoriteItems.length > 0 && (
          <div className="nav-group">
            <div className="eyebrow nav-group-head static">Favoritos</div>
            {favoriteItems.map((item, i) => <NavItemLink key={item.path} item={item} favorite shortcut={i + 1} />)}
          </div>
        )}
        {NAV.map(group => {
          const items = group.items.filter(i => !hidden.includes(i.path))
          if (items.length === 0) return null
          const open = group.label === currentGroup || openGroups.includes(group.label)
          return (
            <div key={group.label} className="nav-group">
              <button className="eyebrow nav-group-head" aria-expanded={open} onClick={() => toggleGroup(group.label)} disabled={group.label === currentGroup}>
                {group.label} <span className="spacer" /> <span className="mono">{items.length}</span> <ChevronRight size={11} className="nav-chevron" />
              </button>
              {open && items.map(item => <NavItemLink key={item.path} item={item} />)}
            </div>
          )
        })}
      </nav>
      <div className="nav-foot">
        <NavLink to="/configuracoes" className="nav-link">
          <Settings size={15} />
          <span>Configurações</span>
        </NavLink>
      </div>
    </aside>
  )
}

function NavItemLink({ item, favorite, shortcut }: { item: NavItem; favorite?: boolean; shortcut?: number }) {
  const Icon = favorite ? Star : item.icon
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={`nav-link ${favorite ? 'is-favorite' : ''}`}
      title={item.mock ? `${item.hint} · ainda com dados de exemplo` : item.hint}
    >
      <Icon size={15} />
      <span>{item.label}{item.mock && <span className="nav-mock">mock</span>}</span>
      {shortcut && <kbd title={`Alt ${shortcut}`}>{shortcut}</kbd>}
    </NavLink>
  )
}
