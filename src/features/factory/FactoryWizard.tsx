import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FolderOpen, Play } from 'lucide-react'
import { Modal } from '@/ui'
import { api } from '@/lib/api'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'
import { AGENT_ORDER, AGENT_UI, CLAUDE_SPLIT, runFactoryAction } from './factoryRun'

type Provider = 'claude' | 'codex' | 'agy'
type Preflight = {
  bwrap: boolean
  providers: Record<Provider, boolean>
  settings: { provider: Provider; model: string }
  repo: null | { ok: true; current: string; defaultBase: string; dirty: number; verifyCommand: string | null } | { ok: false; error: string }
}
type Issue = { id: string; title: string; number: number; url: string; repo: string; provider: 'gitlab' | 'github'; body?: string }

const STEPS = ['Como funciona', 'Pré-requisitos', 'Repositório', 'Demanda', 'Agentes e custo', 'Revisar'] as const

const PROVIDER_LABEL: Record<Provider, string> = { claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity' }

// Where the pipeline stops for a person: the wizard shows them up front so nothing surprises.
const CHECKPOINTS = [
  { who: 'analyst', text: 'escreve os critérios de aceite; se tiver dúvida de negócio, para e pergunta a você' },
  { who: 'architect', text: 'escreve o plano técnico; você lê, edita se quiser e aprova' },
  { who: 'implementer', text: 'codifica numa worktree isolada; se um portão reprovar, recebe a falha e corrige' },
  { who: 'tester', text: 'cobre os cenários de teste do plano' },
  { who: 'reviewer', text: 'revisa bugs e critérios, em paralelo com o Security; achado grave volta para correção' },
  { who: 'documenter', text: 'atualiza a documentação e escreve a descrição do MR; você revisa tudo e decide' },
] as const

// Guided first task: explains the pipeline, checks the machine and the repo, and writes the
// task with sensible defaults. Ends by creating the task and starting the planning.
export function FactoryWizard({ onClose, onStarted }: { onClose: () => void; onStarted: (task: FactoryTask) => void }) {
  const [step, setStep] = useState(0)
  const [pre, setPre] = useState<Preflight | null>(null)
  const [repoPath, setRepoPath] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  const [verifyCommand, setVerifyCommand] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [issue, setIssue] = useState<Issue | null>(null)
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [provider, setProvider] = useState<Provider>('claude')
  const [split, setSplit] = useState(true)
  const [budget, setBudget] = useState('5')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = (path = repoPath) =>
    api.get<Preflight>(`/factory/preflight${path ? `?repoPath=${encodeURIComponent(path)}` : ''}`)
      .then(p => {
        setPre(p)
        const found = p.repo
        if (found?.ok) setBaseBranch(b => b || found.defaultBase)
        return p
      })
      .catch(e => setError((e as Error).message))

  useEffect(() => {
    check('').then(p => p && setProvider(p.settings.provider))
  }, [])

  const pickFolder = async () => {
    const res = await api.post<{ path: string | null }>('/factory/pick-folder').catch(e => (setError((e as Error).message), null))
    if (res?.path) {
      setRepoPath(res.path)
      setBaseBranch('')
      check(res.path)
    }
  }

  const loadIssues = () => {
    if (issues) return
    api.get<Issue[]>('/factory/issues').then(setIssues).catch(() => setIssues([]))
  }

  const repo = pre?.repo
  const canWrite = Boolean(pre?.bwrap) || provider === 'codex'
  const ready: boolean[] = [
    true,
    Boolean(pre && pre.providers[provider] && canWrite),
    Boolean(repo?.ok),
    title.trim().length > 0,
    !budget || Number(budget) > 0,
    true,
  ]

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const task = await api.post<FactoryTask>('/factory/tasks', {
        title,
        description,
        baseBranch: baseBranch.trim() || undefined,
        provider,
        verifyCommand: verifyCommand.trim() || undefined,
        budgetUsd: budget.trim() || undefined,
        agentModels: split && provider === 'claude' ? CLAUDE_SPLIT : undefined,
        source: issue
          ? { type: issue.provider, repoPath, issueIid: issue.number, issueUrl: issue.url }
          : { type: 'manual', repoPath },
      })
      // Start the planning and stop watching at the first event: the run lives on the server,
      // and the trace view the page opens next follows it live.
      const watch = new AbortController()
      runFactoryAction(task.id, 'plan', { signal: watch.signal, onStarted: () => watch.abort() }).catch(() => {})
      try {
        localStorage.setItem(WIZARD_SEEN_KEY, '1')
      } catch {
        // private window: the wizard just opens again next time
      }
      onStarted(task)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Modo guiado da Fábrica" onClose={onClose} width={760}>
      <div className="stack" style={{ gap: 16 }}>
        <ol className="fx-stepper">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
              <span className="fx-step-dot">{i < step ? <Check size={11} /> : i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        {error && <div className="callout callout-crit">{error}</div>}

        <div style={{ minHeight: 300 }}>
          {step === 0 && (
            <div className="stack" style={{ gap: 12 }}>
              <p style={{ margin: 0 }}>
                Você descreve o que precisa; sete agentes especializados transformam isso em código revisado, numa cópia isolada do repositório.
                O seu checkout nunca é alterado, e nada vai para o Git remoto sem a sua aprovação.
              </p>
              <ol className="fx-flow">
                {CHECKPOINTS.map(c => (
                  <li key={c.who}>
                    <b style={{ color: AGENT_UI[c.who].color }}>{AGENT_UI[c.who].name}{c.who === 'reviewer' ? ' e Security' : ''}</b>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ol>
              <div className="callout">
                <span><b>Você decide em três momentos:</b> responder dúvidas do Analyst, aprovar o plano e aprovar a entrega (MR ou merge local).</span>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="stack" style={{ gap: 10 }}>
              {!pre ? <span className="muted">Verificando a máquina...</span> : (
                <>
                  <Req ok={pre.bwrap} title="bwrap (bubblewrap)" detail={pre.bwrap ? 'Agentes com escrita e a verificação do projeto rodam isolados.' : 'Sem ele, Claude e Antigravity não escrevem e a verificação do projeto não roda. Instale o pacote bubblewrap (tela Máquina).'} />
                  {(Object.keys(PROVIDER_LABEL) as Provider[]).map(p => (
                    <Req key={p} ok={pre.providers[p]} optional title={PROVIDER_LABEL[p]} detail={pre.providers[p] ? 'Instalado.' : 'Não encontrado no PATH.'} />
                  ))}
                  <label className="stack" style={{ gap: 4, marginTop: 6 }}>
                    <span className="eyebrow">Provedor desta tarefa</span>
                    <select className="input" value={provider} onChange={e => setProvider(e.target.value as Provider)}>
                      {(Object.keys(PROVIDER_LABEL) as Provider[]).map(p => (
                        <option key={p} value={p} disabled={!pre.providers[p]}>{PROVIDER_LABEL[p]}{pre.providers[p] ? '' : ' (não instalado)'}</option>
                      ))}
                    </select>
                  </label>
                  {!canWrite && <div className="callout callout-warn">Com {PROVIDER_LABEL[provider]} e sem bwrap a esteira não consegue construir. Instale o bubblewrap ou escolha Codex.</div>}
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="stack" style={{ gap: 12 }}>
              <label className="stack" style={{ gap: 4 }}>
                <span className="eyebrow">Pasta do repositório</span>
                <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  <input className="input mono spacer" value={repoPath} placeholder="/home/voce/projetos/meu-servico"
                    onChange={e => setRepoPath(e.target.value)} onBlur={() => repoPath && check()} />
                  <button type="button" className="btn" onClick={pickFolder}><FolderOpen size={14} /> Escolher</button>
                </div>
              </label>
              {repo && !repo.ok && <div className="callout callout-crit">{repo.error}</div>}
              {repo?.ok && (
                <>
                  <div className="row muted" style={{ gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
                    <span>branch atual <b className="mono">{repo.current}</b></span>
                    {repo.dirty > 0 && <span className="badge badge-warn">{repo.dirty} alterações não commitadas (não entram na tarefa)</span>}
                  </div>
                  <label className="stack" style={{ gap: 4 }}>
                    <span className="eyebrow">Branch base</span>
                    <input className="input mono" value={baseBranch} onChange={e => setBaseBranch(e.target.value)} />
                    <span className="muted" style={{ fontSize: 12 }}>A worktree parte daqui, e o MR volta para cá.</span>
                  </label>
                  <label className="stack" style={{ gap: 4 }}>
                    <span className="eyebrow">Comando de verificação</span>
                    <input className="input mono" value={verifyCommand} placeholder={repo.verifyCommand ?? 'nenhum detectado: informe um, ex.: npm run build'}
                      onChange={e => setVerifyCommand(e.target.value)} />
                    <span className="muted" style={{ fontSize: 12 }}>
                      {repo.verifyCommand ? `Detectado: ${repo.verifyCommand}. Deixe vazio para usar ele, ou combine com lint e typecheck.` : 'Sem comando, nada verifica se o código compila: os portões só conferem que algo mudou.'}
                    </span>
                  </label>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="stack" style={{ gap: 12 }}>
              <details onToggle={e => (e.currentTarget as HTMLDetailsElement).open && loadIssues()}>
                <summary className="eyebrow" style={{ cursor: 'pointer' }}>Importar de uma issue do GitLab ou GitHub</summary>
                <div className="stack" style={{ gap: 4, marginTop: 8, maxHeight: 180, overflowY: 'auto' }}>
                  {issues === null ? <span className="muted">Carregando...</span> : issues.length === 0 ? <span className="muted">Nenhuma issue aberta nas conexões de Repositórios.</span> : issues.map(i => (
                    <button key={i.id} type="button" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}
                      aria-pressed={issue?.id === i.id}
                      onClick={() => (setIssue(i), setTitle(i.title), setDescription(i.body ?? ''))}>
                      <span className="mono muted">{i.repo}#{i.number}</span> {i.title}
                    </button>
                  ))}
                </div>
              </details>
              <label className="stack" style={{ gap: 4 }}>
                <span className="eyebrow">Título</span>
                <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Exportar o relatório de pedidos em CSV" />
              </label>
              <label className="stack" style={{ gap: 4 }}>
                <span className="eyebrow">Descrição</span>
                <textarea className="textarea" rows={7} value={description} onChange={e => setDescription(e.target.value)}
                  placeholder={'O problema: quem sofre e quando.\nO comportamento esperado.\nOnde mexer, se você souber.\nComo saber que ficou pronto.'} />
              </label>
              <span className="muted" style={{ fontSize: 12 }}>
                Quanto mais claro o "como saber que ficou pronto", menos dúvidas o Analyst levanta. O que você não souber, ele pergunta.
              </span>
            </div>
          )}

          {step === 4 && (
            <div className="stack" style={{ gap: 14 }}>
              {provider === 'claude' ? (
                <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={split} onChange={e => setSplit(e.target.checked)} style={{ marginTop: 3 }} />
                  <span className="stack" style={{ gap: 4 }}>
                    <b>opus para julgar, sonnet para construir (recomendado)</b>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {AGENT_ORDER.map(id => `${AGENT_UI[id].name}: ${CLAUDE_SPLIT[id]}`).join(' · ')}
                    </span>
                  </span>
                </label>
              ) : (
                <span className="muted" style={{ fontSize: 13 }}>Todos os agentes usam o modelo de Configurações. Modelo por agente fica em "Nova Tarefa".</span>
              )}
              <label className="stack" style={{ gap: 4 }}>
                <span className="eyebrow">Teto de custo em US$</span>
                <input className="input mono" type="number" min="0.01" step="0.5" value={budget} onChange={e => setBudget(e.target.value)} placeholder="sem teto" />
                <span className="muted" style={{ fontSize: 12 }}>
                  Conferido antes de cada agente. Ao atingir, a tarefa para e você decide se aumenta.
                  {provider !== 'claude' && ` ${PROVIDER_LABEL[provider]} não informa custo, então o teto não tem efeito.`}
                </span>
              </label>
            </div>
          )}

          {step === 5 && (
            <dl className="fx-summary">
              <dt>Repositório</dt><dd className="mono">{repoPath}</dd>
              <dt>Branch base</dt><dd className="mono">{baseBranch || 'padrão do repositório'}</dd>
              <dt>Verificação</dt><dd className="mono">{verifyCommand || (repo?.ok && repo.verifyCommand) || 'nenhuma'}</dd>
              <dt>Demanda</dt><dd>{title}{issue && <span className="muted"> ({issue.repo}#{issue.number})</span>}</dd>
              <dt>Provedor</dt><dd>{PROVIDER_LABEL[provider]}{provider === 'claude' && split ? ' (opus julga, sonnet constrói)' : ''}</dd>
              <dt>Teto</dt><dd className="mono">{budget ? `US$ ${budget}` : 'sem teto'}</dd>
              <dt>Ao criar</dt><dd>O Analyst e o Architect começam já. Você acompanha a execução ao vivo na linha do tempo.</dd>
            </dl>
          )}
        </div>

        <div className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <button type="button" className="btn" onClick={() => (step === 0 ? onClose() : setStep(step - 1))} disabled={busy}>
            <ArrowLeft size={14} /> {step === 0 ? 'Fechar' : 'Voltar'}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={!ready[step]}>
              Próximo <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={create} disabled={busy || !ready.every(Boolean)}>
              <Play size={14} /> {busy ? 'Criando...' : 'Criar e começar'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

export const WIZARD_SEEN_KEY = 'workstuff.factory.wizardSeen'

function Req({ ok, title, detail, optional }: { ok: boolean; title: string; detail: string; optional?: boolean }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span className={`badge ${ok ? 'badge-ok' : optional ? '' : 'badge-crit'}`}>{ok ? 'ok' : optional ? 'ausente' : 'falta'}</span>
      <span className="stack" style={{ gap: 2 }}>
        <b style={{ fontSize: 13 }}>{title}</b>
        <span className="muted" style={{ fontSize: 12 }}>{detail}</span>
      </span>
    </div>
  )
}
