import { useState, useEffect } from 'react'
import { FolderOpen, GitPullRequest, Plus, Search, Cpu } from 'lucide-react'
import { Modal, Segmented } from '@/ui'
import { api } from '@/lib/api'
import { AGENT_ORDER, AGENT_UI, CLAUDE_SPLIT } from './factoryRun'
import { tx } from '@/lib/i18n'
import type { FactoryProjectView, SpecializedAgentId } from '../../../server/lib/factory/types.ts'


type Issue = {
  id: string
  title: string
  number: number
  url: string
  repo: string
  provider: 'gitlab' | 'github'
  body?: string
}

type SettingsResponse = {
  provider: 'claude' | 'codex' | 'agy'
  model?: string
  effort?: string
}

type Props = {
  // The project selected on the board: the task goes into it, picking one of its repositories
  project?: FactoryProjectView | null
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function NewTaskModal({ project, open, onClose, onCreated }: Props) {
  const [tab, setTab] = useState<'manual' | 'issues'>('manual')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  const [verifyCommand, setVerifyCommand] = useState('')
  const [smokeCommand, setSmokeCommand] = useState('')
  const [autoMr, setAutoMr] = useState(false)
  const [budgetUsd, setBudgetUsd] = useState('')
  const [agentModels, setAgentModels] = useState<Partial<Record<SpecializedAgentId, string>>>({})
  const [defaultModel, setDefaultModel] = useState('')
  // null until Configurações answers: the server then applies the configured provider
  const [provider, setProvider] = useState<SettingsResponse['provider'] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickedIssue, setPickedIssue] = useState<Issue | null>(null)
  // Same check as the guided mode: without bwrap the build fails only after planning was paid for
  const [noSandbox, setNoSandbox] = useState(false)

  const close = () => {
    setError(null)
    setPickedIssue(null)
    onClose()
  }

  // Loads the provider configured in workStuff
  useEffect(() => {
    if (open) {
      api.get<SettingsResponse>('/factory/settings')
        .then(res => {
          if (project?.provider) setProvider(project.provider)
          else if (res?.provider) setProvider(res.provider)
          if (res?.model) setDefaultModel(res.model)
        })
        .catch(e => setError(tx({ en: `Could not read Settings: ${(e as Error).message}`, pt: `Não foi possível ler as Configurações: ${(e as Error).message}` })))
      if (project) {
        setRepoPath(path => (project.repos.some(r => r.path === path) ? path : project.repos[0]?.path ?? path))
        setVerifyCommand(cmd => cmd || project.verifyCommand || '')
      }
      api.get<{ bwrap: boolean; sandbox?: boolean; settings?: { sandboxPolicy?: 'strict' | 'relaxed' } }>('/factory/preflight')
        .then(p => setNoSandbox(!(p.sandbox ?? p.bwrap ?? (p.settings?.sandboxPolicy === 'relaxed'))))
        .catch(() => setNoSandbox(false))
    }
  }, [open])

  // Remote issues
  const [issues, setIssues] = useState<Issue[]>([])
  const [loadingIssues, setLoadingIssues] = useState(false)
  const [issuesError, setIssuesError] = useState<string | null>(null)
  const [issueFilter, setIssueFilter] = useState('')

  useEffect(() => {
    if (open && tab === 'issues') {
      setLoadingIssues(true)
      setIssuesError(null)
      api.get<Issue[]>('/factory/issues')
        .then(setIssues)
        .catch(e => setIssuesError((e as Error).message))
        .finally(() => setLoadingIssues(false))
    }
  }, [open, tab])

  const pickFolder = async () => {
    try {
      const res = await api.post<{ path: string | null }>('/factory/pick-folder')
      if (res.path) setRepoPath(res.path)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // The issue body becomes the requirements the Architect reads; the link stays on the task
  const handleSelectIssue = (issue: Issue) => {
    setPickedIssue(issue)
    setTitle(`[#${issue.number}] ${issue.title}`)
    setDescription(issue.body?.trim() || tx({ en: `Request imported from issue #${issue.number} of ${issue.repo}.`, pt: `Demanda importada da issue #${issue.number} de ${issue.repo}.` }))
    setTab('manual')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !repoPath.trim()) {
      setError(tx({ en: 'Enter the title and the local repository path.', pt: 'Informe o título e o caminho do repositório local.' }))
      return
    }

    setSaving(true)
    setError(null)
    try {
      await api.post('/factory/tasks', {
        projectId: project?.id,
        title,
        description,
        // empty: the server resolves the repo's default branch (main, master, develop...)
        baseBranch: baseBranch.trim() || undefined,
        provider: provider ?? undefined,
        verifyCommand: verifyCommand.trim() || undefined,
        smokeCommand: smokeCommand.trim() || undefined,
        autoMr,
        budgetUsd: budgetUsd.trim() || undefined,
        agentModels,
        source: pickedIssue
          ? { type: pickedIssue.provider, repoPath, issueIid: pickedIssue.number, issueUrl: pickedIssue.url }
          : { type: 'manual', repoPath },
      })
      onCreated()
      close()
      setTitle('')
      setDescription('')
      setRepoPath('')
      setVerifyCommand('')
      setSmokeCommand('')
      setAutoMr(false)
      setBudgetUsd('')
      setAgentModels({})
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const filteredIssues = issues.filter(
    i => i.title.toLowerCase().includes(issueFilter.toLowerCase()) || i.repo.toLowerCase().includes(issueFilter.toLowerCase()),
  )

  if (!open) return null

  return (
    <Modal onClose={close} title={tx({ en: 'New factory task', pt: 'Nova Tarefa na Fábrica' })}>
      <div className="stack" style={{ minWidth: 480 }}>
        {/* Modal tabs */}
        <Segmented
          options={[
            { id: 'manual', label: tx({ en: 'Manual task', pt: 'Tarefa manual' }) },
            { id: 'issues', label: tx({ en: 'Import remote issue', pt: 'Importar issue remota' }) },
          ]}
          value={tab}
          onChange={setTab}
        />

        {noSandbox && (
          <div className="callout callout-warn">
            {tx({ en: 'No sandbox (bwrap or sandbox-exec) available: planning runs, but write-mode build requires a sandbox or relaxed mode enabled in Settings.', pt: 'Nenhum sandbox (bwrap ou sandbox-exec) disponível: o planejamento roda, mas a construção com escrita exige sandbox ou o modo relaxado ativo em Configurações.' })}
          </div>
        )}
        {error && <div className="callout callout-crit">{error}</div>}

        {pickedIssue && tab === 'manual' && (
          <div className="callout callout-info row" style={{ justifyContent: 'space-between' }}>
            <span>
              <GitPullRequest size={14} /> {tx({ en: `Linked to issue #${pickedIssue.number} of ${pickedIssue.repo}`, pt: `Vinculada à issue #${pickedIssue.number} de ${pickedIssue.repo}` })}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setPickedIssue(null)}>
              {tx({ en: 'Unlink', pt: 'Desvincular' })}
            </button>
          </div>
        )}

        {tab === 'manual' ? (
          <form onSubmit={handleSubmit} className="stack">
            <label className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">{tx({ en: 'Request title', pt: 'Título da Demanda' })}</span>
              <input
                className="input"
                placeholder={tx({ en: 'e.g. Fix the database connection timeout', pt: 'Ex.: Corrigir timeout na conexão com banco de dados' })}
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">{tx({ en: 'Local repository (clone folder)', pt: 'Repositório Local (Pasta do clone)' })}</span>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder={tx({ en: '/path/to/the/project', pt: '/caminho/do/projeto/workspace' })}
                  value={repoPath}
                  onChange={e => setRepoPath(e.target.value)}
                  list="factory-project-repos"
                  required
                />
                {project && (
                  <datalist id="factory-project-repos">
                    {project.repos.map(r => <option key={r.path} value={r.path}>{r.name}</option>)}
                  </datalist>
                )}
                <button type="button" className="btn" onClick={pickFolder} title={tx({ en: 'Choose folder', pt: 'Escolher pasta' })}>
                  <FolderOpen size={16} /> {tx({ en: 'Choose', pt: 'Escolher' })}
                </button>
              </div>
            </label>

            <div className="row" style={{ gap: 12 }}>
              <label className="stack" style={{ gap: 4, flex: 1 }}>
                <span className="eyebrow">{tx({ en: 'Base branch', pt: 'Branch Base' })}</span>
                <input
                  className="input"
                  placeholder={tx({ en: 'repository default', pt: 'padrão do repositório' })}
                  value={baseBranch}
                  onChange={e => setBaseBranch(e.target.value)}
                />
              </label>

              <label className="stack" style={{ gap: 4, flex: 1 }}>
                <span className="eyebrow row" style={{ gap: 4 }}>
                  <Cpu size={12} /> {tx({ en: 'AI provider', pt: 'Provedor de IA' })}
                </span>
                <select
                  className="input"
                  value={provider ?? ''}
                  onChange={e => setProvider(e.target.value as SettingsResponse['provider'])}
                >
                  {provider === null && <option value="">{tx({ en: 'Settings default', pt: 'Padrão de Configurações' })}</option>}
                  <option value="agy">Antigravity (AGY)</option>
                  <option value="codex">Codex</option>
                  <option value="claude">Claude Code</option>
                </select>
              </label>
            </div>

            <label className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">{tx({ en: 'Requirements', pt: 'Descrição dos Requisitos' })}</span>
              <textarea
                className="textarea"
                rows={4}
                placeholder={tx({ en: 'Explain what needs to be done, affected files or acceptance criteria...', pt: 'Explique o que precisa ser feito, arquivos afetados ou critérios de aceitação...' })}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">{tx({ en: 'Verification command (optional)', pt: 'Comando de verificação (opcional)' })}</span>
              <input
                className="input mono"
                placeholder={tx({ en: 'detected from the project: lint, typecheck, test, build; mvn -q verify; go test ./...', pt: 'detectado pelo projeto: lint, typecheck, test, build; mvn -q verify; go test ./...' })}
                value={verifyCommand}
                onChange={e => setVerifyCommand(e.target.value)}
              />
              <span className="muted" style={{ fontSize: 12 }}>
                {tx({ en: 'Runs after each Implementer delivery, inside the sandbox. e.g. npm run typecheck && npm test', pt: 'Roda depois de cada entrega do Implementer, dentro do sandbox. Ex.: npm run typecheck && npm test' })}
              </span>
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">{tx({ en: 'Smoke command (optional)', pt: 'Comando de smoke (opcional)' })}</span>
              <input className="input mono" value={smokeCommand} onChange={e => setSmokeCommand(e.target.value)} />
              <span className="muted" style={{ fontSize: 12 }}>
                {tx({ en: 'Runs last, in the same sandbox: start the app, hit it, stop it. e.g. npm run dev & sleep 5; curl -fs localhost:5173 >/dev/null', pt: 'Roda por último, no mesmo sandbox: sobe a aplicação, chama, derruba. Ex.: npm run dev & sleep 5; curl -fs localhost:5173 >/dev/null' })}
              </span>
            </label>

            <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={autoMr} onChange={e => setAutoMr(e.target.checked)} style={{ marginTop: 3 }} />
              <span className="stack" style={{ gap: 4 }}>
                <b>{tx({ en: 'Open the MR by itself when everything is verified', pt: 'Abrir o MR sozinho quando tudo estiver verificado' })}</b>
                <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'Only when nothing blocks and nothing needs a look (tests per criterion, no sensitive paths, no refuted finding, security tools installed). Otherwise it waits for you as usual.', pt: 'Só quando nada bloqueia e nada pede atenção (teste por critério, nenhum caminho sensível, nenhum achado refutado, ferramentas de segurança instaladas). Senão, espera por você como sempre.' })}</span>
              </span>
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">{tx({ en: 'Cost cap in US$ (optional)', pt: 'Teto de custo em US$ (opcional)' })}</span>
              <input
                className="input mono"
                type="number"
                min="0.01"
                step="0.01"
                placeholder={tx({ en: 'no cap', pt: 'sem teto' })}
                value={budgetUsd}
                onChange={e => setBudgetUsd(e.target.value)}
              />
              <span className="muted" style={{ fontSize: 12 }}>
                {tx({
                  en: 'Checked before each agent, adding up every run of the task. Only works with providers that report cost (Claude); one run may go a little over the cap.',
                  pt: 'Conferido antes de cada agente, somando todas as execuções da tarefa. Só vale para provedores que informam custo (Claude); uma execução pode passar um pouco do teto.',
                })}
              </span>
            </label>

            <details>
              <summary className="eyebrow" style={{ cursor: 'pointer' }}>{tx({ en: 'Model per agent (optional)', pt: 'Modelo por agente (opcional)' })}</summary>
              <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-sm" onClick={() => setAgentModels(CLAUDE_SPLIT)}>
                    {tx({ en: 'Claude: opus to judge, sonnet to build', pt: 'Claude: opus para julgar, sonnet para construir' })}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setAgentModels({})}>{tx({ en: 'Clear', pt: 'Limpar' })}</button>
                </div>
                {AGENT_ORDER.map(id => (
                  <label key={id} className="row" style={{ gap: 8 }}>
                    <span style={{ width: 110, fontSize: 13, color: AGENT_UI[id].color }}>{AGENT_UI[id].name}</span>
                    <input
                      className="input mono"
                      style={{ flex: 1 }}
                      placeholder={defaultModel || tx({ en: 'default model', pt: 'modelo padrão' })}
                      value={agentModels[id] ?? ''}
                      onChange={e => setAgentModels(m => ({ ...m, [id]: e.target.value.trim() }))}
                    />
                  </label>
                ))}
                <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'Empty uses the task model. The id must exist in the chosen provider.', pt: 'Vazio usa o modelo da tarefa. O id precisa existir no provedor escolhido.' })}</span>
              </div>
            </details>

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="btn" onClick={close} disabled={saving}>
                {tx({ en: 'Cancel', pt: 'Cancelar' })}
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Plus size={16} /> {saving ? tx({ en: 'Creating...', pt: 'Criando...' }) : tx({ en: 'Add to intake', pt: 'Adicionar à Entrada' })}
              </button>
            </div>
          </form>
        ) : (
          <div className="stack">
            <div className="row">
              <Search size={16} className="muted" />
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder={tx({ en: 'Filter issues by title or repository...', pt: 'Filtrar issues por título ou repositório...' })}
                value={issueFilter}
                onChange={e => setIssueFilter(e.target.value)}
              />
            </div>

            {issuesError ? (
              <div className="callout callout-crit">{tx({ en: 'Could not fetch issues: ', pt: 'Falha ao buscar issues: ' })}{issuesError}</div>
            ) : loadingIssues ? (
              <div className="card card-pad muted" style={{ textAlign: 'center' }}>
                {tx({ en: 'Fetching issues from the connected repositories...', pt: 'Buscando issues nos repositórios conectados...' })}
              </div>
            ) : filteredIssues.length === 0 ? (
              <div className="card card-pad muted" style={{ textAlign: 'center' }}>
                {tx({ en: 'No open issue found in the connected repositories.', pt: 'Nenhuma issue aberta encontrada nos repositórios conectados.' })}
              </div>
            ) : (
              <div className="stack" style={{ maxHeight: 300, overflowY: 'auto', gap: 6 }}>
                {filteredIssues.map(issue => (
                  <div
                    key={issue.id}
                    className="card card-pad row"
                    style={{ justifyContent: 'space-between', padding: '8px 12px' }}
                  >
                    <div className="stack" style={{ gap: 2, flex: 1 }}>
                      <span style={{ fontWeight: 500 }}>
                        #{issue.number} {issue.title}
                      </span>
                      <span className="muted mono" style={{ fontSize: 11 }}>
                        {issue.repo} · {issue.provider}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => handleSelectIssue(issue)}
                    >
                      {tx({ en: 'Fill in', pt: 'Preencher' })}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
