import './analysis.css'
import { FolderOpen, History, Play, RefreshCw, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Page, useToast } from '@/ui'
import { streamPost } from '@/lib/stream'
import { ChatTab } from './ChatTab'
import { GraphTab } from './GraphTab'
import { ReportView } from './ReportView'
import { ReportsModal } from './ReportsModal'
import { fetchReport, pickFolder, type ReportEntry, type RunEvent } from './api'
import { locale, tx } from '@/lib/i18n'

type Tab = 'relatorio' | 'grafo' | 'conversar'
type Run = { steps: string[]; text: string; info: string }

const LAST_PATH = 'analysis-last-path'
const readLastPath = () => {
  try {
    return localStorage.getItem(LAST_PATH) ?? ''
  } catch {
    return ''
  }
}

export default function AnalysisPage() {
  const [path, setPath] = useState(readLastPath)
  const [project, setProject] = useState<string | null>(null)
  const [entry, setEntry] = useState<ReportEntry | null>(null)
  const [stale, setStale] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('relatorio')
  const [history, setHistory] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const toast = useToast()

  useEffect(() => () => abort.current?.abort(), [])

  const open = async (projectPath: string) => {
    setError(null)
    setPath(projectPath)
    try {
      const r = await fetchReport(projectPath)
      setProject(projectPath)
      setEntry(r.entry)
      setStale(r.stale)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // Opens the last project used right away, if it already has a report.
  useEffect(() => {
    if (path) open(path)
  }, [])

  const pick = async () => {
    try {
      const { path: picked } = await pickFolder()
      if (picked) open(picked)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const generate = async (force: boolean) => {
    const target = path.trim()
    abort.current = new AbortController()
    setError(null)
    setRun({ steps: [], text: '', info: tx({ en: 'starting the agent…', pt: 'iniciando o agente…' }) })
    setTab('relatorio')
    try {
      localStorage.setItem(LAST_PATH, target)
    } catch {
      // convenience only
    }
    let failure: string | null = null
    try {
      await streamPost<RunEvent>('/analysis/run', e => {
        if (e.type === 'meta' && e.mode === 'cached') toast(tx({ en: 'No new commits since the last analysis: showing the saved report', pt: 'Sem commits novos desde a última análise: mostrando o relatório salvo' }))
        if (e.type === 'meta' && e.mode === 'full') setRun(r => r && { ...r, info: `${e.provider} · ${e.model || tx({ en: 'default model', pt: 'modelo padrão' })}${e.persona ? tx({ en: ' · arquiteto-software persona', pt: ' · persona arquiteto-software' }) : tx({ en: ' · no persona (not in the Catalog)', pt: ' · sem persona (não está no Catálogo)' })}` })
        if (e.type === 'tool') setRun(r => r && { ...r, steps: [...r.steps, `${e.tool} ${e.detail.split('/').slice(-3).join('/')}`] })
        if (e.type === 'text') setRun(r => r && { ...r, text: r.text + e.text })
        if (e.type === 'error') failure = e.message
        if (e.type === 'done') {
          setEntry(e.entry)
          setStale(false)
        }
      }, abort.current.signal, { projectPath: target, force })
    } catch (e) {
      failure = (e as Error).message
    }
    setProject(target)
    setRun(null)
    if (failure) setError(failure)
  }

  const running = run !== null
  const canRun = path.trim().length > 0 && !running

  return (
    <Page
      title={tx({ en: 'Analysis', pt: 'Análise' })}
      hint={tx({ en: 'Architecture report of a local project, written by the AI agent in read-only mode, and a conversation about the code.', pt: 'Relatório de arquitetura de um projeto local, gerado pelo agente de IA em modo leitura, e conversa sobre o código.' })}
      actions={
        <button className="btn" onClick={() => setHistory(true)} title={tx({ en: 'Reports already generated on this machine', pt: 'Relatórios já gerados nesta máquina' })}>
          <History size={14} /> {tx({ en: 'Generated analyses', pt: 'Análises geradas' })}
        </button>
      }
    >
      <div className="card card-pad stack">
        <form className="row" onSubmit={e => (e.preventDefault(), canRun && open(path.trim()))}>
          <input
            className="input mono"
            style={{ flex: 1, minWidth: 260 }}
            value={path}
            placeholder={tx({ en: '/path/to/the/project (Enter opens the saved report)', pt: '/caminho/para/o/projeto (Enter abre o relatório salvo)' })}
            onChange={e => setPath(e.target.value)}
            disabled={running}
          />
          <button type="button" className="btn" onClick={pick} disabled={running} title={tx({ en: 'Opens the system folder picker', pt: 'Abre o seletor de pasta do sistema' })}>
            <FolderOpen size={14} /> {tx({ en: 'Choose folder', pt: 'Selecionar pasta' })}
          </button>
          {running ? (
            <button type="button" className="btn btn-danger" onClick={() => abort.current?.abort()} title={tx({ en: 'Stops the agent; nothing is saved', pt: 'Encerra o agente; nada é salvo' })}>
              <Square size={14} /> {tx({ en: 'Stop', pt: 'Parar' })}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!canRun} onClick={() => generate(false)} title={canRun ? tx({ en: 'Runs the analysis with the AI provider from Settings', pt: 'Roda a análise com o provedor de IA de Configurações' }) : tx({ en: 'Choose a folder first', pt: 'Escolha uma pasta primeiro' })}>
              <Play size={14} /> {entry && project === path.trim() ? tx({ en: 'Update report', pt: 'Atualizar relatório' }) : tx({ en: 'Generate report', pt: 'Gerar relatório' })}
            </button>
          )}
        </form>
        <small className="muted">
          {tx({
            en: <>The agent reads the code with Read, Grep and Glob, writing nothing, using the provider from <Link to="/configuracoes/ia">Settings</Link>. A git project with no new commits since the last analysis reuses the saved report, without calling the AI.</>,
            pt: <>O agente lê o código com Read, Grep e Glob, sem escrever nada, usando o provedor de <Link to="/configuracoes/ia">Configurações</Link>. Projeto git sem commits novos desde a última análise reaproveita o relatório salvo, sem chamar a IA.</>,
          })}
        </small>
      </div>

      {error && (
        <div className="callout callout-crit">
          <span className="spacer">{error}</span>
        </div>
      )}

      {run && <Progress run={run} />}

      {!run && project && entry && (
        <section className="card">
          <div className="tabs" role="tablist" style={{ padding: '0 8px' }}>
            {([['relatorio', tx({ en: 'Report', pt: 'Relatório' })], ['grafo', tx({ en: 'Graph', pt: 'Grafo' })], ['conversar', tx({ en: 'Chat', pt: 'Conversar' })]] as [Tab, string][]).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
            ))}
            <div className="spacer" />
            {stale && tab === 'relatorio' && (
              <button className="btn btn-sm" onClick={() => generate(false)} title={tx({ en: 'The project got commits after this analysis', pt: 'O projeto recebeu commits depois desta análise' })}>
                <RefreshCw size={13} /> {tx({ en: 'Outdated: generate again', pt: 'Desatualizado: gerar de novo' })}
              </button>
            )}
          </div>
          <div className="card-pad">
            {tab === 'relatorio' && <ReportView projectPath={project} entry={entry} onRegenerate={() => generate(true)} />}
            {tab === 'grafo' && <GraphTab projectPath={project} />}
            {tab === 'conversar' && <ChatTab key={project} projectPath={project} />}
          </div>
        </section>
      )}

      {!run && project && !entry && !error && (
        <div className="card card-pad muted">{tx({ en: <>No report for <code className="inline">{project}</code> yet. Click “Generate report”.</>, pt: <>Ainda não há relatório para <code className="inline">{project}</code>. Clique em “Gerar relatório”.</> })}</div>
      )}

      {history && <ReportsModal onClose={() => setHistory(false)} onOpen={p => (setHistory(false), open(p))} />}
    </Page>
  )
}

function Progress({ run }: { run: Run }) {
  return (
    <div className="card card-pad stack analysis-progress">
      <div className="row">
        <span className="eyebrow">{tx({ en: 'Report in progress', pt: 'Relatório em andamento' })}</span>
        <span className="muted mono">{run.info}</span>
        <div className="spacer" />
        {run.text && <span className="muted mono">{tx({ en: `${run.text.length.toLocaleString(locale())} characters written`, pt: `${run.text.length.toLocaleString(locale())} caracteres escritos` })}</span>}
      </div>
      <div className="analysis-steps mono">
        {run.steps.slice(-8).map((s, i) => <div key={i}>› {s}</div>)}
        <div className="muted"><span className="spin-dot" /> {run.text ? tx({ en: 'writing the report…', pt: 'escrevendo o relatório…' }) : tx({ en: `exploring the project (${run.steps.length} reads)…`, pt: `explorando o projeto (${run.steps.length} leituras)…` })}</div>
      </div>
      {run.text && <pre className="analysis-live">{run.text.slice(-1500)}</pre>}
    </div>
  )
}
