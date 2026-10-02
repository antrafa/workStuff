import { Cpu } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router'
import { Empty, Page, Segmented, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { fetchSession } from '@/features/cluster/api'
import { ApisSection } from './ApisSection'
import { IngressCertsSection, KubeconfigCertsSection } from './CertsSections'

type Tab = 'apis' | 'certificados' | 'kubeconfigs'
const TABS: { id: Tab; label: string }[] = [
  { id: 'apis', label: 'APIs removidas' },
  { id: 'certificados', label: 'Certificados TLS' },
  { id: 'kubeconfigs', label: 'Kubeconfigs' },
]

export default function UpgradePage() {
  const { aba } = useParams()
  const navigate = useNavigate()
  const tab: Tab = TABS.some(t => t.id === aba) ? (aba as Tab) : 'apis'
  const session = useAsync(fetchSession)
  const [namespace, setNamespace] = useState('')

  // Kubeconfigs não falam com cluster nenhum: a aba funciona sem sessão.
  const needsCluster = tab !== 'kubeconfigs'
  const sessionKey = session.data ? `${session.data.kubeconfig.id}|${session.data.context}` : 'sem-cluster'

  return (
    <Page
      title="Prontidão para upgrade"
      hint="O que quebra ao atualizar o Kubernetes: APIs removidas na versão de destino, certificados TLS dos ingresses e credenciais dos kubeconfigs perto de vencer. Só leitura."
    >
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Segmented<Tab> value={tab} onChange={t => navigate(`/upgrade/${t}`)} options={TABS} />
        <div className="spacer" />
        {needsCluster && session.data && (
          <>
            <span className="muted" style={{ fontSize: 12.5 }}>Cluster: <span className="mono">{session.data.context}</span></span>
            <input className="input mono" style={{ width: 200 }} value={namespace} onChange={e => setNamespace(e.target.value.trim())} placeholder="namespace (vazio = todos)" title="Com RBAC limitado, informe o namespace" />
          </>
        )}
      </div>

      {tab === 'kubeconfigs' && <KubeconfigCertsSection />}
      {needsCluster && session.loading && !session.data && <SkeletonRows rows={2} height={48} />}
      {needsCluster && session.error && <div className="callout callout-crit">{session.error}</div>}
      {needsCluster && !session.loading && !session.error && !session.data && (
        <div className="card">
          <Empty icon={Cpu} title="Nenhum cluster conectado" action={<Link className="btn btn-primary" to="/cluster">Conectar na tela Cluster</Link>}>
            A verificação usa o kubeconfig e o contexto escolhidos na tela Cluster.{tab === 'apis' && ' Os manifests de um repositório dá para verificar abaixo, sem cluster.'}
          </Empty>
        </div>
      )}
      {tab === 'apis' && !session.loading && <ApisSection key={sessionKey} namespace={namespace} withCluster={Boolean(session.data)} />}
      {tab === 'certificados' && session.data && <IngressCertsSection key={sessionKey} namespace={namespace} />}
    </Page>
  )
}
