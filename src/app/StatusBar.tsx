import { Link } from 'react-router'
import { fetchStatus } from '@/lib/status'
import { tx } from '@/lib/i18n'
import { useAsync } from '@/lib/useAsync'

// Footer: the server is up, and what this machine has for the screens to work.
export function StatusBar() {
  const status = useAsync(fetchStatus)
  if (status.error) return <footer className="statusbar"><span className="dot dot-crit" /> {tx({ en: 'local server did not respond', pt: 'servidor local não respondeu' })}</footer>
  if (!status.data) return <footer className="statusbar" />
  const { tools, agents, port, tunnels } = status.data
  return (
    <footer className="statusbar mono">
      <span><span className="dot dot-ok" /> {tx({ en: 'local server', pt: 'servidor local' })} :{port}</span>
      {tools.map(t => <span key={t.name} className={t.version ? '' : 'missing'} title={t.version ? undefined : tx({ en: `${t.name} not found on PATH`, pt: `${t.name} não encontrado no PATH` })}>{t.name} {t.version ?? tx({ en: 'missing', pt: 'ausente' })}</span>)}
      {agents.filter(a => a.installed).map(a => <span key={a.name}>{a.name} ok</span>)}
      {tunnels && tunnels.count > 0 && (
        <Link
          to="/servicos?aba=tuneis"
          style={{ color: tunnels.sensitiveCount > 0 ? 'var(--warn)' : 'var(--signal)', textDecoration: 'none' }}
          title={tx({ en: 'Open active Kubernetes port-forward tunnels', pt: 'Abrir túneis Kubernetes port-forward ativos' })}
        >
          <span className={`dot ${tunnels.sensitiveCount > 0 ? 'dot-warn' : 'dot-ok'}`} />{' '}
          {tunnels.count} {tunnels.count === 1 ? tx({ en: 'K8s tunnel', pt: 'túnel K8s' }) : tx({ en: 'K8s tunnels', pt: 'túneis K8s' })} ({tunnels.environments.join('/')})
        </Link>
      )}
    </footer>
  )
}
