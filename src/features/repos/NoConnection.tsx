import { Plus } from 'lucide-react'
import { fetchStatus } from '@/lib/status'
import { useAsync } from '@/lib/useAsync'
import { fetchHints } from './api'
import { tx } from '@/lib/i18n'

type Check = { label: string; ok: boolean | null; detail: string; optional?: boolean }

// Empty state that says what is missing, item by item, instead of just "no connection".
export function NoConnection({ onConnect }: { onConnect: () => void }) {
  const status = useAsync(fetchStatus)
  const hints = useAsync(fetchHints)
  const git = status.data?.tools.find(t => t.name === 'git')
  const token = hints.data && (hints.data.GITLAB_TOKEN || hints.data.GITHUB_TOKEN || hints.data.gh)

  const checks: Check[] = [
    { label: 'Git', ok: status.data ? Boolean(git?.version) : null, detail: git?.version ? `git ${git.version}` : tx({ en: 'not found on PATH', pt: 'não encontrado no PATH' }) },
    {
      label: tx({ en: 'Token in the environment', pt: 'Token no ambiente' }),
      ok: hints.data ? Boolean(token) : null,
      optional: true,
      detail: hints.data ? (token ? [hints.data.GITLAB_TOKEN && 'GITLAB_TOKEN', hints.data.GITHUB_TOKEN && 'GITHUB_TOKEN', hints.data.gh && 'gh auth'].filter(Boolean).join(' · ') : tx({ en: 'optional: you can paste the token in the wizard', pt: 'opcional: dá para colar o token no assistente' })) : '…',
    },
    { label: tx({ en: 'GitLab/GitHub connection', pt: 'Conexão GitLab/GitHub' }), ok: false, detail: tx({ en: 'no saved connection', pt: 'nenhuma conexão salva' }) },
  ]
  const required = checks.filter(c => !c.optional)
  const missing = required.filter(c => c.ok === false).length

  return (
    <div className="card need-card">
      <div className="need-count">
        <span className="eyebrow">{tx({ en: 'Missing', pt: 'Falta' })}</span>
        <b className="display">{missing}</b>
        <span className="muted">{tx({ en: `of ${required.length} requirements`, pt: `de ${required.length} requisitos` })}</span>
      </div>
      <div className="need-body">
        <h2 className="display">{tx({ en: 'No connection to GitLab or GitHub', pt: 'Nenhuma conexão com GitLab ou GitHub' })}</h2>
        <p className="muted">{tx({ en: 'Without a connection there are no groups to browse and no repositories to clone with the folder hierarchy.', pt: 'Sem conexão não há grupos para navegar nem repositórios para clonar com a hierarquia de pastas.' })}</p>
        <dl className="need-list">
          {checks.map(c => (
            <div key={c.label}>
              <dt>{c.ok === null ? <span className="badge">…</span> : c.ok ? <span className="badge badge-ok">● ok</span> : c.optional ? <span className="badge">○ {tx({ en: 'optional', pt: 'opcional' })}</span> : <span className="badge badge-crit">◆ {tx({ en: 'missing', pt: 'falta' })}</span>}</dt>
              <dd><b>{c.label}</b><span className="mono muted">{c.detail}</span></dd>
            </div>
          ))}
        </dl>
        <button className="btn btn-primary" onClick={onConnect}><Plus size={14} /> {tx({ en: 'Connect GitLab or GitHub', pt: 'Conectar GitLab ou GitHub' })}</button>
      </div>
    </div>
  )
}
