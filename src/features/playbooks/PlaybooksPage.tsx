import './playbooks.css'
import {
  BookOpen, Bot, Check, Clock, FolderOpen, Play, PlayCircle, RotateCcw, Sparkles, Square,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Async, CopyButton, Empty, Markdown, Modal, Page, SkeletonRows, useToast } from '@/ui'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import { useAsync } from '@/lib/useAsync'

type PlaybookItem = { file: string; title: string }
type PlaybooksResponse = {
  root: string | null
  isDefault?: boolean
  defaultRoot?: string
  playbooks: PlaybookItem[]
}

type Step = {
  id: number
  title: string
  prompt: string
  vars: string[]
}

type PlaybookDoc = {
  file: string
  provider: string
  model: string
  vars: string[]
  segments: ({ type: 'text'; md: string } | ({ type: 'step' } & Step))[]
}

type StepState = {
  status: 'idle' | 'running' | 'done' | 'error'
  text: string
  durationMs?: number
  error?: string
}

export default function PlaybooksPage() {
  const list = useAsync(() => api.get<PlaybooksResponse>('/playbooks'))
  const [file, setFile] = useState<string | null>(null)
  const [rootInput, setRootInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (!file && list.data?.playbooks && list.data.playbooks.length > 0) {
      setFile(list.data.playbooks[0].file)
    }
  }, [list.data, file])

  const setRoot = async (root: string) => {
    setError(null)
    try {
      await api.put('/playbooks/root', { root })
      setFile(null)
      setModalOpen(false)
      list.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const pick = async () => {
    const { path } = await api.post<{ path: string | null }>('/playbooks/pick-folder').catch(e => (setError((e as Error).message), { path: null }))
    if (path) await setRoot(path)
  }

  return (
    <Page
      title="Playbooks de IA"
      hint="Procedimentos e receitas executados pela IA via streaming. Preencha os parâmetros do seu projeto e execute cada passo com o modelo ativo em Configurações."
    >
      <Async state={list} skeleton={<SkeletonRows rows={2} height={40} />}>
        {d => !d.root ? (
          <div className="card card-pad stack">
            <Empty icon={Bot} title="Escolha a pasta dos playbooks">
              Cada arquivo .md é um playbook; blocos de prompt viram passos executados com streaming pela IA.
            </Empty>
            <form className="row" onSubmit={e => (e.preventDefault(), setRoot(rootInput))}>
              <input className="input mono spacer" value={rootInput} onChange={e => setRootInput(e.target.value)} placeholder="~/playbooks" />
              <button type="button" className="btn" onClick={pick}><FolderOpen size={14} /> Escolher</button>
              <button className="btn btn-primary" disabled={!rootInput.trim()}>Usar esta pasta</button>
            </form>
            {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
          </div>
        ) : (
          <div className="pb-layout">
            <aside className="card pb-list">
              <div className="card-head">
                <div className="card-title spacer mono" style={{ minWidth: 0 }} title={d.root}>
                  <div className="row" style={{ alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.isDefault ? 'Playbooks do projeto' : d.root}
                    </span>
                    {d.isDefault && <span className="badge badge-info" style={{ fontSize: 10, flexShrink: 0 }}>projeto</span>}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => (setRootInput(d.root ?? ''), setModalOpen(true))}>
                  Trocar
                </button>
              </div>
              {d.playbooks.length === 0 ? (
                <p className="muted card-pad" style={{ fontSize: 12.5 }}>Nenhum .md nesta pasta.</p>
              ) : (
                d.playbooks.map(p => (
                  <button key={p.file} className={`pb-item${p.file === file ? ' pb-active' : ''}`} onClick={() => setFile(p.file)}>
                    <div>{p.title}</div>
                    <div className="muted mono" style={{ fontSize: 11 }}>{p.file}</div>
                  </button>
                ))
              )}
            </aside>
            {file ? <PlaybookDocView key={file} file={file} /> : <div className="card"><Empty icon={BookOpen} title="Escolha um playbook" /></div>}
          </div>
        )}
      </Async>

      {modalOpen && list.data && (
        <Modal title="Pasta dos playbooks" onClose={() => setModalOpen(false)} width={520}>
          <div className="stack">
            <p className="muted" style={{ fontSize: 13 }}>
              Você pode carregar playbooks a partir de qualquer pasta no computador ou usar os playbooks incluídos no projeto.
            </p>
            <form className="row" onSubmit={e => (e.preventDefault(), setRoot(rootInput))}>
              <input
                className="input mono spacer"
                value={rootInput}
                onChange={e => setRootInput(e.target.value)}
                placeholder="~/playbooks"
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
                  <RotateCcw size={13} /> Voltar para playbooks do projeto
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

function PlaybookDocView({ file }: { file: string }) {
  const doc = useAsync(() => api.post<PlaybookDoc>('/playbooks/doc', { file }), [file])
  const [values, setValues] = useState<Record<string, string>>({})
  const [stepsState, setStepsState] = useState<Record<number, StepState>>({})
  const aborts = useRef<Record<number, AbortController>>({})
  const toast = useToast()

  const steps = useMemo(() => {
    return (doc.data?.segments ?? []).filter((s): s is { type: 'step' } & Step => s.type === 'step')
  }, [doc.data])

  // Limpa controllers ao desmontar
  useEffect(() => {
    return () => {
      Object.values(aborts.current).forEach(a => a.abort())
    }
  }, [file])

  const pickProjectPath = async (vName: string) => {
    try {
      const res = await api.post<{ path: string | null }>('/playbooks/pick-project')
      if (res.path) {
        setValues(v => ({ ...v, [vName]: res.path! }))
      }
    } catch (e) {
      toast(`Não foi possível escolher a pasta: ${(e as Error).message}`)
    }
  }

  const runStep = async (stepId: number, customPreviousOutput?: string) => {
    const step = steps.find(s => s.id === stepId)
    if (!step) return ''

    // Determina saída do passo anterior se não fornecida
    let prevOut = customPreviousOutput
    if (prevOut === undefined && stepId > 0) {
      prevOut = stepsState[stepId - 1]?.text ?? ''
    }

    aborts.current[stepId]?.abort()
    const ac = new AbortController()
    aborts.current[stepId] = ac

    setStepsState(prev => ({
      ...prev,
      [stepId]: { status: 'running', text: '', error: undefined },
    }))

    const t0 = Date.now()
    let accumulated = ''

    try {
      await streamPost<{ type: string; text?: string; message?: string; ok?: boolean; durationMs?: number }>(
        '/playbooks/run',
        event => {
          if (event.type === 'text' && event.text) {
            accumulated += event.text
            setStepsState(prev => ({
              ...prev,
              [stepId]: { status: 'running', text: accumulated },
            }))
          }
          if (event.type === 'done') {
            setStepsState(prev => ({
              ...prev,
              [stepId]: {
                status: 'done',
                text: accumulated || (event.text ?? ''),
                durationMs: event.durationMs ?? Date.now() - t0,
              },
            }))
          }
          if (event.type === 'error') {
            setStepsState(prev => ({
              ...prev,
              [stepId]: {
                status: 'error',
                text: accumulated,
                error: event.message ?? 'erro durante execução',
              },
            }))
          }
        },
        ac.signal,
        { file, step: stepId, values, previousOutput: prevOut },
      )
      return accumulated
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setStepsState(prev => ({
          ...prev,
          [stepId]: {
            status: 'error',
            text: accumulated,
            error: (e as Error).message,
          },
        }))
      }
      return accumulated
    }
  }

  const stopStep = (stepId: number) => {
    aborts.current[stepId]?.abort()
    delete aborts.current[stepId]
    setStepsState(prev => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        status: prev[stepId]?.text ? 'done' : 'idle',
        error: prev[stepId]?.text ? undefined : 'interrompido pelo usuário',
      },
    }))
  }

  const runAllSequentially = async () => {
    let lastOut = ''
    for (const step of steps) {
      lastOut = await runStep(step.id, lastOut)
      if (stepsState[step.id]?.status === 'error') break
    }
  }

  const isAnyRunning = Object.values(stepsState).some(s => s.status === 'running')

  return (
    <Async state={doc} skeleton={<SkeletonRows rows={5} height={35} />}>
      {d => (
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div className="row" style={{ alignItems: 'center', gap: 8 }}>
              <span className="pb-meta-badge">
                <Sparkles size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                IA: <b className="mono">{d.provider}</b> ({d.model})
              </span>
              <Link to="/configuracoes/ia" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
                Alterar modelo
              </Link>
            </div>
            {steps.length > 1 && (
              <button className="btn btn-sm btn-primary" disabled={isAnyRunning} onClick={runAllSequentially}>
                <PlayCircle size={13} /> Executar todos em sequência
              </button>
            )}
          </div>

          {d.vars.length > 0 && (
            <section className="card card-pad stack">
              <div className="card-title" style={{ fontSize: 13 }}>Parâmetros da execução</div>
              <div className="pb-vars">
                {d.vars.map(v => {
                  const isPath = /projeto|pasta|diretorio|repo|repositorio/i.test(v)
                  return (
                    <div key={v} className="stack" style={{ gap: 4 }}>
                      <label className="field" style={{ margin: 0 }}>
                        <span className="mono" style={{ fontSize: 12 }}>{v}</span>
                        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                          <input
                            className="input mono spacer"
                            value={values[v] ?? ''}
                            onChange={e => setValues(curr => ({ ...curr, [v]: e.target.value }))}
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
            {d.segments.map((s, idx) => {
              if (s.type === 'text') {
                return <Markdown key={idx}>{s.md}</Markdown>
              }
              const st = stepsState[s.id] ?? { status: 'idle', text: '' }
              return (
                <div key={idx} className={`pb-step pb-step-${st.status}`}>
                  <div className="pb-step-head">
                    <div className="row" style={{ alignItems: 'center', gap: 6 }}>
                      <span className="pb-step-title">{s.title}</span>
                      {st.status === 'done' && (
                        <span className="badge badge-ok" style={{ fontSize: 11 }}>
                          <Check size={11} /> concluído
                        </span>
                      )}
                      {st.durationMs !== undefined && (
                        <span className="muted mono" style={{ fontSize: 11 }}>
                          <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                          {(st.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {st.status === 'running' ? (
                        <button className="btn btn-sm btn-danger" onClick={() => stopStep(s.id)}>
                          <Square size={12} /> Interromper
                        </button>
                      ) : (
                        <button className="btn btn-sm btn-primary" onClick={() => runStep(s.id)}>
                          <Play size={12} /> {st.status === 'done' ? 'Executar de novo' : 'Executar com IA'}
                        </button>
                      )}
                    </div>
                  </div>

                  <details style={{ fontSize: 12 }}>
                    <summary className="muted" style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Ver prompt
                    </summary>
                    <pre className="pb-prompt-preview">{s.prompt}</pre>
                  </details>

                  {st.status === 'running' && !st.text && (
                    <div className="muted row" style={{ fontSize: 12, alignItems: 'center', gap: 6 }}>
                      <span className="spin">⚡</span> A IA está analisando e gerando a resposta…
                    </div>
                  )}

                  {st.error && (
                    <div className="callout callout-crit" style={{ fontSize: 12.5 }}>
                      {st.error}
                    </div>
                  )}

                  {st.text && (
                    <div className="pb-out-card">
                      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
                        <CopyButton value={st.text} label="Copiar resposta" />
                      </div>
                      <Markdown>{st.text}</Markdown>
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        </div>
      )}
    </Async>
  )
}
