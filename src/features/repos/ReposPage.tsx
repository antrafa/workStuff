import './repos.css'
import { FolderGit2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Async, ConfirmModal, Empty, Page, SkeletonRows, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { Browser } from './Browser'
import { SetupWizard } from './SetupWizard'
import { deleteSource, fetchSources, type Source } from './api'

const LAST = 'repos-last-source'
const readLast = () => {
  try {
    return localStorage.getItem(LAST)
  } catch {
    return null
  }
}

export default function ReposPage() {
  const sources = useAsync(fetchSources)
  const [selected, setSelected] = useState<string | null>(readLast)
  const [wizard, setWizard] = useState<{ editing: Source | null } | null>(null)
  const [deleting, setDeleting] = useState<Source | null>(null)
  const toast = useToast()

  const list = sources.data ?? []
  const current = list.find(s => s.id === selected) ?? list[0] ?? null

  useEffect(() => {
    try {
      if (current) localStorage.setItem(LAST, current.id)
    } catch {
      // sem storage a conexão escolhida não é lembrada
    }
  }, [current?.id])

  const remove = async (s: Source) => {
    try {
      await deleteSource(s.id)
      toast(`Conexão ${s.label} removida; os clones no disco continuam onde estão`)
      sources.reload()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Page
      eyebrow="Deploy"
      title="Repositórios"
      hint="Navegue no GitLab ou no GitHub e clone projetos ou subgrupos inteiros, mantendo a hierarquia de pastas a partir de um grupo base."
      actions={list.length > 0 && <button className="btn btn-primary" onClick={() => setWizard({ editing: null })}><Plus size={14} /> Nova conexão</button>}
    >
      <Async
        state={sources}
        isEmpty={d => d.length === 0}
        skeleton={<SkeletonRows rows={3} height={56} />}
        empty={
          <div className="card">
            <Empty
              icon={FolderGit2}
              title="Nenhuma conexão ainda"
              action={<button className="btn btn-primary" onClick={() => setWizard({ editing: null })}><Plus size={14} /> Conectar GitLab ou GitHub</button>}
            >
              Conecte seu GitLab ou GitHub, escolha o grupo base e a pasta do workspace. Depois é só navegar e clonar: cada projeto vai para a pasta que espelha o caminho dele no provedor.
            </Empty>
          </div>
        }
      >
        {() => (
          <>
            <div className="row repo-sources">
              {list.map(s => (
                <div key={s.id} className="repo-source" aria-pressed={current?.id === s.id}>
                  <button className="repo-source-main" onClick={() => setSelected(s.id)} title={`${s.url}/${s.basePath} → ${s.workspaceLabel}`}>
                    <b>{s.label}</b>
                    <span className="badge">{s.provider === 'gitlab' ? 'GitLab' : 'GitHub'}</span>
                    <span className="badge">{s.protocol.toUpperCase()}</span>
                    <span className={`badge ${s.token ? '' : 'badge-warn'}`} title={s.token ? 'token configurado' : 'sem token: só o que é público'}>{s.token ?? 'sem token'}</span>
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setWizard({ editing: s })} title={`Editar ${s.label}`}><Pencil size={13} /></button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDeleting(s)} title={`Remover ${s.label}`}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            {current && <Browser key={current.id} source={current} />}
          </>
        )}
      </Async>

      {wizard && (
        <SetupWizard
          editing={wizard.editing}
          onClose={() => setWizard(null)}
          onSaved={s => {
            setWizard(null)
            setSelected(s.id)
            sources.reload()
          }}
        />
      )}
      {deleting && (
        <ConfirmModal title={`Remover a conexão ${deleting.label}?`} confirmLabel="Remover" icon={Trash2} onClose={() => setDeleting(null)} onConfirm={() => remove(deleting)}>
          Sai só a conexão (e o token colado, se houver). Os repositórios já clonados em <code className="inline">{deleting.workspaceLabel}</code> não são tocados.
        </ConfirmModal>
      )}
    </Page>
  )
}
