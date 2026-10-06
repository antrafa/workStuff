import './repos.css'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Async, ConfirmModal, Page, SkeletonRows, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { Browser } from './Browser'
import { NoConnection } from './NoConnection'
import { SetupWizard } from './SetupWizard'
import { deleteSource, fetchSources, type Source } from './api'
import { tx } from '@/lib/i18n'

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
      // no storage: the chosen connection is not remembered
    }
  }, [current?.id])

  const remove = async (s: Source) => {
    try {
      await deleteSource(s.id)
      toast(tx({ en: `Connection ${s.label} removed; the clones on disk stay where they are`, pt: `Conexão ${s.label} removida; os clones no disco continuam onde estão` }))
      sources.reload()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Page
      title={tx({ en: 'Repositories', pt: 'Repositórios' })}
      hint={tx({
        en: 'Browse GitLab or GitHub and clone projects or whole subgroups, keeping the folder hierarchy from a base group.',
        pt: 'Navegue no GitLab ou no GitHub e clone projetos ou subgrupos inteiros, mantendo a hierarquia de pastas a partir de um grupo base.',
      })}
      actions={list.length > 0 && <button className="btn btn-primary" onClick={() => setWizard({ editing: null })}><Plus size={14} /> {tx({ en: 'New connection', pt: 'Nova conexão' })}</button>}
    >
      <Async
        state={sources}
        isEmpty={d => d.length === 0}
        skeleton={<SkeletonRows rows={3} height={56} />}
        empty={<NoConnection onConnect={() => setWizard({ editing: null })} />}
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
                    <span className={`badge ${s.token ? '' : 'badge-warn'}`} title={s.token ? tx({ en: 'token set', pt: 'token configurado' }) : tx({ en: 'no token: public content only', pt: 'sem token: só o que é público' })}>{s.token ?? tx({ en: 'no token', pt: 'sem token' })}</span>
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setWizard({ editing: s })} title={tx({ en: `Edit ${s.label}`, pt: `Editar ${s.label}` })}><Pencil size={13} /></button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDeleting(s)} title={tx({ en: `Remove ${s.label}`, pt: `Remover ${s.label}` })}><Trash2 size={13} /></button>
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
        <ConfirmModal
          title={tx({ en: `Remove the connection ${deleting.label}?`, pt: `Remover a conexão ${deleting.label}?` })}
          action={tx({ en: 'remove connection', pt: 'remover conexão' })}
          effects={[tx({ en: 'The connection and the pasted token, if any, are removed', pt: 'Sai a conexão e o token colado, se houver' })]}
          losses={[tx({
            en: <>Nothing on disk: the clones in <code className="inline">{deleting.workspaceLabel}</code> are not touched</>,
            pt: <>Nada no disco: os clones em <code className="inline">{deleting.workspaceLabel}</code> não são tocados</>,
          })]}
          confirmLabel={tx({ en: 'Remove', pt: 'Remover' })}
          icon={Trash2}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove(deleting)}
        />
      )}
    </Page>
  )
}
