import { Cpu } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router'
import { Empty, Page, Segmented, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { fetchSession } from '@/features/cluster/api'
import { ApisSection } from './ApisSection'
import { IngressCertsSection, KubeconfigCertsSection } from './CertsSections'
import { tx } from '@/lib/i18n'

type Tab = 'apis' | 'certificados' | 'kubeconfigs'
const TABS: { id: Tab; label: string }[] = [
  { id: 'apis', label: tx({ en: 'Removed APIs', pt: 'APIs removidas' }) },
  { id: 'certificados', label: tx({ en: 'TLS certificates', pt: 'Certificados TLS' }) },
  { id: 'kubeconfigs', label: 'Kubeconfigs' },
]

export default function UpgradePage() {
  const { aba } = useParams()
  const navigate = useNavigate()
  const tab: Tab = TABS.some(t => t.id === aba) ? (aba as Tab) : 'apis'
  const session = useAsync(fetchSession)
  const [namespace, setNamespace] = useState('')

  // Kubeconfigs talk to no cluster: the tab works without a session.
  const needsCluster = tab !== 'kubeconfigs'
  const sessionKey = session.data ? `${session.data.kubeconfig.id}|${session.data.context}` : 'sem-cluster'

  return (
    <Page
      title={tx({ en: 'Upgrade readiness', pt: 'Prontidão para upgrade' })}
      hint={tx({
        en: 'What breaks when upgrading Kubernetes: APIs removed in the target version, ingress TLS certificates and kubeconfig credentials close to expiring. Read-only.',
        pt: 'O que quebra ao atualizar o Kubernetes: APIs removidas na versão de destino, certificados TLS dos ingresses e credenciais dos kubeconfigs perto de vencer. Só leitura.',
      })}
    >
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Segmented<Tab> value={tab} onChange={t => navigate(`/upgrade/${t}`)} options={TABS} />
        <div className="spacer" />
        {needsCluster && session.data && (
          <>
            <span className="muted" style={{ fontSize: 12.5 }}>Cluster: <span className="mono">{session.data.context}</span></span>
            <input className="input mono" style={{ width: 200 }} value={namespace} onChange={e => setNamespace(e.target.value.trim())} placeholder={tx({ en: 'namespace (empty = all)', pt: 'namespace (vazio = todos)' })} title={tx({ en: 'With limited RBAC, enter the namespace', pt: 'Com RBAC limitado, informe o namespace' })} />
          </>
        )}
      </div>

      {tab === 'kubeconfigs' && <KubeconfigCertsSection />}
      {needsCluster && session.loading && !session.data && <SkeletonRows rows={2} height={48} />}
      {needsCluster && session.error && <div className="callout callout-crit">{session.error}</div>}
      {needsCluster && !session.loading && !session.error && !session.data && (
        <div className="card">
          <Empty icon={Cpu} title={tx({ en: 'No cluster connected', pt: 'Nenhum cluster conectado' })} action={<Link className="btn btn-primary" to="/cluster">{tx({ en: 'Connect on the Cluster screen', pt: 'Conectar na tela Cluster' })}</Link>}>
            {tx({ en: 'The check uses the kubeconfig and context chosen on the Cluster screen.', pt: 'A verificação usa o kubeconfig e o contexto escolhidos na tela Cluster.' })}
            {tab === 'apis' && tx({ en: " A repository's manifests can be checked below, without a cluster.", pt: ' Os manifests de um repositório dá para verificar abaixo, sem cluster.' })}
          </Empty>
        </div>
      )}
      {tab === 'apis' && !session.loading && <ApisSection key={sessionKey} namespace={namespace} withCluster={Boolean(session.data)} />}
      {tab === 'certificados' && session.data && <IngressCertsSection key={sessionKey} namespace={namespace} />}
    </Page>
  )
}
