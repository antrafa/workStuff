import { ChevronDown, ChevronRight, FileSearch, Search as SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Empty, SkeletonRows, useToast } from '@/ui'
import { api } from '@/lib/api'
import { tx } from '@/lib/i18n'
import { openWorkspaceRepo } from './api'

type Hit = { file: string; line: number; text: string }
type RepoHits = { name: string; path: string; relPath: string; hits: Hit[]; truncated: boolean }
type Result = { repos: RepoHits[]; searched: number; failed: { path: string; error: string }[] }

// Everything the search was asked lives in the URL: a link from Home (or a colleague) repeats it
export function CodeSearch() {
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const [paths, setPaths] = useState(params.get('arquivos') ?? '')
  const [regex, setRegex] = useState(params.get('regex') === '1')
  const [matchCase, setMatchCase] = useState(params.get('maiusculas') === '1')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const search = async () => {
    setParams({ aba: 'busca', q: text, ...(paths ? { arquivos: paths } : {}), ...(regex ? { regex: '1' } : {}), ...(matchCase ? { maiusculas: '1' } : {}) }, { replace: true })
    setRunning(true)
    setError(null)
    try {
      setResult(await api.post<Result>('/repos/workspace/search', { text, paths, regex, matchCase }))
    } catch (e) {
      setResult(null)
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  // Arriving with ?q= (a shared link) runs the search straight away
  useEffect(() => {
    if (text.trim().length >= 2) void search()
  }, [])

  const total = result?.repos.reduce((n, r) => n + r.hits.length, 0) ?? 0
  return (
    <div className="stack">
      <section className="card card-pad stack">
        <form className="row" style={{ flexWrap: 'wrap' }} onSubmit={e => (e.preventDefault(), search())}>
          <input className="input mono" style={{ flex: 3, minWidth: 240 }} value={text} onChange={e => setText(e.target.value)} placeholder={tx({ en: 'Text to find, e.g. DB_URL or jboss-cli', pt: 'Texto a procurar, ex.: DB_URL ou jboss-cli' })} autoFocus />
          <input className="input mono" style={{ flex: 1, minWidth: 160 }} value={paths} onChange={e => setPaths(e.target.value)} placeholder={tx({ en: 'Files, e.g. *.yml', pt: 'Arquivos, ex.: *.yml' })} title={tx({ en: 'Optional. Patterns separated by space or comma, like *.yml or src/', pt: 'Opcional. Padrões separados por espaço ou vírgula, como *.yml ou src/' })} />
          <button className="btn btn-primary" disabled={text.trim().length < 2 || running}><SearchIcon size={14} /> {running ? tx({ en: 'Searching…', pt: 'Procurando…' }) : tx({ en: 'Search', pt: 'Procurar' })}</button>
        </form>
        <div className="row" style={{ fontSize: 12.5 }}>
          <label className="row" style={{ ['--gap' as string]: '6px' }}><input type="checkbox" checked={matchCase} onChange={e => setMatchCase(e.target.checked)} /> {tx({ en: 'match case', pt: 'diferenciar maiúsculas' })}</label>
          <label className="row" style={{ ['--gap' as string]: '6px' }}><input type="checkbox" checked={regex} onChange={e => setRegex(e.target.checked)} /> {tx({ en: 'regular expression', pt: 'expressão regular' })}</label>
          <div className="spacer" />
          <span className="muted">{tx({ en: 'Searches every clone of your workspace, skipping what each .gitignore ignores.', pt: 'Procura em todos os clones do seu workspace, pulando o que cada .gitignore ignora.' })}</span>
        </div>
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
      </section>

      {running && <SkeletonRows rows={4} height={40} />}
      {!running && result && (
        result.repos.length === 0 ? (
          <div className="card">
            <Empty icon={FileSearch} title={tx({ en: 'Nothing found', pt: 'Nada encontrado' })}>
              {tx({ en: `No match in ${result.searched} clone(s).`, pt: `Nenhuma ocorrência em ${result.searched} clone(s).` })}
            </Empty>
          </div>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
              {tx({
                en: `${total} line(s) in ${result.repos.length} of ${result.searched} clone(s)${result.failed.length ? `; ${result.failed.length} clone(s) could not be read` : ''}.`,
                pt: `${total} linha(s) em ${result.repos.length} de ${result.searched} clone(s)${result.failed.length ? `; ${result.failed.length} clone(s) não puderam ser lidos` : ''}.`,
              })}
            </p>
            {result.repos.map(r => <RepoBlock key={r.path} repo={r} startOpen={result.repos.length <= 3} />)}
          </>
        )
      )}
    </div>
  )
}

function RepoBlock({ repo, startOpen }: { repo: RepoHits; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const toast = useToast()
  const files = [...new Set(repo.hits.map(h => h.file))]
  return (
    <section className="card">
      <button className="card-head repo-search-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <b>{repo.name}</b>
        <span className="mono muted" style={{ fontSize: 11.5 }}>{repo.relPath}</span>
        <div className="spacer" />
        <span className="badge">{tx({ en: `${repo.hits.length} line(s) in ${files.length} file(s)`, pt: `${repo.hits.length} linha(s) em ${files.length} arquivo(s)` })}</span>
        {repo.truncated && <span className="badge badge-warn" title={tx({ en: 'Too many matches: narrow the text or the files', pt: 'Ocorrências demais: restrinja o texto ou os arquivos' })}>{tx({ en: 'cut', pt: 'cortado' })}</span>}
      </button>
      {open && (
        <div className="card-pad stack" style={{ ['--gap' as string]: '10px' }}>
          <div><button className="btn btn-sm" onClick={() => openWorkspaceRepo(repo.path).catch((e: Error) => toast(e.message))}>{tx({ en: 'Open in the editor', pt: 'Abrir no editor' })}</button></div>
          {files.map(file => (
            <div key={file}>
              <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{file}</div>
              <pre className="code repo-search-lines">
                {repo.hits.filter(h => h.file === file).map(h => `${String(h.line).padStart(5)}  ${h.text}`).join('\n')}
              </pre>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
