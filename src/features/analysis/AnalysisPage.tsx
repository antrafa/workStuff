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

  // Abre direto o último projeto usado, se ele já tem relatório.
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
    setRun({ steps: [], text: '', info: 'iniciando o agente…' })
    setTab('relatorio')
    try {
      localStorage.setItem(LAST_PATH, target)
    } catch {
      // só conveniência
    }
    let failure: string | null = null
    try {
      await streamPost<RunEvent>('/analysis/run', e => {
        if (e.type === 'meta' && e.mode === 'cached') toast('Sem commits novos desde a última análise: mostrando o relatório salvo')
        if (e.type === 'meta' && e.mode === 'full') setRun(r => r && { ...r, info: `${e.provider} · ${e.model || 'modelo padrão'}${e.persona ? ' · persona arquiteto-software' : ' · sem persona (não está no Catálogo)'}` })
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
      eyebrow="IA"
      title="Análise"
      hint="Relatório de arquitetura de um projeto local, gerado pelo agente de IA em modo leitura, e conversa sobre o código."
      actions={
        <button className="btn" onClick={() => setHistory(true)} title="Relatórios já gerados nesta máquina">
          <History size={14} /> Análises geradas
        </button>
      }
    >
      <div className="card card-pad stack">
        <form className="row" onSubmit={e => (e.preventDefault(), canRun && open(path.trim()))}>
          <input
            className="input mono"
            style={{ flex: 1, minWidth: 260 }}
            value={path}
            placeholder="/caminho/para/o/projeto (Enter abre o relatório salvo)"
            onChange={e => setPath(e.target.value)}
            disabled={running}
          />
          <button type="button" className="btn" onClick={pick} disabled={running} title="Abre o seletor de pasta do sistema">
            <FolderOpen size={14} /> Selecionar pasta
          </button>
          {running ? (
            <button type="button" className="btn btn-danger" onClick={() => abort.current?.abort()} title="Encerra o agente; nada é salvo">
              <Square size={14} /> Parar
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!canRun} onClick={() => generate(false)} title={canRun ? 'Roda a análise com o provedor de IA de Configurações' : 'Escolha uma pasta primeiro'}>
              <Play size={14} /> {entry && project === path.trim() ? 'Atualizar relatório' : 'Gerar relatório'}
            </button>
          )}
        </form>
        <small className="muted">
          O agente lê o código com Read, Grep e Glob, sem escrever nada, usando o provedor de <Link to="/configuracoes/ia">Configurações</Link>. Projeto
          git sem commits novos desde a última análise reaproveita o relatório salvo, sem chamar a IA.
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
            {([['relatorio', 'Relatório'], ['grafo', 'Grafo'], ['conversar', 'Conversar']] as [Tab, string][]).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
            ))}
            <div className="spacer" />
            {stale && tab === 'relatorio' && (
              <button className="btn btn-sm" onClick={() => generate(false)} title="O projeto recebeu commits depois desta análise">
                <RefreshCw size={13} /> Desatualizado: gerar de novo
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
        <div className="card card-pad muted">Ainda não há relatório para <code className="inline">{project}</code>. Clique em “Gerar relatório”.</div>
      )}

      {history && <ReportsModal onClose={() => setHistory(false)} onOpen={p => (setHistory(false), open(p))} />}
    </Page>
  )
}

function Progress({ run }: { run: Run }) {
  return (
    <div className="card card-pad stack analysis-progress">
      <div className="row">
        <span className="eyebrow">Relatório em andamento</span>
        <span className="muted mono">{run.info}</span>
        <div className="spacer" />
        {run.text && <span className="muted mono">{run.text.length.toLocaleString('pt-BR')} caracteres escritos</span>}
      </div>
      <div className="analysis-steps mono">
        {run.steps.slice(-8).map((s, i) => <div key={i}>› {s}</div>)}
        <div className="muted"><span className="spin-dot" /> {run.text ? 'escrevendo o relatório…' : `explorando o projeto (${run.steps.length} leituras)…`}</div>
      </div>
      {run.text && <pre className="analysis-live">{run.text.slice(-1500)}</pre>}
    </div>
  )
}
