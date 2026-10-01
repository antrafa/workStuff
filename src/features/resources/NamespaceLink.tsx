import { Link2, Link2Off, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { fetchKubeconfigs, fetchNamespaces, removeLink, saveLink, type NamespaceLink as LinkT } from './api'

const ENV_BADGE: Record<string, string> = { DES: 'badge-info', ITG: 'badge-crit', HML: 'badge-warn', PRO: 'badge-ok' }

type Props = { projectId: number; link: LinkT | null; environment: string | null; onChange: () => void; onReadNow: () => void; reading: boolean }

// Liga a stack ao namespace do cluster onde ela roda, para comparar o manifest com o uso real.
export function NamespaceLinkBar({ projectId, link, environment, onChange, onReadNow, reading }: Props) {
  const [editing, setEditing] = useState(false)
  const toast = useToast()

  if (link && !editing) {
    return (
      <div className="row res-link">
        <Link2 size={14} />
        <span>Uso ao vivo de</span>
        <b className="mono">{link.kubeconfigId.replace(/\.(ya?ml|kubeconfig)$/, '')}</b>
        {environment && <span className={`badge ${ENV_BADGE[environment] ?? ''}`}>{environment}</span>}
        <span className="muted">/</span>
        <b className="mono">{link.namespace}</b>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={onReadNow} disabled={reading} title="Lê o uso de memória dos pods agora (só leitura no cluster)">
          <RotateCw size={13} className={reading ? 'spin' : ''} /> Ler uso agora
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Trocar vínculo</button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => removeLink(projectId).then(onChange).catch(e => toast((e as Error).message))}
          title="Desfaz o vínculo; a tabela volta a mostrar só o manifest"
        >
          <Link2Off size={13} /> Remover
        </button>
      </div>
    )
  }
  return <LinkForm projectId={projectId} initial={link} onDone={() => (setEditing(false), onChange())} onCancel={link ? () => setEditing(false) : undefined} />
}

function LinkForm({ projectId, initial, onDone, onCancel }: { projectId: number; initial: LinkT | null; onDone: () => void; onCancel?: () => void }) {
  const kubeconfigs = useAsync(fetchKubeconfigs)
  const [kubeconfigId, setKubeconfigId] = useState(initial?.kubeconfigId ?? '')
  const [namespace, setNamespace] = useState(initial?.namespace ?? '')
  const [namespaces, setNamespaces] = useState<{ list: string[]; limited: boolean } | null>(null)
  const toast = useToast()

  useEffect(() => {
    setNamespaces(null)
    if (!kubeconfigId) return
    fetchNamespaces(kubeconfigId).then(r => setNamespaces({ list: r.namespaces, limited: r.limitedRbac })).catch(() => setNamespaces({ list: [], limited: true }))
  }, [kubeconfigId])

  if (kubeconfigs.data?.length === 0) {
    return (
      <div className="callout callout-info" style={{ fontSize: 12.5 }}>
        <Link2 size={15} />
        <span>Para comparar com o uso real, adicione um kubeconfig na <Link to="/cluster">tela Cluster</Link> e volte aqui para vincular o namespace.</span>
      </div>
    )
  }

  const save = () => saveLink(projectId, { kubeconfigId, namespace: namespace.trim() }).then(onDone).catch(e => toast((e as Error).message))

  return (
    <div className="row res-link">
      <Link2 size={14} />
      <span>Comparar com o uso real:</span>
      <select className="select" value={kubeconfigId} onChange={e => setKubeconfigId(e.target.value)} title="Kubeconfig do cluster onde a stack roda">
        <option value="">kubeconfig…</option>
        {kubeconfigs.data?.map(k => <option key={k.id} value={k.id}>{k.id}{k.environment ? ` (${k.environment})` : ''}</option>)}
      </select>
      {namespaces && !namespaces.limited && namespaces.list.length > 0 ? (
        <select className="select" value={namespace} onChange={e => setNamespace(e.target.value)} title="Namespace da stack">
          <option value="">namespace…</option>
          {namespaces.list.map(n => <option key={n}>{n}</option>)}
        </select>
      ) : (
        <input className="input mono" value={namespace} onChange={e => setNamespace(e.target.value)} placeholder={kubeconfigId && !namespaces ? 'carregando…' : 'namespace'} title="Com RBAC limitado, digite o namespace" style={{ width: 180 }} />
      )}
      <button className="btn btn-primary btn-sm" disabled={!kubeconfigId || !namespace.trim()} onClick={save}>Vincular</button>
      {onCancel && <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancelar</button>}
      <span className="muted" style={{ fontSize: 12 }}>O vínculo só lê os pods; nada é alterado no cluster.</span>
    </div>
  )
}
