import { useState } from 'react'
import { FolderOpen, FolderPlus } from 'lucide-react'
import { Modal, Segmented } from '@/ui'
import { api } from '@/lib/api'
import { tx } from '@/lib/i18n'
import type { FactoryProjectView } from '../../../../server/lib/factory/types.ts'

type Props = {
  onClose: () => void
  onCreated: (project: FactoryProjectView) => void
}

// A project is a folder: an existing one, or a new one created under a parent folder.
export function NewProjectModal({ onClose, onCreated }: Props) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [parent, setParent] = useState('')
  const [folder, setFolder] = useState('')
  const [gitInit, setGitInit] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (set: (path: string) => void) => {
    try {
      const res = await api.post<{ path: string | null }>('/factory/pick-folder')
      if (res.path) set(res.path)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = mode === 'existing'
        ? { name: name || rootPath.split('/').pop(), rootPath }
        : { name: name || folder, create: { parent, folder, gitInit } }
      onCreated(await api.post<FactoryProjectView>('/factory/projects', body))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const folderField = (value: string, set: (v: string) => void, label: string) => (
    <label className="stack" style={{ gap: 4 }}>
      <span className="eyebrow">{label}</span>
      <div className="row" style={{ gap: 8 }}>
        <input className="input mono" style={{ flex: 1 }} value={value} onChange={e => set(e.target.value)} placeholder="/home/…" required />
        <button type="button" className="btn" onClick={() => pick(set)}>
          <FolderOpen size={16} /> {tx({ en: 'Choose', pt: 'Escolher' })}
        </button>
      </div>
    </label>
  )

  return (
    <Modal title={tx({ en: 'New project', pt: 'Novo projeto' })} onClose={onClose}>
      <form className="stack" style={{ gap: 12 }} onSubmit={submit}>
        <Segmented
          options={[
            { id: 'existing', label: tx({ en: 'Use an existing folder', pt: 'Usar pasta existente' }) },
            { id: 'new', label: tx({ en: 'Create a new folder', pt: 'Criar pasta nova' }) },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === 'existing' ? (
          folderField(rootPath, setRootPath, tx({ en: 'Project folder', pt: 'Pasta do projeto' }))
        ) : (
          <>
            {folderField(parent, setParent, tx({ en: 'Parent folder', pt: 'Pasta pai' }))}
            <label className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">{tx({ en: 'New folder name', pt: 'Nome da pasta nova' })}</span>
              <input className="input mono" value={folder} onChange={e => setFolder(e.target.value)} placeholder="meu-produto" required />
            </label>
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={gitInit} onChange={e => setGitInit(e.target.checked)} />
              <span>{tx({ en: 'Start a git repository (git init + empty first commit)', pt: 'Iniciar repositório git (git init + primeiro commit vazio)' })}</span>
            </label>
          </>
        )}

        <label className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">{tx({ en: 'Name (optional)', pt: 'Nome (opcional)' })}</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={tx({ en: 'the folder name', pt: 'o nome da pasta' })} />
        </label>

        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          {tx({
            en: 'Repositories inside the folder (up to two levels down) are found by themselves. Ideas and tasks of the project are kept in the panel data, never in the folder.',
            pt: 'Os repositórios dentro da pasta (até dois níveis abaixo) são encontrados sozinhos. Ideias e tarefas do projeto ficam nos dados do painel, nunca na pasta.',
          })}
        </p>

        {error && <div className="callout callout-crit">{error}</div>}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>{tx({ en: 'Cancel', pt: 'Cancelar' })}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <FolderPlus size={16} /> {saving ? tx({ en: 'Creating...', pt: 'Criando...' }) : tx({ en: 'Create project', pt: 'Criar projeto' })}
          </button>
        </div>
      </form>
    </Modal>
  )
}
