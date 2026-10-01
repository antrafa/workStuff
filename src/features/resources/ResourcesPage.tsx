import './resources.css'
import { Building2, FolderTree, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { Async, Chips, Empty, Page, Search, SkeletonRows, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { StackTable } from './StackTable'
import { fetchClients, fetchConfig } from './api'
import { OriginSetup } from './OriginSetup'

export default function ResourcesPage() {
  const config = useAsync(fetchConfig)
  const [editing, setEditing] = useState(false)

  const header = { eyebrow: 'Kubernetes', title: 'Requests & Limits', hint: 'Memória, CPU e JVM declarados nos manifests de um grupo do GitLab, comparados com o uso real dos pods.' }
  if (config.loading && !config.data) return <Page {...header}><SkeletonRows rows={2} height={60} /></Page>
  if (!config.data || editing) {
    return (
      <Page {...header}>
        <OriginSetup current={config.data} onSaved={() => (setEditing(false), config.reload())} onCancel={config.data ? () => setEditing(false) : undefined} />
      </Page>
    )
  }
  return <Configured key={`${config.data.sourceId}|${config.data.groupPath}`} origin={config.data} onChangeOrigin={() => setEditing(true)} header={header} />
}

type ConfiguredProps = {
  origin: { label: string | null; groupPath: string }
  onChangeOrigin: () => void
  header: { eyebrow: string; title: string; hint: string }
}

function Configured({ origin, onChangeOrigin, header }: ConfiguredProps) {
  const clients = useAsync(() => fetchClients())
  const [clientName, setClientName] = useState<string | null>(null)
  const [stackIndex, setStackIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const toast = useToast()

  const list = clients.data?.clients ?? []
  const visible = list.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
  const client = list.find(c => c.name === clientName) ?? list[0]
  const stack = client?.stacks[stackIndex] ?? client?.stacks[0]

  const pickClient = (name: string) => {
    setClientName(name)
    setStackIndex(0)
  }

  // Refazer a lista consulta todos os projetos do grupo no GitLab: leva alguns segundos.
  const refresh = async () => {
    setRefreshing(true)
    try {
      clients.setData(await fetchClients(true))
    } catch (e) {
      toast(`Não atualizou a lista: ${(e as Error).message}`)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Page
      {...header}
      actions={
        <>
          {clients.data?.fetchedAt && <span className="muted" style={{ fontSize: 12 }} title={clients.data.fetchedAt}>lista lida {relTime(clients.data.fetchedAt)}</span>}
          <button className="btn" onClick={refresh} disabled={refreshing} title="Busca de novo os subgrupos e projetos do grupo configurado">
            <RotateCw size={14} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Buscando no GitLab…' : 'Atualizar lista'}
          </button>
        </>
      }
    >
      <div className="row res-link">
        <FolderTree size={14} />
        <span>Origem:</span>
        <b>{origin.label ?? 'conexão removida'}</b>
        <span className="muted">·</span>
        <span className="mono">{origin.groupPath}</span>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={onChangeOrigin} title="Escolhe outra conexão ou outro grupo">Trocar origem</button>
      </div>
      <Async
        state={clients}
        isEmpty={d => d.clients.length === 0}
        skeleton={<SkeletonRows rows={2} height={36} />}
        empty={
          <div className="card">
            <Empty icon={Building2} title="Nenhum projeto encontrado" action={<button className="btn btn-primary" onClick={refresh}>Atualizar lista</button>}>
              O grupo {origin.groupPath} não tem projetos ativos em subgrupos diretos. Confira o grupo ou se o token da conexão tem acesso a ele.
            </Empty>
          </div>
        }
      >
        {() => (
          <>
            <div className="card card-pad stack" style={{ ['--gap' as string]: '10px' }}>
              <div className="row">
                <span className="eyebrow">Subgrupo</span>
                <Search value={query} onChange={setQuery} placeholder="Filtrar subgrupos…" width={220} />
                <span className="mono muted" style={{ fontSize: 12 }}>{visible.length} / {list.length}</span>
              </div>
              {visible.length === 0 ? (
                <span className="muted">Nenhum subgrupo casa com “{query}”.</span>
              ) : (
                <Chips value={client?.name ?? ''} onChange={pickClient} options={visible.map(c => ({ id: c.name, label: c.name, count: c.stacks.length > 1 ? c.stacks.length : undefined }))} />
              )}
            </div>

            {client && client.stacks.length > 1 && (
              <div className="tabs" role="tablist">
                {client.stacks.map((s, i) => (
                  <button key={s.projectId} role="tab" aria-selected={s === stack} onClick={() => setStackIndex(i)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            {stack && <StackTable key={stack.projectId} stack={stack} />}
          </>
        )}
      </Async>
    </Page>
  )
}
