import { ArrowLeft, FolderOpen, GitPullRequest, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { AiStream, Empty, Page, type AiStreamEvent } from '@/ui'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import { tx } from '@/lib/i18n'
import { LocalDiffSection, MrReviewTab } from './MrReviewTab'

type Info = { path: string; label: string; current: string; defaultBase: string | null; branches: string[]; dirty: number }
type DiffEvent = AiStreamEvent & { files?: number; truncated?: boolean; base?: string; mergeBase?: string }
type Tab = 'local' | 'mr'

const KEY = 'review-path'
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export default function ReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  // Set by whoever sent the user here (Meu Workspace), with that screen's own filters in the URL
  const backTo = (location.state as { from?: string } | null)?.from
  const tab: Tab = searchParams.get('aba') === 'mr' ? 'mr' : 'local'
  const repoParam = searchParams.get('repo')
  const [path, setPath] = useState(() => repoParam || read())
  const [info, setInfo] = useState<Info | null>(null)
  const [base, setBase] = useState('')
  const [includeWorking, setIncludeWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Each Review click remounts the AiStream: the key changes and the review starts over.
  const [run, setRun] = useState(0)

  const open = async (p = path) => {
    if (!p.trim()) return
    setPath(p)
    setError(null)
    setRun(0)
    try {
      const i = await api.post<Info>('/review/info', { path: p.trim() })
      setInfo(i)
      setBase(i.defaultBase ?? '')
      setIncludeWorking(i.dirty > 0)
      localStorage.setItem(KEY, i.path)
    } catch (e) {
      setInfo(null)
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    if (repoParam) void open(repoParam)
  }, [repoParam])

  const pick = async () => {
    try {
      const { path: picked } = await api.post<{ path: string | null }>('/review/pick-folder')
      if (picked) open(picked)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Page
      title={tx({ en: 'Pre-MR review', pt: 'Revisão antes do MR' })}
      actions={backTo && (
        <button className="btn" onClick={() => navigate(backTo)}>
          <ArrowLeft size={14} /> {tx({ en: 'Back', pt: 'Voltar' })}
        </button>
      )}
      hint={tx({
        en: 'Inspect the cognitive diff and Blast Radius of your local branch or an open MR/PR, and ask the AI in read-only mode to point out problems by severity with file and line.',
        pt: 'Inspecione o diff cognitivo e o Raio de Impacto da sua branch local ou de um MR/PR aberto, e peça à IA em modo leitura os problemas por severidade com arquivo e linha.',
      })}
    >
      <div className="tabs" role="tablist">
        {([['local', tx({ en: 'Local branch', pt: 'Branch local' })], ['mr', tx({ en: 'Open MR / PR', pt: 'MR / PR aberto' })]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setSearchParams(id === 'local' ? {} : { aba: id }, { state: location.state })}>{label}</button>
        ))}
      </div>
      {tab === 'mr' ? <MrReviewTab /> : (
      <>
      <section className="card card-pad stack">
        <form className="row" onSubmit={e => (e.preventDefault(), open())}>
          <input className="input mono spacer" value={path} onChange={e => setPath(e.target.value)} placeholder={tx({ en: '/path/to/repository', pt: '/caminho/do/repositorio' })} />
          <button type="button" className="btn" onClick={pick}><FolderOpen size={14} /> {tx({ en: 'Choose', pt: 'Escolher' })}</button>
          <button className="btn" disabled={!path.trim()}>{tx({ en: 'Open', pt: 'Abrir' })}</button>
        </form>
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
        {info && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13 }}>Branch <b className="mono">{info.current}</b> {tx({ en: 'against', pt: 'contra' })}</span>
            <select className="select mono" value={base} onChange={e => setBase(e.target.value)}>
              {!base && <option value="">{tx({ en: 'choose the base', pt: 'escolha a base' })}</option>}
              {info.branches.filter(b => b !== info.current).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <label className="row" style={{ ['--gap' as string]: '6px', fontSize: 12.5 }} title={tx({ en: 'Includes what is modified and not committed yet', pt: 'Inclui o que está modificado e ainda não foi commitado' })}>
              <input type="checkbox" checked={includeWorking} onChange={e => setIncludeWorking(e.target.checked)} />
              {tx({ en: `include uncommitted${info.dirty ? ` (${info.dirty} file(s))` : ''}`, pt: `incluir não commitado${info.dirty ? ` (${info.dirty} arquivo(s))` : ''}` })}
            </label>
            <div className="spacer" />
            <button className="btn btn-primary" disabled={!base} onClick={() => setRun(r => r + 1)}><Sparkles size={14} /> {tx({ en: 'Review', pt: 'Revisar' })}</button>
          </div>
        )}
        {info && !info.defaultBase && <p className="muted" style={{ fontSize: 12 }}>{tx({ en: "Could not find the remote's default branch (origin/HEAD): choose the base by hand.", pt: 'Não achei a branch padrão do remoto (origin/HEAD): escolha a base à mão.' })}</p>}
      </section>

      {!info && !error && (
        <div className="card">
          <Empty icon={GitPullRequest} title={tx({ en: 'Choose a repository', pt: 'Escolha um repositório' })}>
            {tx({
              en: "The default base is the remote's main branch (origin/HEAD). Run git fetch first, to compare with its latest version.",
              pt: 'A base padrão é a branch principal do remoto (origin/HEAD). Faça git fetch antes, para comparar com a versão mais recente dela.',
            })}
          </Empty>
        </div>
      )}
      {info && base && <LocalDiffSection path={info.path} base={base} includeWorking={includeWorking} />}
      {info && run > 0 && (
        <section className="card card-pad" key={run}>
          <AiStream<DiffEvent>
            initial={tx({ en: 'building the diff…', pt: 'montando o diff…' })}
            start={(onEvent, signal) => streamPost('/review/run', onEvent, signal, { path: info.path, base, includeWorking })}
            describe={e => (e.type === 'diff'
              ? tx({
                en: `${e.files} file(s) against ${e.base} (merge-base ${e.mergeBase})${e.truncated ? ', diff cut' : ''}; the AI is reading the code…`,
                pt: `${e.files} arquivo(s) contra ${e.base} (merge-base ${e.mergeBase})${e.truncated ? ', diff cortado' : ''}; a IA está lendo o código…`,
              })
              : null)}
          />
        </section>
      )}
      </>
      )}
    </Page>
  )
}
