import './runbooks.css'
import { BookOpen, FolderOpen, RotateCcw, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Async, CommandStep, ConfirmModal, Empty, Markdown, Modal, Page, SkeletonRows } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

type Check = { kind: 'read'; args: string[] } | { kind: 'write'; args: string[]; action: string } | { kind: 'blocked'; reason: string }
type Segment = { type: 'text'; md: string } | { type: 'step'; id: number; line: string; vars: string[]; check: Check }
type Doc = { session: { context: string; environment: string | null } | null; segments: Segment[] }
type Result = { ok: boolean; command: string; output: string }

type RunbooksListResponse = {
  root: string | null
  isDefault?: boolean
  defaultRoot?: string
  runbooks: { file: string; title: string }[]
}

export default function RunbooksPage() {
  const list = useAsync(() => api.get<RunbooksListResponse>('/runbooks'))
  const [file, setFile] = useState<string | null>(null)
  const [rootInput, setRootInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!file && list.data?.runbooks && list.data.runbooks.length > 0) {
      setFile(list.data.runbooks[0].file)
    }
  }, [list.data, file])

  const setRoot = async (root: string) => {
    setError(null)
    try {
      await api.put('/runbooks/root', { root })
      setFile(null)
      setModalOpen(false)
      list.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const pick = async () => {
    const { path } = await api.post<{ path: string | null }>('/runbooks/pick-folder').catch(e => (setError((e as Error).message), { path: null }))
    if (path) await setRoot(path)
  }

  return (
    <Page
      title="Runbooks"
      hint="Procedimentos em Markdown com passos kubectl. Leitura roda direto; escrita mostra o comando e espera a sua confirmação, com as mesmas travas do Cluster Doctor. Tudo fica registrado."
    >
      <Async state={list} skeleton={<SkeletonRows rows={2} height={40} />}>
        {d => !d.root ? (
          <div className="card card-pad stack">
            <Empty icon={BookOpen} title="Escolha a pasta dos runbooks">
              Cada arquivo .md é um runbook; cada linha dentro de um bloco ```bash é um passo. Use {'{{namespace}}'} para valores que mudam a cada uso.
            </Empty>
            <form className="row" onSubmit={e => (e.preventDefault(), setRoot(rootInput))}>
              <input className="input mono spacer" value={rootInput} onChange={e => setRootInput(e.target.value)} placeholder="~/runbooks" />
              <button type="button" className="btn" onClick={pick}><FolderOpen size={14} /> Escolher</button>
              <button className="btn btn-primary" disabled={!rootInput.trim()}>Usar esta pasta</button>
            </form>
            {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
          </div>
        ) : (
          <div className="rb-layout">
            <aside className="card rb-list">
              <div className="card-head">
                <div className="card-title spacer mono" style={{ minWidth: 0 }} title={d.root}>
                  <div className="row" style={{ alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.isDefault ? 'Runbooks do projeto' : d.root}
                    </span>
                    {d.isDefault && <span className="badge badge-info" style={{ fontSize: 10, flexShrink: 0 }}>projeto</span>}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => (setRootInput(d.root ?? ''), setModalOpen(true))}>
                  Trocar
                </button>
              </div>
              {d.runbooks.length === 0 ? <p className="muted card-pad" style={{ fontSize: 12.5 }}>Nenhum .md nesta pasta.</p> : d.runbooks.map(r => (
                <button key={r.file} className={`rb-item${r.file === file ? ' rb-active' : ''}`} onClick={() => setFile(r.file)}>
                  <div>{r.title}</div><div className="muted mono" style={{ fontSize: 11 }}>{r.file}</div>
                </button>
              ))}
            </aside>
            {file ? <RunbookDoc key={file} file={file} /> : <div className="card"><Empty icon={BookOpen} title="Escolha um runbook" /></div>}
          </div>
        )}
      </Async>

      {modalOpen && list.data && (
        <Modal title="Pasta dos runbooks" onClose={() => setModalOpen(false)} width={520}>
          <div className="stack">
            <p className="muted" style={{ fontSize: 13 }}>
              Você pode carregar runbooks a partir de qualquer pasta no computador ou usar os runbooks incluídos no projeto.
            </p>
            <form className="row" onSubmit={e => (e.preventDefault(), setRoot(rootInput))}>
              <input
                className="input mono spacer"
                value={rootInput}
                onChange={e => setRootInput(e.target.value)}
                placeholder="~/runbooks"
              />
              <button type="button" className="btn" onClick={pick}>
                <FolderOpen size={14} /> Escolher…
              </button>
              <button className="btn btn-primary" disabled={!rootInput.trim() || rootInput === list.data.root}>
                Usar pasta
              </button>
            </form>
            {!list.data.isDefault && (
              <div style={{ paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRoot('default')}>
                  <RotateCcw size={13} /> Voltar para runbooks do projeto
                </button>
              </div>
            )}
            {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
          </div>
        </Modal>
      )}
    </Page>
  )
}

function RunbookDoc({ file }: { file: string }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [doc, setDoc] = useState<Doc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Record<number, Result | 'running'>>({})
  const [confirming, setConfirming] = useState<Extract<Segment, { type: 'step' }> | null>(null)

  // A classificação depende dos valores: reclassifica (no servidor) a cada mudança, com uma pausa curta.
  useEffect(() => {
    const t = setTimeout(() => {
      api.post<Doc>('/runbooks/doc', { file, values }).then(setDoc).catch(e => setError((e as Error).message))
    }, 250)
    return () => clearTimeout(t)
  }, [file, values])

  const vars = useMemo(() => [...new Set((doc?.segments ?? []).flatMap(s => (s.type === 'step' ? s.vars : [])))], [doc])

  const run = async (step: Extract<Segment, { type: 'step' }>, confirmed = false) => {
    setResults(r => ({ ...r, [step.id]: 'running' }))
    try {
      const res = await api.post<Result>('/runbooks/run', { file, step: step.id, values, confirmed })
      setResults(r => ({ ...r, [step.id]: res }))
    } catch (e) {
      setResults(r => ({ ...r, [step.id]: { ok: false, command: '', output: (e as Error).message } }))
    }
  }

  if (error) return <div className="callout callout-crit">{error}</div>
  if (!doc) return <SkeletonRows rows={5} height={30} />

  return (
    <div className="stack" style={{ minWidth: 0 }}>
      {!doc.session ? (
        <div className="callout callout-warn" style={{ fontSize: 12.5 }}>Nenhum cluster conectado: os passos rodam no cluster da <Link to="/cluster">tela Cluster</Link>.</div>
      ) : (
        <div className="row muted" style={{ fontSize: 12.5 }}>
          Roda em <span className="mono">{doc.session.context}</span>
          <span className={`badge ${doc.session.environment === 'PRO' || !doc.session.environment ? 'badge-crit' : 'badge-info'}`}>{doc.session.environment ?? 'sem classificação (vale como PRO)'}</span>
        </div>
      )}
      {vars.length > 0 && (
        <section className="card card-pad rb-vars">
          {vars.map(v => (
            <label key={v} className="field">
              <span className="mono">{v}</span>
              <input className="input mono" value={values[v] ?? ''} onChange={e => setValues(x => ({ ...x, [v]: e.target.value.trim() }))} />
            </label>
          ))}
        </section>
      )}
      <section className="card card-pad stack">
        {doc.segments.map((s, i) => s.type === 'text' ? <Markdown key={i}>{s.md}</Markdown> : (
          <CommandStep
            key={i}
            command={s.check.kind === 'blocked' ? s.line : `kubectl ${s.check.args.join(' ')}`}
            kind={s.check.kind}
            reason={s.check.kind === 'blocked' ? s.check.reason : undefined}
            result={results[s.id]}
            disabled={!doc.session}
            onRun={() => (s.check.kind === 'write' ? setConfirming(s) : run(s))}
          />
        ))}
      </section>
      {confirming && confirming.check.kind === 'write' && (
        <ConfirmModal title="Executar passo de escrita" confirmLabel="Executar" icon={Zap} onConfirm={() => run(confirming, true)} onClose={() => setConfirming(null)}>
          <p>Vai rodar em <b className="mono">{doc.session?.context}</b> ({doc.session?.environment}):</p>
          <pre className="code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>kubectl {confirming.check.args.join(' ')}</pre>
          <p className="muted" style={{ fontSize: 12.5 }}>A execução fica registrada em ~/.workstuff/runbook-audit.log.</p>
        </ConfirmModal>
      )}
    </div>
  )
}
