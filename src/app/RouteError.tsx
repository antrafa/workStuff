import { AlertTriangle, RotateCw } from 'lucide-react'
import { Link, useRouteError } from 'react-router'
import { tx } from '@/lib/i18n'

// An error in a screen stays inside the layout: the menu is still there to go somewhere else.
export function RouteError() {
  const error = useRouteError() as Error | undefined
  return (
    <div className="page">
      <div className="card card-pad stack" style={{ maxWidth: 720 }}>
        <div className="row">
          <AlertTriangle size={18} color="var(--crit)" />
          <b>{tx({ en: 'This screen broke', pt: 'Esta tela quebrou' })}</b>
        </div>
        <p className="muted" style={{ margin: 0 }}>{tx({ en: 'An unexpected error kept this screen from opening. The other screens still work.', pt: 'Um erro inesperado impediu a tela de abrir. As outras telas continuam funcionando.' })}</p>
        <pre className="code" style={{ whiteSpace: 'pre-wrap' }}>{error?.message ?? String(error)}</pre>
        <div className="row">
          <button className="btn btn-primary" onClick={() => location.reload()}><RotateCw size={14} /> {tx({ en: 'Reload', pt: 'Recarregar' })}</button>
          <Link className="btn" to="/">{tx({ en: 'Go home', pt: 'Ir para o início' })}</Link>
        </div>
      </div>
    </div>
  )
}
