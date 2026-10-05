import './devRunbooks.css'
import { FolderOpen, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CommandStep, ConfirmModal, Markdown, SkeletonRows, useToast } from '@/ui'
import { api } from '@/lib/api'

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

// Executor de um runbook de dev: parâmetros, texto e passos com Rodar/Executar.
// initialValues pré-preenche parâmetros (ex.: projeto vindo da aba de agentes da Fábrica).
export function DevRunbookDoc({ file, initialValues = {} }: { file: string; initialValues?: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(initialValues)
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
    // projeto sempre aparece: é a pasta onde os comandos rodam, mesmo quando nenhum passo usa {{projeto}}
    return [...new Set(['projeto', ...(doc?.segments ?? []).flatMap(s => (s.type === 'step' ? s.vars : []))])]
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
            <CommandStep
              key={i}
              command={s.check.kind === 'blocked' ? s.line : `${s.check.bin} ${s.check.args.join(' ')}`}
              kind={s.check.kind}
              reason={s.check.kind === 'blocked' ? s.check.reason : undefined}
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
