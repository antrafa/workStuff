import { useState, useEffect } from 'react'
import { FolderOpen, GitPullRequest, Plus, Search, Cpu } from 'lucide-react'
import { Modal, Segmented } from '@/ui'
import { api } from '@/lib/api'

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
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function NewTaskModal({ open, onClose, onCreated }: Props) {
  const [tab, setTab] = useState<'manual' | 'issues'>('manual')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  // null until Configurações answers: the server then applies the configured provider
  const [provider, setProvider] = useState<SettingsResponse['provider'] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickedIssue, setPickedIssue] = useState<Issue | null>(null)

  const close = () => {
    setError(null)
    setPickedIssue(null)
    onClose()
  }

  // Carrega provedor configurado no workstuff
  useEffect(() => {
    if (open) {
      api.get<SettingsResponse>('/factory/settings')
        .then(res => {
          if (res?.provider) setProvider(res.provider)
        })
        .catch(() => {})
    }
  }, [open])

  // Issues remotas
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
    setDescription(issue.body?.trim() || `Demanda importada da issue #${issue.number} de ${issue.repo}.`)
    setTab('manual')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !repoPath.trim()) {
      setError('Informe o título e o caminho do repositório local.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await api.post('/factory/tasks', {
        title,
        description,
        // empty: the server resolves the repo's default branch (main, master, develop...)
        baseBranch: baseBranch.trim() || undefined,
        provider: provider ?? undefined,
        source: pickedIssue
          ? { type: pickedIssue.provider, repoPath, issueIid: pickedIssue.number, issueUrl: pickedIssue.url }
          : { type: 'manual', repoPath },
      })
      onCreated()
      close()
      setTitle('')
      setDescription('')
      setRepoPath('')
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
    <Modal onClose={close} title="Nova Tarefa na Fábrica">
      <div className="stack" style={{ minWidth: 480 }}>
        {/* Abas do Modal */}
        <Segmented
          options={[
            { id: 'manual', label: 'Tarefa manual' },
            { id: 'issues', label: 'Importar issue remota' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {error && <div className="callout callout-crit">{error}</div>}

        {pickedIssue && tab === 'manual' && (
          <div className="callout callout-info row" style={{ justifyContent: 'space-between' }}>
            <span>
              <GitPullRequest size={14} /> Vinculada à issue #{pickedIssue.number} de {pickedIssue.repo}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setPickedIssue(null)}>
              Desvincular
            </button>
          </div>
        )}

        {tab === 'manual' ? (
          <form onSubmit={handleSubmit} className="stack">
            <label className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">Título da Demanda</span>
              <input
                className="input"
                placeholder="Ex.: Corrigir timeout na conexão com banco de dados"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
              />
            </label>

            <label className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">Repositório Local (Pasta do clone)</span>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="/caminho/do/projeto/workspace"
                  value={repoPath}
                  onChange={e => setRepoPath(e.target.value)}
                  required
                />
                <button type="button" className="btn" onClick={pickFolder} title="Escolher pasta">
                  <FolderOpen size={16} /> Escolher
                </button>
              </div>
            </label>

            <div className="row" style={{ gap: 12 }}>
              <label className="stack" style={{ gap: 4, flex: 1 }}>
                <span className="eyebrow">Branch Base</span>
                <input
                  className="input"
                  placeholder="padrão do repositório"
                  value={baseBranch}
                  onChange={e => setBaseBranch(e.target.value)}
                />
              </label>

              <label className="stack" style={{ gap: 4, flex: 1 }}>
                <span className="eyebrow row" style={{ gap: 4 }}>
                  <Cpu size={12} /> Provedor de IA
                </span>
                <select
                  className="input"
                  value={provider ?? ''}
                  onChange={e => setProvider(e.target.value as SettingsResponse['provider'])}
                >
                  {provider === null && <option value="">Padrão de Configurações</option>}
                  <option value="agy">Antigravity (AGY)</option>
                  <option value="codex">Codex</option>
                  <option value="claude">Claude Code</option>
                </select>
              </label>
            </div>

            <label className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">Descrição dos Requisitos</span>
              <textarea
                className="input"
                rows={4}
                placeholder="Explique o que precisa ser feito, arquivos afetados ou critérios de aceitação..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </label>

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="btn" onClick={close} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Plus size={16} /> {saving ? 'Criando...' : 'Adicionar à Entrada'}
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
                placeholder="Filtrar issues por título ou repositório..."
                value={issueFilter}
                onChange={e => setIssueFilter(e.target.value)}
              />
            </div>

            {issuesError ? (
              <div className="callout callout-crit">Falha ao buscar issues: {issuesError}</div>
            ) : loadingIssues ? (
              <div className="card card-pad muted" style={{ textAlign: 'center' }}>
                Buscando issues nos repositórios conectados...
              </div>
            ) : filteredIssues.length === 0 ? (
              <div className="card card-pad muted" style={{ textAlign: 'center' }}>
                Nenhuma issue aberta encontrada nos repositórios conectados.
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
                      Preencher
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
