import { AlertTriangle, RotateCw } from 'lucide-react'
import { Link, useRouteError } from 'react-router'

// Erro numa tela fica dentro do layout: o menu continua ali e dá para ir para outra tela.
export function RouteError() {
  const error = useRouteError() as Error | undefined
  return (
    <div className="page">
      <div className="card card-pad stack" style={{ maxWidth: 720 }}>
        <div className="row">
          <AlertTriangle size={18} color="var(--crit)" />
          <b>Esta tela quebrou</b>
        </div>
        <p className="muted" style={{ margin: 0 }}>Um erro inesperado impediu a tela de abrir. As outras telas continuam funcionando.</p>
        <pre className="code" style={{ whiteSpace: 'pre-wrap' }}>{error?.message ?? String(error)}</pre>
        <div className="row">
          <button className="btn btn-primary" onClick={() => location.reload()}><RotateCw size={14} /> Recarregar</button>
          <Link className="btn" to="/">Ir para o início</Link>
        </div>
      </div>
    </div>
  )
}
