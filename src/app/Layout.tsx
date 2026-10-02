import { AlertTriangle, FlaskConical, Menu, Moon, Settings, Sun } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { PageHelpContext, SkeletonRows } from '@/ui'
import { useHiddenPaths } from './menu'
import { NAV, findNav } from './nav'
import { AppIcon } from './AppIcon'
import { HelpModal } from './HelpModal'
import { helpFor } from './help'
import { setTheme, useTheme } from './theme'
import { refreshSession, useClusterShared } from '@/features/cluster/api'
import { EnvBadge } from '@/features/cluster/KubeconfigBar'

export function Layout() {
  const { pathname } = useLocation()
  const cluster = useClusterShared()
  useEffect(() => void refreshSession(), [])
  const current = findNav(pathname)
  const theme = useTheme()
  const dark = document.documentElement.dataset.theme !== 'light'
  const hidden = useHiddenPaths()
  const [navOpen, setNavOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const help = helpFor(pathname)
  const pageHelp = help ? { purpose: help.purpose, open: () => setHelpOpen(true) } : null

  // No celular o menu é gaveta: fecha sozinho ao trocar de tela.
  useEffect(() => {
    setNavOpen(false)
    setHelpOpen(false)
  }, [pathname])

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <div className="nav-backdrop" onClick={() => setNavOpen(false)} />
      <aside className="sidebar">
        <Link to="/" className="brand">
          <AppIcon />
          <div className="brand-name">
            work<span>Stuff</span>
          </div>
        </Link>
        <nav className="nav">
          {NAV.map(group => {
            const items = group.items.filter(i => !hidden.includes(i.path))
            if (items.length === 0) return null
            return (
              <div key={group.label} className="nav-group">
                <div className="eyebrow">{group.label}</div>
                {items.map(({ path, label, hint, icon: Icon, mock }) => (
                  <NavLink key={path} to={path} className="nav-link" title={mock ? `${hint} · ainda com dados de exemplo` : hint}>
                    <Icon size={16} />
                    <b>{label}{mock && <span className="nav-mock">mock</span>}</b>
                    <small>{hint}</small>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="nav-foot">
          <NavLink to="/configuracoes" className="nav-link">
            <Settings size={16} />
            <b>Configurações</b>
            <small>IA, tema e menu</small>
          </NavLink>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon nav-toggle" onClick={() => setNavOpen(true)} title="Abrir menu">
            <Menu size={18} />
          </button>
          <div className="crumbs">
            {current ? (
              <>
                {current.group.label} <span>/</span> <b>{current.item.label}</b>
              </>
            ) : (
              <b>Configurações</b>
            )}
          </div>
          <div className="spacer" />
          {cluster.session && (
            <Link to="/cluster" className="pill-link" title={`Kubeconfig ativo: ${cluster.session.kubeconfig.filename} · contexto ${cluster.session.context}`}>
              <span className="dot dot-ok" />
              <span className="mono">{cluster.session.kubeconfig.filename.replace(/\.(ya?ml|kubeconfig)$/, '')}</span>
              <EnvBadge env={cluster.session.kubeconfig.environment} />
            </Link>
          )}
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
      </div>
    </div>
  )
}
