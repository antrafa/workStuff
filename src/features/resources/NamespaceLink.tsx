import { Link2, Link2Off, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { EnvStamp, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { fetchKubeconfigs, fetchNamespaces, removeLink, saveLink, type NamespaceLink as LinkT } from './api'
import { tx } from '@/lib/i18n'


type Props = { projectId: number; link: LinkT | null; environment: string | null; onChange: () => void; onReadNow: () => void; reading: boolean }

// Links the stack to the cluster namespace it runs in, to compare the manifest with real usage.
export function NamespaceLinkBar({ projectId, link, environment, onChange, onReadNow, reading }: Props) {
  const [editing, setEditing] = useState(false)
  const toast = useToast()

  if (link && !editing) {
    return (
      <div className="row res-link">
        <Link2 size={14} />
        <span>{tx({ en: 'Live usage of', pt: 'Uso ao vivo de' })}</span>
        <b className="mono">{link.kubeconfigId.replace(/\.(ya?ml|kubeconfig)$/, '')}</b>
        {environment && <EnvStamp env={environment} />}
        <span className="muted">/</span>
        <b className="mono">{link.namespace}</b>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={onReadNow} disabled={reading} title={tx({ en: "Reads the pods' memory usage now (read-only on the cluster)", pt: 'Lê o uso de memória dos pods agora (só leitura no cluster)' })}>
          <RotateCw size={13} className={reading ? 'spin' : ''} /> {tx({ en: 'Read usage now', pt: 'Ler uso agora' })}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>{tx({ en: 'Change link', pt: 'Trocar vínculo' })}</button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => removeLink(projectId).then(onChange).catch(e => toast((e as Error).message))}
          title={tx({ en: 'Removes the link; the table goes back to showing only the manifest', pt: 'Desfaz o vínculo; a tabela volta a mostrar só o manifest' })}
        >
          <Link2Off size={13} /> {tx({ en: 'Remove', pt: 'Remover' })}
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
        <span>{tx({
          en: <>To compare with real usage, add a kubeconfig on the <Link to="/cluster">Cluster screen</Link> and come back to link the namespace.</>,
          pt: <>Para comparar com o uso real, adicione um kubeconfig na <Link to="/cluster">tela Cluster</Link> e volte aqui para vincular o namespace.</>,
        })}</span>
      </div>
    )
  }

  const save = () => saveLink(projectId, { kubeconfigId, namespace: namespace.trim() }).then(onDone).catch(e => toast((e as Error).message))

  return (
    <div className="row res-link">
      <Link2 size={14} />
      <span>{tx({ en: 'Compare with real usage:', pt: 'Comparar com o uso real:' })}</span>
      <select className="select" value={kubeconfigId} onChange={e => setKubeconfigId(e.target.value)} title={tx({ en: 'Kubeconfig of the cluster the stack runs on', pt: 'Kubeconfig do cluster onde a stack roda' })}>
        <option value="">kubeconfig…</option>
        {kubeconfigs.data?.map(k => <option key={k.id} value={k.id}>{k.id}{k.environment ? ` (${k.environment})` : ''}</option>)}
      </select>
      {namespaces && !namespaces.limited && namespaces.list.length > 0 ? (
        <select className="select" value={namespace} onChange={e => setNamespace(e.target.value)} title={tx({ en: "The stack's namespace", pt: 'Namespace da stack' })}>
          <option value="">namespace…</option>
          {namespaces.list.map(n => <option key={n}>{n}</option>)}
        </select>
      ) : (
        <input className="input mono" value={namespace} onChange={e => setNamespace(e.target.value)} placeholder={kubeconfigId && !namespaces ? tx({ en: 'loading…', pt: 'carregando…' }) : 'namespace'} title={tx({ en: 'With limited RBAC, type the namespace', pt: 'Com RBAC limitado, digite o namespace' })} style={{ width: 180 }} />
      )}
      <button className="btn btn-primary btn-sm" disabled={!kubeconfigId || !namespace.trim()} onClick={save}>{tx({ en: 'Link', pt: 'Vincular' })}</button>
      {onCancel && <button className="btn btn-ghost btn-sm" onClick={onCancel}>{tx({ en: 'Cancel', pt: 'Cancelar' })}</button>}
      <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'The link only reads the pods; nothing changes on the cluster.', pt: 'O vínculo só lê os pods; nada é alterado no cluster.' })}</span>
    </div>
  )
}
