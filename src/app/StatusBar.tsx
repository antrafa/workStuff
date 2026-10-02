import { fetchStatus } from '@/lib/status'
import { useAsync } from '@/lib/useAsync'

// Rodapé: o servidor está de pé e o que esta máquina tem para as telas trabalharem.
export function StatusBar() {
  const status = useAsync(fetchStatus)
  if (status.error) return <footer className="statusbar"><span className="dot dot-crit" /> servidor local não respondeu</footer>
  if (!status.data) return <footer className="statusbar" />
  const { tools, agents, port } = status.data
  return (
    <footer className="statusbar mono">
      <span><span className="dot dot-ok" /> servidor local :{port}</span>
      {tools.map(t => <span key={t.name} className={t.version ? '' : 'missing'} title={t.version ? undefined : `${t.name} não encontrado no PATH`}>{t.name} {t.version ?? 'ausente'}</span>)}
      {agents.filter(a => a.installed).map(a => <span key={a.name}>{a.name} ok</span>)}
    </footer>
  )
}
