import './cluster.css'
import { Bot, LayoutGrid, RotateCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router'
import { Page, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { DoctorPanel } from './DoctorPanel'
import { KubeconfigBar } from './KubeconfigBar'
import { LogsDock } from './LogsDock'
import { NodesPanel } from './NodesPanel'
import { PodDetailModal } from './PodDetailModal'
import { PodsTable } from './PodsTable'
import { ProblemsPanel } from './ProblemsPanel'
import { usePolling } from './usePolling'
import { fetchNamespaces, fetchPods, refreshSession, setShared, useClusterShared, type Pod } from './api'

export default function ClusterPage() {
  const { aba } = useParams()
  const { session, loaded } = useClusterShared()
  const sessionKey = session ? `${session.kubeconfig.id}|${session.context}` : ''
  const [namespace, setNamespace] = useState('')
  const [metricsUnavailable, setMetricsUnavailable] = useState(false)

  useEffect(() => void refreshSession(), [])
  useEffect(() => setNamespace(''), [sessionKey])

  const pods = useAsync(async () => {
    if (!session) return []
    const r = await fetchPods(namespace || undefined)
    setMetricsUnavailable(r.metricsUnavailable)
    setShared({ problems: r.pods.filter(p => p.health.level !== 'ok').length })
    return r.pods
  }, [sessionKey, namespace])
  const namespaces = useAsync(() => (session ? fetchNamespaces() : Promise.resolve({ namespaces: [], limitedRbac: false })), [sessionKey])
  usePolling(pods.reload, Boolean(session))

  const [detail, setDetail] = useState<{ pod: Pod; tab?: string } | null>(null)
  const [logsPod, setLogsPod] = useState<Pod | null>(null)
  const problems = pods.data?.filter(p => p.health.level !== 'ok').length ?? 0
  const env = session?.kubeconfig.environment ?? null

  return (
    <Page
      title="Cluster"
      hint="Pods, nodes e problemas do kubeconfig ativo, com diagnóstico por IA."
      actions={
        session && (
          <>
            {pods.data && <PodCounts pods={pods.data} />}
            <button className="btn" onClick={pods.reload} title="Recarrega os pods agora (o painel já atualiza a cada 30s)">
              <RotateCw size={14} className={pods.loading ? 'spin' : ''} /> Atualizar
            </button>
          </>
        )
      }
    >
      {!loaded ? <SkeletonRows rows={2} height={64} /> : <KubeconfigBar session={session} />}

      {session && (
        <>
          <nav className="tabs" role="tablist">
            <TabLink to="/cluster" end icon={LayoutGrid} label="Visão geral" />
            <TabLink
              to="/cluster/problemas"
              icon={TriangleAlert}
              label="Problemas"
              badge={problems > 0 ? <span className="badge badge-crit">{problems}</span> : null}
            />
            <TabLink to="/cluster/doctor" icon={Bot} label="Cluster Doctor" badge={<span className="badge badge-signal">IA</span>} />
          </nav>

          {!aba && (
            <>
              <PodsTable
                state={pods}
                env={env}
                metricsUnavailable={metricsUnavailable}
                namespace={namespace}
                onNamespace={setNamespace}
                namespaces={namespaces.data}
                onOpen={pod => setDetail({ pod })}
              />
              <NodesPanel key={sessionKey} />
            </>
          )}
          {aba === 'problemas' && <ProblemsPanel state={pods} env={env} onOpen={pod => setDetail({ pod, tab: 'eventos' })} onLogs={setLogsPod} />}
          {aba === 'doctor' && <DoctorPanel />}
        </>
      )}

      {detail && (
        <PodDetailModal
          pod={detail.pod}
          initialTab={detail.tab}
          onClose={() => setDetail(null)}
          onLogs={() => {
            setLogsPod(detail.pod)
            setDetail(null)
          }}
        />
      )}
      {logsPod && <LogsDock key={`${logsPod.namespace}/${logsPod.name}`} pod={logsPod} onClose={() => setLogsPod(null)} />}
    </Page>
  )
}

// Os números que respondem "está tudo bem?" ao lado do título, sem precisar rolar.
function PodCounts({ pods }: { pods: Pod[] }) {
  const critical = pods.filter(p => p.health.level === 'critical').length
  const warning = pods.filter(p => p.health.level === 'warning').length
  return (
    <dl className="head-stats">
      <div><dt className="eyebrow">Pods</dt><dd>{pods.length}</dd></div>
      <div className={critical ? 'is-crit' : ''}><dt className="eyebrow">◆ Crítico</dt><dd>{critical}</dd></div>
      <div className={warning ? 'is-warn' : ''}><dt className="eyebrow">▲ Atenção</dt><dd>{warning}</dd></div>
    </dl>
  )
}

type TabLinkProps = { to: string; end?: boolean; icon: typeof Bot; label: string; badge?: React.ReactNode }

function TabLink({ to, end, icon: Icon, label, badge }: TabLinkProps) {
  return (
    <NavLink to={to} end={end} className="tab-link" role="tab">
      <Icon size={14} /> {label} {badge}
    </NavLink>
  )
}
