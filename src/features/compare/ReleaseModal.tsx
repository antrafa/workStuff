import { ArrowLeftRight, GitCommitHorizontal, GitMerge } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Async, Modal, SkeletonRows } from '@/ui'
import { api } from '@/lib/api'
import { locale, tx } from '@/lib/i18n'
import { useAsync } from '@/lib/useAsync'
import { guessClone } from './guessClone'

type Clone = { path: string; label: string }
type Resolved = { tag: string; ref: string | null; tried: string[] }
type Release = {
  from: Resolved
  to: Resolved
  commits: { sha: string; subject: string; author: string; at: string }[]
  mergeRequests: string[]
  shortstat: string
  truncated: boolean
}

type Props = {
  workload: string
  container: string
  // A is usually the environment ahead (HML), B the one about to receive it (PRO)
  tagA: string
  tagB: string
  onClose: () => void
}

export function ReleaseModal({ workload, container, tagA, tagB, onClose }: Props) {
  const clones = useAsync(() => api.get<Clone[]>('/repos/workspace/list'))
  const [repo, setRepo] = useState('')
  const [from, setFrom] = useState(tagB)
  const [to, setTo] = useState(tagA)
  const [result, setResult] = useState<Release | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (clones.data && !repo) setRepo(guessClone([workload, container], clones.data.map(c => c.path)) ?? '')
  }, [clones.data])

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      setResult(await api.post<Release>('/compare/release', { repoPath: repo, from, to }))
    } catch (e) {
      setResult(null)
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  // Picking the clone runs it; edited versions run on the button, not on every key
  useEffect(() => {
    if (repo && from && to) void run()
  }, [repo])

  const unresolved = result && [result.from, result.to].filter(r => !r.ref)

  return (
    <Modal title={tx({ en: `What changes in ${workload}`, pt: `O que muda em ${workload}` })} width={860} onClose={onClose}>
      <div className="stack">
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          {tx({
            en: 'The commits the new version has and the current one does not: what goes along if the current environment takes the new image. Read from a clone of your workspace.',
            pt: 'Os commits que a versão nova tem e a atual não: o que vai junto se o ambiente atual receber a imagem nova. Lido de um clone do seu workspace.',
          })}
        </p>
        <Async state={clones} skeleton={<SkeletonRows rows={1} height={36} />}>
          {list => list.length === 0 ? (
            <div className="callout callout-warn" style={{ fontSize: 12.5 }}>
              {tx({ en: 'No clone in your workspace. Clone the project in ', pt: 'Nenhum clone no seu workspace. Clone o projeto em ' })}
              <Link to="/repositorios">{tx({ en: 'Repositories', pt: 'Repositórios' })}</Link>.
            </div>
          ) : (
            <form className="row" style={{ flexWrap: 'wrap' }} onSubmit={e => (e.preventDefault(), run())}>
              <select className="select mono" style={{ flex: 2, minWidth: 220 }} value={repo} onChange={e => setRepo(e.target.value)} aria-label={tx({ en: 'Clone', pt: 'Clone' })}>
                <option value="">{tx({ en: 'choose the clone with this code', pt: 'escolha o clone com este código' })}</option>
                {list.map(c => <option key={c.path} value={c.path}>{c.label}</option>)}
              </select>
              <label className="stack" style={{ ['--gap' as string]: '2px', flex: 1, minWidth: 140 }}>
                <span className="eyebrow">{tx({ en: 'Current (B)', pt: 'Atual (B)' })}</span>
                <input className="input mono" value={from} onChange={e => setFrom(e.target.value.trim())} />
              </label>
              <button className="btn btn-ghost btn-icon" style={{ alignSelf: 'flex-end' }} title={tx({ en: 'Swap the versions', pt: 'Trocar as versões' })} type="button" onClick={() => (setFrom(to), setTo(from))}><ArrowLeftRight size={14} /></button>
              <label className="stack" style={{ ['--gap' as string]: '2px', flex: 1, minWidth: 140 }}>
                <span className="eyebrow">{tx({ en: 'New (A)', pt: 'Nova (A)' })}</span>
                <input className="input mono" value={to} onChange={e => setTo(e.target.value.trim())} />
              </label>
              <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={!repo || !from || !to || running}>{tx({ en: 'See commits', pt: 'Ver commits' })}</button>
            </form>
          )}
        </Async>

        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
        {running && <SkeletonRows rows={3} height={28} />}

        {!running && unresolved && unresolved.length > 0 && (
          <div className="callout callout-warn" style={{ fontSize: 12.5 }}>
            {unresolved.map(r => (
              <div key={r.tag}>
                {tx({ en: `The version ${r.tag} is not in this clone. Tried: `, pt: `A versão ${r.tag} não está neste clone. Tentei: ` })}
                <span className="mono">{r.tried.join(', ')}</span>.
              </div>
            ))}
            {tx({
              en: 'If the tag exists on the server, update the clone with Fetch in My Workspace; if the image tag does not match a git tag, type the commit or tag by hand.',
              pt: 'Se a tag existe no servidor, atualize o clone com Fetch em Meu Workspace; se a tag da imagem não corresponde a uma tag do git, digite o commit ou a tag à mão.',
            })}
          </div>
        )}

        {!running && result && !unresolved?.length && (
          result.commits.length === 0 ? (
            <div className="callout callout-info" style={{ fontSize: 12.5 }}>
              {tx({
                en: `${result.to.tag} brings no commit that ${result.from.tag} lacks. If you expected changes, swap the versions: the "new" one may be the older.`,
                pt: `${result.to.tag} não traz nenhum commit que ${result.from.tag} não tenha. Se esperava mudanças, troque as versões: a "nova" pode ser a mais velha.`,
              })}
            </div>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13 }}>
                {tx({
                  en: <><b>{result.commits.length}{result.truncated ? '+' : ''} commit(s)</b> and <b>{result.mergeRequests.length} MR(s)</b> go along{result.shortstat ? `; ${result.shortstat}` : ''}.</>,
                  pt: <><b>{result.commits.length}{result.truncated ? '+' : ''} commit(s)</b> e <b>{result.mergeRequests.length} MR(s)</b> vão junto{result.shortstat ? `; ${result.shortstat}` : ''}.</>,
                })}
              </p>
              {result.mergeRequests.length > 0 && (
                <div className="row" style={{ flexWrap: 'wrap', ['--gap' as string]: '6px' }}>
                  <GitMerge size={14} className="muted" />
                  {result.mergeRequests.map(m => <span key={m} className="badge mono">{m}</span>)}
                </div>
              )}
              <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
                <table className="table">
                  <tbody>
                    {result.commits.map(c => (
                      <tr key={c.sha}>
                        <td className="mono muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}><GitCommitHorizontal size={11} /> {c.sha}</td>
                        <td style={{ fontSize: 12.5 }}>{c.subject}</td>
                        <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{c.author}</td>
                        <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(c.at).toLocaleDateString(locale())}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>
    </Modal>
  )
}
