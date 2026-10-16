import { ExternalLink, GitPullRequest, RotateCw, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AiStream, Async, Empty, SkeletonRows, type AiStreamEvent } from '@/ui'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import { useAsync } from '@/lib/useAsync'
import { locale, tx } from '@/lib/i18n'
import { CognitiveDiffViewer } from '@/features/factory/CognitiveDiffViewer'
import type { BlastRadiusReport } from '../../../server/lib/factory/types.ts'

type LocalDiffResponse = {
  base: string
  mergeBase: string
  stat: string
  diff: string
  truncated: boolean
  files: number
  changedFiles: string[]
  blastRadius: BlastRadiusReport | null
}

export function LocalDiffSection({
  path,
  base,
  includeWorking,
}: {
  path: string
  base: string
  includeWorking: boolean
}) {
  const [data, setData] = useState<LocalDiffResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!path || !base) {
      setData(null)
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    api
      .post<LocalDiffResponse>('/review/diff', { path, base, includeWorking })
      .then(res => {
        if (alive) {
          setData(res)
          setLoading(false)
        }
      })
      .catch(e => {
        if (alive) {
          setData(null)
          setError((e as Error).message)
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [path, base, includeWorking])

  if (!base) return null
  if (loading) {
    return (
      <section className="card card-pad">
        <SkeletonRows rows={3} height={36} />
      </section>
    )
  }
  if (error) {
    return <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>
  }
  if (!data) return null

  return (
    <section className="card card-pad stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="eyebrow">
            {tx({ en: 'Cognitive diff & Blast Radius', pt: 'Diff cognitivo & Raio de Impacto' })}
          </span>
          <span className="muted mono" style={{ fontSize: 11.5 }}>
            merge-base {data.mergeBase}
          </span>
        </div>
        {data.truncated && (
          <span className="badge badge-warn">
            {tx({ en: 'diff truncated (150 KB)', pt: 'diff cortado (150 KB)' })}
          </span>
        )}
      </div>
      <CognitiveDiffViewer
        diffContent={data.diff}
        blastRadius={data.blastRadius ?? undefined}
      />
    </section>
  )
}

type RemoteMrSummary = {
  sourceId: string
  sourceLabel: string
  provider: 'gitlab' | 'github'
  fullPath: string
  iid: number
  title: string
  author: string
  sourceBranch: string
  targetBranch: string
  updatedAt: string
  webUrl: string
  draft: boolean
  localClone: string | null
}

type RemoteMrDetail = RemoteMrSummary & {
  description: string
}

type RemoteMrDiffResult = {
  mr: RemoteMrDetail
  diff: string
  truncated: boolean
  files: number
  changedFiles: string[]
  blastRadius: BlastRadiusReport | null
  clonePath: string | null
}

type DiffEvent = AiStreamEvent & { files?: number; truncated?: boolean; base?: string; head?: string }

export function MrReviewTab() {
  const list = useAsync(() => api.get<{ mrs: RemoteMrSummary[]; errors: { fullPath: string; error: string }[] }>('/review/mrs'))
  const [urlInput, setUrlInput] = useState('')
  const [selected, setSelected] = useState<RemoteMrDiffResult | null>(null)
  const [loadingMr, setLoadingMr] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState(0)

  const openMr = async (payload: { url?: string; sourceId?: string; fullPath?: string; iid?: number }) => {
    setLoadingMr(true)
    setError(null)
    setRun(0)
    try {
      const res = await api.post<RemoteMrDiffResult>('/review/mr-diff', payload)
      setSelected(res)
    } catch (e) {
      setSelected(null)
      setError((e as Error).message)
    } finally {
      setLoadingMr(false)
    }
  }

  return (
    <div className="stack">
      <section className="card card-pad stack">
        <form
          className="row"
          onSubmit={e => {
            e.preventDefault()
            if (urlInput.trim()) openMr({ url: urlInput.trim() })
          }}
        >
          <input
            className="input mono spacer"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder={tx({
              en: 'https://gitlab.../group/project/-/merge_requests/42 or https://github.com/org/repo/pull/15',
              pt: 'https://gitlab.../grupo/projeto/-/merge_requests/42 ou https://github.com/org/repo/pull/15',
            })}
          />
          <button className="btn btn-primary" disabled={!urlInput.trim() || loadingMr}>
            {tx({ en: 'Inspect MR/PR', pt: 'Inspecionar MR/PR' })}
          </button>
          <button type="button" className="btn" onClick={list.reload} title={tx({ en: 'Refresh open MRs from followed projects', pt: 'Atualizar MRs abertos dos projetos acompanhados' })}>
            <RotateCw size={14} className={list.loading ? 'spin' : ''} />
          </button>
        </form>

        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}

        <Async state={list} skeleton={<SkeletonRows rows={3} height={32} />}>
          {d =>
            d.mrs.length === 0 ? (
              <small className="muted">
                {tx({
                  en: 'No open MRs/PRs in the projects followed on the Pipelines screen (or paste any MR/PR URL above).',
                  pt: 'Nenhum MR/PR aberto nos projetos acompanhados na tela Pipelines (ou cole a URL de qualquer MR/PR acima).',
                })}
              </small>
            ) : (
              <div className="stack" style={{ ['--gap' as string]: '6px' }}>
                <span className="eyebrow">
                  {tx({
                    en: `Open MRs/PRs in followed projects (${d.mrs.length})`,
                    pt: `MRs/PRs abertos nos projetos acompanhados (${d.mrs.length})`,
                  })}
                </span>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{tx({ en: 'Project', pt: 'Projeto' })}</th>
                        <th>MR / PR</th>
                        <th>{tx({ en: 'Branches', pt: 'Branches' })}</th>
                        <th>{tx({ en: 'Author', pt: 'Autor' })}</th>
                        <th>{tx({ en: 'Updated', pt: 'Atualizado' })}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {d.mrs.map(m => {
                        const isCurrent =
                          selected?.mr.sourceId === m.sourceId &&
                          selected?.mr.fullPath === m.fullPath &&
                          selected?.mr.iid === m.iid
                        return (
                          <tr key={`${m.sourceId}:${m.fullPath}:${m.iid}`} style={isCurrent ? { background: 'var(--surface-2)' } : undefined}>
                            <td className="mono" style={{ fontSize: 12 }}>
                              {m.fullPath}
                              {m.localClone && (
                                <span
                                  className="badge badge-ok"
                                  style={{ marginLeft: 6, fontSize: 10 }}
                                  title={tx({
                                    en: `Cloned at ${m.localClone}: Blast Radius and surrounding code available`,
                                    pt: `Clonado em ${m.localClone}: Raio de Impacto e leitura do código disponíveis`,
                                  })}
                                >
                                  {tx({ en: 'clone', pt: 'clonado' })}
                                </span>
                              )}
                            </td>
                            <td>
                              <span className="mono muted">{m.provider === 'gitlab' ? `!${m.iid}` : `#${m.iid}`}</span>{' '}
                              <b>{m.title}</b>
                              {m.draft && (
                                <span className="badge" style={{ marginLeft: 6, fontSize: 10 }}>
                                  {tx({ en: 'draft', pt: 'rascunho' })}
                                </span>
                              )}
                            </td>
                            <td className="mono" style={{ fontSize: 11.5 }}>
                              {m.sourceBranch} → {m.targetBranch}
                            </td>
                            <td style={{ fontSize: 12 }}>{m.author}</td>
                            <td className="muted" style={{ fontSize: 12 }}>
                              {new Date(m.updatedAt).toLocaleString(locale())}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn btn-sm"
                                disabled={loadingMr}
                                onClick={() => openMr({ sourceId: m.sourceId, fullPath: m.fullPath, iid: m.iid })}
                              >
                                {tx({ en: 'Inspect', pt: 'Inspecionar' })}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }
        </Async>
      </section>

      {loadingMr && (
        <section className="card card-pad">
          <SkeletonRows rows={4} height={36} />
        </section>
      )}

      {!loadingMr && !selected && !error && (
        <div className="card">
          <Empty icon={GitPullRequest} title={tx({ en: 'Pick an open MR/PR or paste its URL', pt: 'Escolha um MR/PR aberto ou cole a URL dele' })}>
            {tx({
              en: 'The panel loads the diff organized by cognitive category (Core, Wiring, Tests, Docs) and, when the project is cloned in your workspace, calculates the Blast Radius before running the AI review.',
              pt: 'O painel carrega o diff organizado por categoria cognitiva (Lógica central, Integração, Testes, Docs) e, quando o projeto está clonado no seu workspace, calcula o Raio de Impacto antes de rodar a revisão da IA.',
            })}
          </Empty>
        </div>
      )}

      {selected && (
        <>
          <section className="card card-pad stack">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="badge mono">
                  {selected.mr.provider === 'gitlab' ? `!${selected.mr.iid}` : `#${selected.mr.iid}`}
                </span>
                <b>{selected.mr.title}</b>
                <span className="mono muted" style={{ fontSize: 12 }}>
                  ({selected.mr.sourceBranch} → {selected.mr.targetBranch})
                </span>
                {selected.mr.localClone ? (
                  <span className="badge badge-ok" title={selected.mr.localClone}>
                    {tx({ en: 'local clone linked', pt: 'clone local vinculado' })}
                  </span>
                ) : (
                  <span className="badge">
                    {tx({ en: 'remote diff only (not cloned)', pt: 'apenas diff remoto (sem clone local)' })}
                  </span>
                )}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <a className="btn btn-sm" href={selected.mr.webUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} /> {selected.mr.provider === 'gitlab' ? 'GitLab' : 'GitHub'}
                </a>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={selected.files === 0}
                  onClick={() => setRun(r => r + 1)}
                >
                  <Sparkles size={14} /> {tx({ en: 'Review with AI', pt: 'Revisar com IA' })}
                </button>
              </div>
            </div>

            <CognitiveDiffViewer
              diffContent={selected.diff}
              blastRadius={selected.blastRadius ?? undefined}
            />
          </section>

          {run > 0 && (
            <section className="card card-pad" key={run}>
              <AiStream<DiffEvent>
                initial={tx({ en: 'reading the MR/PR diff…', pt: 'lendo o diff do MR/PR…' })}
                start={(onEvent, signal) =>
                  streamPost('/review/mr-run', onEvent, signal, {
                    sourceId: selected.mr.sourceId,
                    fullPath: selected.mr.fullPath,
                    iid: selected.mr.iid,
                  })
                }
                describe={e =>
                  e.type === 'diff'
                    ? tx({
                        en: `${e.files} file(s) (${e.head} → ${e.base})${e.truncated ? ', diff cut' : ''}; the AI is reviewing…`,
                        pt: `${e.files} arquivo(s) (${e.head} → ${e.base})${e.truncated ? ', diff cortado' : ''}; a IA está revisando…`,
                      })
                    : null
                }
              />
            </section>
          )}
        </>
      )}
    </div>
  )
}
