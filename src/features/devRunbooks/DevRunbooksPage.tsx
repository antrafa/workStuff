import './devRunbooks.css'
import {
  BookOpen, FolderOpen, Lock, Play, RotateCcw, Terminal, Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Async, ConfirmModal, Empty, Markdown, Modal, Page, SkeletonRows, useToast } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

type DevRunbookItem = { file: string; title: string }
type DevRunbooksResponse = {
  root: string | null
  isDefault?: boolean
  defaultRoot?: string
  runbooks: DevRunbookItem[]
}

type Check =
  | { kind: 'read'; bin: string; args: string[] }
  | { kind: 'write'; bin: string; args: string[]; action: string }
  | { kind: 'blocked'; reason: string }

type Step = {
  id: number
  line: string
  vars: string[]
  check: Check
}

type Segment = { type: 'text'; md: string } | ({ type: 'step' } & Step)

type DocResponse = {
  file: string
  segments: Segment[]
}

type Result = { ok: boolean; command: string; cwd?: string; output: string }

export default function DevRunbooksPage() {
  const list = useAsync(() => api.get<DevRunbooksResponse>('/dev-runbooks'))
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
      await api.put('/dev-runbooks/root', { root })
      setFile(null)
      setModalOpen(false)
      list.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const pick = async () => {
    const { path } = await api.post<{ path: string | null }>('/dev-runbooks/pick-folder').catch(e => (setError((e as Error).message), { path: null }))
    if (path) await setRoot(path)
  }

  return (
    <Page
      title="Runbooks de Dev"
      hint="Comandos e rotinas locais de desenvolvimento para o dia a dia (Git, Docker, npm/pnpm). Leitura roda direto; comandos com modificação exibem o comando exato e pedem confirmação."
    >
      <Async state={list} skeleton={<SkeletonRows rows={2} height={40} />}>
        {d => !d.root ? (
          <div className="card card-pad stack">
            <Empty icon={Terminal} title="Escolha a pasta dos runbooks de dev">
              Cada arquivo .md é um runbook; linhas de comandos bash/sh viram passos executados com segurança na máquina local.
            </Empty>
            <form className="row" onSubmit={e => (e.preventDefault(), setRoot(rootInput))}>
              <input className="input mono spacer" value={rootInput} onChange={e => setRootInput(e.target.value)} placeholder="~/dev-runbooks" />
              <button type="button" className="btn" onClick={pick}><FolderOpen size={14} /> Escolher</button>
              <button className="btn btn-primary" disabled={!rootInput.trim()}>Usar esta pasta</button>
            </form>
            {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
          </div>
        ) : (
          <div className="drb-layout">
            <aside className="card drb-list">
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
              {d.runbooks.length === 0 ? (
                <p className="muted card-pad" style={{ fontSize: 12.5 }}>Nenhum .md nesta pasta.</p>
              ) : (
                d.runbooks.map(r => (
                  <button key={r.file} className={`drb-item${r.file === file ? ' drb-active' : ''}`} onClick={() => setFile(r.file)}>
                    <div>{r.title}</div>
                    <div className="muted mono" style={{ fontSize: 11 }}>{r.file}</div>
                  </button>
                ))
              )}
            </aside>
            {file ? <DevRunbookDoc key={file} file={file} /> : <div className="card"><Empty icon={BookOpen} title="Escolha um runbook de dev" /></div>}
          </div>
        )}
      </Async>

      {modalOpen && list.data && (
        <Modal title="Pasta dos runbooks de dev" onClose={() => setModalOpen(false)} width={520}>
          <div className="stack">
            <p className="muted" style={{ fontSize: 13 }}>
              Você pode carregar runbooks a partir de qualquer pasta no computador ou usar os runbooks de desenvolvimento incluídos no projeto.
            </p>
            <form className="row" onSubmit={e => (e.preventDefault(), setRoot(rootInput))}>
              <input
                className="input mono spacer"
                value={rootInput}
                onChange={e => setRootInput(e.target.value)}
                placeholder="~/dev-runbooks"
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

function DevRunbookDoc({ file }: { file: string }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [doc, setDoc] = useState<DocResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Record<number, Result | 'running'>>({})
  const [confirming, setConfirming] = useState<({ type: 'step' } & Step) | null>(null)
  const toast = useToast()

  useEffect(() => {
    const t = setTimeout(() => {
      api.post<DocResponse>('/dev-runbooks/doc', { file, values })
        .then(setDoc)
        .catch(e => setError((e as Error).message))
    }, 250)
    return () => clearTimeout(t)
  }, [file, values])

  const vars = useMemo(() => {
    return [...new Set((doc?.segments ?? []).flatMap(s => (s.type === 'step' ? s.vars : [])))]
  }, [doc])

  const pickProjectPath = async (vName: string) => {
    try {
      const res = await api.post<{ path: string | null }>('/dev-runbooks/pick-project')
      if (res.path) {
        setValues(v => ({ ...v, [vName]: res.path! }))
      }
    } catch (e) {
      toast(`Não foi possível escolher a pasta: ${(e as Error).message}`)
    }
  }

  const run = async (step: { type: 'step' } & Step, confirmed = false) => {
    setResults(r => ({ ...r, [step.id]: 'running' }))
    try {
      const res = await api.post<Result>('/dev-runbooks/run', { file, step: step.id, values, confirmed })
      setResults(r => ({ ...r, [step.id]: res }))
    } catch (e) {
      setResults(r => ({ ...r, [step.id]: { ok: false, command: '', output: (e as Error).message } }))
    }
  }

  if (error) return <div className="callout callout-crit">{error}</div>
  if (!doc) return <SkeletonRows rows={5} height={30} />

  return (
    <div className="stack" style={{ minWidth: 0 }}>
      {vars.length > 0 && (
        <section className="card card-pad stack">
          <div className="card-title" style={{ fontSize: 13 }}>Parâmetros da execução</div>
          <div className="drb-vars">
            {vars.map(v => {
              const isPath = /projeto|pasta|diretorio|repo|repositorio/i.test(v)
              return (
                <div key={v} className="stack" style={{ gap: 4 }}>
                  <label className="field" style={{ margin: 0 }}>
                    <span className="mono" style={{ fontSize: 12 }}>{v}</span>
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      <input
                        className="input mono spacer"
                        value={values[v] ?? ''}
                        onChange={e => setValues(curr => ({ ...curr, [v]: e.target.value.trim() }))}
                        placeholder={`valor para {{${v}}}`}
                      />
                      {isPath && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          title="Escolher pasta no computador"
                          onClick={() => pickProjectPath(v)}
                        >
                          <FolderOpen size={13} />
                        </button>
                      )}
                    </div>
                  </label>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="card card-pad stack">
        {doc.segments.map((s, i) =>
          s.type === 'text' ? (
            <Markdown key={i}>{s.md}</Markdown>
          ) : (
            <StepCard
              key={i}
              step={s}
              result={results[s.id]}
              onRun={() => (s.check.kind === 'write' ? setConfirming(s) : run(s))}
            />
          ),
        )}
      </section>

      {confirming && confirming.check.kind === 'write' && (
        <ConfirmModal
          title="Executar comando com modificação"
          confirmLabel="Executar"
          icon={Zap}
          onConfirm={() => {
            const stepToRun = confirming
            setConfirming(null)
            run(stepToRun, true)
          }}
          onClose={() => setConfirming(null)}
        >
          <p>Comando que será executado na máquina local:</p>
          <pre className="code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {confirming.check.bin} {confirming.check.args.join(' ')}
          </pre>
          {values['projeto'] && (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Diretório de trabalho: <b className="mono">{values['projeto']}</b>
            </p>
          )}
          <p className="muted" style={{ fontSize: 12 }}>
            A execução fica registrada em ~/.workstuff/dev-runbook-audit.log.
          </p>
        </ConfirmModal>
      )}
    </div>
  )
}

function StepCard({
  step,
  result,
  onRun,
}: {
  step: { type: 'step' } & Step
  result: Result | 'running' | undefined
  onRun: () => void
}) {
  const c = step.check
  const preview = c.kind === 'blocked' ? step.line : `${c.bin} ${c.args.join(' ')}`

  return (
    <div className={`drb-step drb-${c.kind}`}>
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
        <code className="mono spacer drb-cmd">{preview}</code>
        {c.kind === 'blocked' ? (
          <span className="badge" title={c.reason}>
            <Lock size={11} /> bloqueado
          </span>
        ) : (
          <button
            className={`btn btn-sm ${c.kind === 'write' ? 'btn-danger' : ''}`}
            disabled={result === 'running'}
            onClick={onRun}
          >
            {c.kind === 'write' ? (
              <>
                <Zap size={12} /> Executar (escrita)
              </>
            ) : (
              <>
                <Play size={12} /> Rodar
              </>
            )}
          </button>
        )}
      </div>

      {c.kind === 'blocked' && <div className="muted" style={{ fontSize: 12 }}>{c.reason}</div>}
      {result === 'running' && <div className="muted" style={{ fontSize: 12 }}>executando comando…</div>}
      {result && result !== 'running' && (
        <pre className={`code drb-out${result.ok ? '' : ' drb-fail'}`}>
          {result.output || '(comando executado com sucesso, sem saída)'}
        </pre>
      )}
    </div>
  )
}
