import { Plus } from 'lucide-react'
import { fetchStatus } from '@/lib/status'
import { useAsync } from '@/lib/useAsync'
import { fetchHints } from './api'

type Check = { label: string; ok: boolean | null; detail: string; optional?: boolean }

// Estado vazio que diz o que falta, item a item, em vez de só "nenhuma conexão".
export function NoConnection({ onConnect }: { onConnect: () => void }) {
  const status = useAsync(fetchStatus)
  const hints = useAsync(fetchHints)
  const git = status.data?.tools.find(t => t.name === 'git')
  const token = hints.data && (hints.data.GITLAB_TOKEN || hints.data.GITHUB_TOKEN || hints.data.gh)

  const checks: Check[] = [
    { label: 'Git', ok: status.data ? Boolean(git?.version) : null, detail: git?.version ? `git ${git.version}` : 'não encontrado no PATH' },
    {
      label: 'Token no ambiente',
      ok: hints.data ? Boolean(token) : null,
      optional: true,
      detail: hints.data ? (token ? [hints.data.GITLAB_TOKEN && 'GITLAB_TOKEN', hints.data.GITHUB_TOKEN && 'GITHUB_TOKEN', hints.data.gh && 'gh auth'].filter(Boolean).join(' · ') : 'opcional: dá para colar o token no assistente') : '…',
    },
    { label: 'Conexão GitLab/GitHub', ok: false, detail: 'nenhuma conexão salva' },
  ]
  const required = checks.filter(c => !c.optional)
  const missing = required.filter(c => c.ok === false).length

  return (
    <div className="card need-card">
      <div className="need-count">
        <span className="eyebrow">Falta</span>
        <b className="display">{missing}</b>
        <span className="muted">de {required.length} requisitos</span>
      </div>
      <div className="need-body">
        <h2 className="display">Nenhuma conexão com GitLab ou GitHub</h2>
        <p className="muted">Sem conexão não há grupos para navegar nem repositórios para clonar com a hierarquia de pastas.</p>
        <dl className="need-list">
          {checks.map(c => (
            <div key={c.label}>
              <dt>{c.ok === null ? <span className="badge">…</span> : c.ok ? <span className="badge badge-ok">● ok</span> : c.optional ? <span className="badge">○ opcional</span> : <span className="badge badge-crit">◆ falta</span>}</dt>
              <dd><b>{c.label}</b><span className="mono muted">{c.detail}</span></dd>
            </div>
          ))}
        </dl>
        <button className="btn btn-primary" onClick={onConnect}><Plus size={14} /> Conectar GitLab ou GitHub</button>
      </div>
    </div>
  )
}
