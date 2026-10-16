import { ExternalLink, Inbox, MessageSquare, RotateCw } from 'lucide-react'
import { Link } from 'react-router'
import { Async, Empty, SkeletonRows } from '@/ui'
import { api } from '@/lib/api'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { tx } from '@/lib/i18n'

// The server's words for what blocks a merge (server/lib/review/queue.ts)
export type QueueState =
  | 'conflict' | 'rebase' | 'ci_failed' | 'ci_running' | 'needs_approval' | 'changes_requested'
  | 'discussions' | 'draft' | 'ready' | 'blocked' | 'unknown'

export type QueueMr = {
  sourceId: string
  provider: 'gitlab' | 'github'
  fullPath: string
  iid: number
  title: string
  author: string
  webUrl: string
  updatedAt: string
  sourceBranch: string
  targetBranch: string
  state: QueueState
  comments: number
}

export type Queue = { toReview: QueueMr[]; mine: QueueMr[]; errors: { source: string; error: string }[]; sources: number }

export const fetchQueue = () => api.get<Queue>('/review/queue')

// Label and color of each state: red stops the merge, yellow waits on someone, green can go
export const STATE: Record<QueueState, { label: string; badge: string }> = {
  conflict: { label: tx({ en: 'conflict', pt: 'conflito' }), badge: 'badge-crit' },
  rebase: { label: tx({ en: 'needs rebase', pt: 'precisa de rebase' }), badge: 'badge-crit' },
  ci_failed: { label: tx({ en: 'pipeline failed', pt: 'esteira falhou' }), badge: 'badge-crit' },
  changes_requested: { label: tx({ en: 'changes requested', pt: 'pediram mudança' }), badge: 'badge-warn' },
  ci_running: { label: tx({ en: 'pipeline running', pt: 'esteira rodando' }), badge: 'badge-info' },
  needs_approval: { label: tx({ en: 'waiting for approval', pt: 'falta aprovação' }), badge: 'badge-warn' },
  discussions: { label: tx({ en: 'open threads', pt: 'discussão aberta' }), badge: 'badge-warn' },
  draft: { label: tx({ en: 'draft', pt: 'rascunho' }), badge: '' },
  ready: { label: tx({ en: 'ready to merge', pt: 'pronto para merge' }), badge: 'badge-ok' },
  blocked: { label: tx({ en: 'blocked', pt: 'bloqueado' }), badge: 'badge-warn' },
  unknown: { label: tx({ en: 'see on the server', pt: 'ver no servidor' }), badge: '' },
}

const ref = (m: QueueMr) => (m.provider === 'gitlab' ? `!${m.iid}` : `#${m.iid}`)

export function QueueTab() {
  const queue = useAsync(fetchQueue)
  return (
    <div className="stack">
      <div className="row">
        <span className="muted" style={{ fontSize: 12.5 }}>
          {tx({
            en: 'Open MRs/PRs where you are reviewer or assignee, and the ones you opened, across every repository connection.',
            pt: 'MRs/PRs abertos em que você é revisor ou responsável, e os que você abriu, em todas as conexões de repositório.',
          })}
        </span>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={queue.reload} disabled={queue.loading}>
          <RotateCw size={13} className={queue.loading ? 'spin' : ''} /> {tx({ en: 'Refresh', pt: 'Atualizar' })}
        </button>
      </div>
      <Async state={queue} skeleton={<SkeletonRows rows={4} height={40} />}>
        {q => (
          <>
            {q.errors.map(e => (
              <div key={e.source} className="callout callout-warn" style={{ fontSize: 12.5 }}>{e.source ? `${e.source}: ${e.error}` : e.error}</div>
            ))}
            {q.sources === 0 && q.errors.length === 0 ? (
              <div className="card">
                <Empty icon={Inbox} title={tx({ en: 'No repository connection', pt: 'Nenhuma conexão de repositório' })} action={<Link to="/repositorios" className="btn btn-primary">{tx({ en: 'Connect GitLab or GitHub', pt: 'Conectar GitLab ou GitHub' })}</Link>}>
                  {tx({ en: 'The queue reads your MRs from the connections of the Repositories screen, with their token.', pt: 'A fila lê os seus MRs pelas conexões da tela Repositórios, com o token delas.' })}
                </Empty>
              </div>
            ) : (
              <>
                <QueueTable
                  title={tx({ en: `Waiting for your review (${q.toReview.length})`, pt: `Esperando a sua revisão (${q.toReview.length})` })}
                  empty={tx({ en: 'Nobody is waiting for you.', pt: 'Ninguém está esperando por você.' })}
                  rows={q.toReview}
                  showAuthor
                />
                <QueueTable
                  title={tx({ en: `Opened by you (${q.mine.length})`, pt: `Abertos por você (${q.mine.length})` })}
                  empty={tx({ en: 'You have no open MR/PR.', pt: 'Você não tem MR/PR aberto.' })}
                  rows={q.mine}
                />
              </>
            )}
          </>
        )}
      </Async>
    </div>
  )
}

function QueueTable({ title, empty, rows, showAuthor = false }: { title: string; empty: string; rows: QueueMr[]; showAuthor?: boolean }) {
  return (
    <section className="card">
      <div className="card-head"><span className="card-title">{title}</span></div>
      {rows.length === 0 ? (
        <div className="card-pad muted" style={{ fontSize: 12.5 }}>{empty}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>MR / PR</th>
                <th>{tx({ en: 'Project', pt: 'Projeto' })}</th>
                {showAuthor && <th>{tx({ en: 'Author', pt: 'Autor' })}</th>}
                <th>{tx({ en: 'State', pt: 'Estado' })}</th>
                <th>{tx({ en: 'Updated', pt: 'Atualizado' })}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(m => (
                <tr key={`${m.fullPath}${ref(m)}`}>
                  <td>
                    <span className="mono muted">{ref(m)}</span> <b>{m.title}</b>
                    {m.sourceBranch && <div className="mono muted" style={{ fontSize: 11.5 }}>{m.sourceBranch} → {m.targetBranch}</div>}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{m.fullPath}</td>
                  {showAuthor && <td style={{ fontSize: 12 }}>{m.author}</td>}
                  <td>
                    <span className={`badge ${STATE[m.state].badge}`}>{STATE[m.state].label}</span>
                    {m.comments > 0 && <span className="muted" style={{ fontSize: 11.5, marginLeft: 6 }} title={tx({ en: 'comments', pt: 'comentários' })}><MessageSquare size={11} /> {m.comments}</span>}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{relTime(m.updatedAt)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Link className="btn btn-sm" to={`/revisao?aba=mr&mr=${encodeURIComponent(m.webUrl)}`}>{tx({ en: 'Inspect', pt: 'Inspecionar' })}</Link>{' '}
                    <a className="btn btn-ghost btn-sm btn-icon" href={m.webUrl} target="_blank" rel="noreferrer" title={m.provider === 'gitlab' ? 'GitLab' : 'GitHub'}><ExternalLink size={13} /></a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
