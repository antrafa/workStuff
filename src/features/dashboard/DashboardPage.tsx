import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  Dices,
  Factory,
  GitBranch,
  GitPullRequest,
  History,
  Plus,
  RotateCw,
  Server,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Terminal,
  Workflow,
  Wrench,
} from 'lucide-react'
import { EnvStamp, Page } from '@/ui'
import { api } from '@/lib/api'
import { refreshSession, useClusterShared } from '@/features/cluster/api'
import { fetchChecks, type Check } from '@/features/doctor/api'
import { fetchServices, type Services } from '@/features/local/api'
import { fetchWatches, type Watch } from '@/features/pipelines/api'
import { fetchWorkspace, type WorkspaceRepo } from '@/features/repos/api'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'
import { FactoryStatusChip } from '@/features/factory/timeline/FactoryStatusChip'
import { isTaskRunning } from '../factory/factoryRun'
import { NeedFinder } from './NeedFinder'
import { DailyCard } from './DailyCard'
import { locale, tx } from '@/lib/i18n'

export default function DashboardPage() {
  const navigate = useNavigate()
  const cluster = useClusterShared()

  const [tasks, setTasks] = useState<FactoryTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)

  const [doctorChecks, setDoctorChecks] = useState<Check[]>([])
  const [loadingDoctor, setLoadingDoctor] = useState(true)

  const [services, setServices] = useState<Services | null>(null)
  const [loadingServices, setLoadingServices] = useState(true)

  const [workspaceRepos, setWorkspaceRepos] = useState<WorkspaceRepo[]>([])
  const [pipelineWatches, setPipelineWatches] = useState<Watch[]>([])

  const [refreshing, setRefreshing] = useState(false)

  const loadAll = async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      await Promise.allSettled([
        api.get<FactoryTask[]>('/factory/tasks')
          .then(data => {
            setTasks(Array.isArray(data) ? data : [])
            setLoadingTasks(false)
          })
          .catch(() => setLoadingTasks(false)),
        fetchChecks()
          .then(data => {
            setDoctorChecks(data.items ?? [])
            setLoadingDoctor(false)
          })
          .catch(() => setLoadingDoctor(false)),
        fetchServices()
          .then(data => {
            setServices(data)
            setLoadingServices(false)
          })
          .catch(() => setLoadingServices(false)),
        refreshSession(),
      ])
    } finally {
      if (!silent) setRefreshing(false)
    }
  }

  // Heavy on purpose, so never on the 10 s poll: the scan runs git in every clone and the watches call
  // the GitLab/GitHub API once per followed pipeline. They load on open and on Refresh.
  const loadContext = () =>
    Promise.allSettled([
      fetchWorkspace()
        .then(data => setWorkspaceRepos(data.repos ?? []))
        .catch(e => console.warn('[dashboard] workspace scan failed:', (e as Error).message)),
      fetchWatches()
        .then(data => setPipelineWatches(Array.isArray(data) ? data : []))
        .catch(e => console.warn('[dashboard] pipeline watches failed:', (e as Error).message)),
    ])

  const refreshAll = () => Promise.all([loadAll(false), loadContext()])

  useEffect(() => {
    loadAll(true)
    loadContext()
  }, [])

  // Quiet auto-refresh every 10 seconds, only while the tab is in view
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadAll(true)
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  // Factory figures
  const executingTasks = tasks.filter(isTaskRunning)
  const waitingApprovalTasks = tasks.filter(t => t.state === 'waiting_approval')
  const reviewTasks = tasks.filter(t => t.state === 'review')
  const waitingUserTasks = tasks.filter(
    t => t.state === 'waiting_clarification' || t.state === 'waiting_approval' || t.state === 'review'
  )
  const doneTasks = tasks.filter(t => t.state === 'done')
  const activeTasks = tasks.filter(t => t.state !== 'done' && t.state !== 'canceled')

  // Workspace resume figures (dirty, stash, or committed in last 24h)
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  const recentRepos = workspaceRepos
    .filter(r => r.dirtyCount > 0 || r.stashCount > 0 || (r.lastCommitAt && Date.parse(r.lastCommitAt) >= dayAgo))
    .slice(0, 3)

  // Pipeline watches needing attention
  const alertWatches = pipelineWatches.filter(
    w => w.latest?.status === 'failed' || w.latest?.status === 'running'
  ).slice(0, 3)

  // Doctor figures
  const doctorFalta = doctorChecks.filter(c => c.status === 'falta').length
  const doctorAviso = doctorChecks.filter(c => c.status === 'aviso').length
  const doctorOk = doctorChecks.filter(c => c.status === 'ok').length

  // Services figures
  const listeningCount = services?.ports?.length ?? 0
  const dockerContainers = services?.containers?.length ?? 0

  return (
    <Page
      title={tx({ en: 'Home', pt: 'Início' })}
      hint={tx({ en: 'Start here: say what you need and the panel points to the screen that does it. Below, what is waiting for you, the stand-up summary and the state of the machine, the cluster and the Factory.', pt: 'Comece por aqui: diga o que você precisa e o painel aponta a tela que faz isso. Abaixo, o que está esperando você, o resumo da daily e o estado da máquina, do cluster e da Fábrica.' })}
      actions={
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={refreshAll}
            disabled={refreshing}
            title={tx({ en: 'Refresh all indicators now', pt: 'Atualizar todos os indicadores agora' })}
          >
            <RotateCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? tx({ en: 'Refreshing...', pt: 'Atualizando...' }) : tx({ en: 'Refresh', pt: 'Atualizar' })}
          </button>
          <Link to="/fabrica" className="btn btn-sm btn-primary">
            <Plus size={14} /> {tx({ en: 'New factory task', pt: 'Nova Tarefa na Fábrica' })}
          </Link>
        </div>
      }
    >
      <div className="stack" style={{ gap: 20 }}>
        <NeedFinder />

        {/* 1. Main figures (hero stats) */}
        <div className="grid" style={{ ['--min' as string]: '220px' }}>
          {/* Card: Software Factory */}
          <Link
            to="/fabrica"
            className="stat"
            style={{ textDecoration: 'none', color: 'inherit', position: 'relative', overflow: 'hidden' }}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Factory size={14} style={{ color: 'var(--accent)' }} /> {tx({ en: 'Software Factory', pt: 'Fábrica de Software' })}
              </span>
              {executingTasks.length > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: '#4ade80',
                    fontFamily: 'ui-monospace, monospace',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.2s infinite' }} />
                  {tx({ en: `${executingTasks.length} running`, pt: `${executingTasks.length} rodando` })}
                </span>
              )}
            </div>
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <b style={{ color: executingTasks.length > 0 ? '#4ade80' : 'var(--ink)' }}>
                {loadingTasks ? '...' : activeTasks.length}
              </b>
              <small style={{ color: 'var(--muted)' }}>{tx({ en: 'tasks in progress', pt: 'tarefas em andamento' })}</small>
            </div>
            <div className="row" style={{ gap: 10, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              <span>{tx({ en: 'Approval:', pt: 'Aprovação:' })} <strong style={{ color: waitingApprovalTasks.length > 0 ? 'var(--warn)' : 'inherit' }}>{waitingApprovalTasks.length}</strong></span>
              <span>•</span>
              <span>{tx({ en: 'Review:', pt: 'Revisão:' })} <strong style={{ color: reviewTasks.length > 0 ? 'var(--accent)' : 'inherit' }}>{reviewTasks.length}</strong></span>
              <span>•</span>
              <span>{tx({ en: 'Done:', pt: 'Concluídas:' })} {doneTasks.length}</span>
            </div>
          </Link>

          {/* Card: Kubernetes Cluster */}
          <Link
            to="/cluster"
            className="stat"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Cpu size={14} style={{ color: '#5ad2dd' }} /> {tx({ en: 'Kubernetes cluster', pt: 'Cluster Kubernetes' })}
              </span>
              {cluster.session && (
                <EnvStamp env={cluster.session.kubeconfig.environment} />
              )}
            </div>
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              {cluster.session ? (
                <>
                  <b style={{ color: cluster.problems > 0 ? 'var(--crit)' : 'var(--ok)' }}>
                    {cluster.problems}
                  </b>
                  <small style={{ color: cluster.problems > 0 ? 'var(--crit)' : 'var(--muted)' }}>
                    {cluster.problems === 1 ? tx({ en: 'pod with problems', pt: 'pod com problema' }) : tx({ en: 'pods with problems', pt: 'pods com problema' })}
                  </small>
                </>
              ) : (
                <>
                  <b style={{ fontSize: 20, color: 'var(--muted)' }}>{tx({ en: 'Disconnected', pt: 'Desconectado' })}</b>
                  <small style={{ color: 'var(--muted)' }}>{tx({ en: 'select a cluster', pt: 'selecionar cluster' })}</small>
                </>
              )}
            </div>
            <div className="row" style={{ gap: 6, fontSize: 11, color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cluster.session ? (
                <span>{tx({ en: 'Context:', pt: 'Contexto:' })} <strong className="mono" style={{ color: 'var(--ink)' }}>{cluster.session.context}</strong></span>
              ) : (
                <span>{tx({ en: 'No active kubeconfig right now', pt: 'Nenhum kubeconfig ativo no momento' })}</span>
              )}
            </div>
          </Link>

          {/* Card: machine health (Doctor) */}
          <Link
            to="/maquina"
            className="stat"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Stethoscope size={14} style={{ color: doctorFalta > 0 ? 'var(--crit)' : 'var(--ok)' }} /> {tx({ en: 'Machine & Doctor', pt: 'Máquina & Doctor' })}
              </span>
              {doctorFalta === 0 && !loadingDoctor && (
                <span className="badge badge-ok" style={{ fontSize: 10 }}>{tx({ en: 'Ready', pt: 'Apta' })}</span>
              )}
            </div>
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <b style={{ color: doctorFalta > 0 ? 'var(--crit)' : 'var(--ok)' }}>
                {loadingDoctor ? '...' : doctorFalta > 0 ? tx({ en: `${doctorFalta} pending`, pt: `${doctorFalta} pendências` }) : tx({ en: `${doctorOk} items ok`, pt: `${doctorOk} itens ok` })}
              </b>
            </div>
            <div className="row" style={{ gap: 10, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              <span>{tx({ en: `${doctorAviso} warnings`, pt: `${doctorAviso} avisos` })}</span>
              <span>•</span>
              <span>{tx({ en: 'Local tools and requirements', pt: 'Ferramentas e requisitos locais' })}</span>
            </div>
          </Link>

          {/* Card: local services and ports */}
          <Link
            to="/servicos"
            className="stat"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Server size={14} style={{ color: '#c084fc' }} /> {tx({ en: 'Local services', pt: 'Serviços Locais' })}
              </span>
              {dockerContainers > 0 && (
                <span className="badge" style={{ fontSize: 10, background: 'rgba(90, 210, 221, 0.15)', color: '#5ad2dd' }}>
                  {tx({ en: `${dockerContainers} containers`, pt: `${dockerContainers} containers` })}
                </span>
              )}
            </div>
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <b>{loadingServices ? '...' : listeningCount}</b>
              <small style={{ color: 'var(--muted)' }}>{tx({ en: 'listening ports', pt: 'portas em escuta' })}</small>
            </div>
            <div className="row" style={{ gap: 10, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              <span>Docker: {services?.docker ? tx({ en: 'Active', pt: 'Ativo' }) : tx({ en: 'Inactive', pt: 'Inativo' })}</span>
              <span>•</span>
              <span>{tx({ en: 'Local containers and processes', pt: 'Containers e processos locais' })}</span>
            </div>
          </Link>
        </div>

        {/* 1.5. Context resumption: Where I left off */}
        {(recentRepos.length > 0 || waitingUserTasks.length > 0 || alertWatches.length > 0) && (
          <div className="card">
            <div className="card-head" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <History size={16} style={{ color: 'var(--signal)' }} />
                <span className="card-title">{tx({ en: 'Where I left off', pt: 'Onde eu parei' })}</span>
                <small className="muted">
                  {tx({
                    en: 'Active local repositories, Factory tasks waiting for you and pipeline alerts',
                    pt: 'Repositórios locais ativos, tarefas da Fábrica esperando você e alertas de pipeline',
                  })}
                </small>
              </div>
              <Link to="/repositorios?aba=workspace" className="btn btn-sm">
                {tx({ en: 'My Workspace', pt: 'Meu Workspace' })} <ArrowRight size={13} />
              </Link>
            </div>
            <div className="card-pad">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {/* Active / dirty local repositories */}
                <div style={{ padding: 12, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <GitBranch size={13} /> {tx({ en: 'Local work in progress', pt: 'Código local em andamento' })}
                    </span>
                    <span className="badge">{recentRepos.length}</span>
                  </div>
                  {recentRepos.length === 0 ? (
                    <small className="muted">{tx({ en: 'All local repositories are clean.', pt: 'Todos os repositórios locais estão limpos.' })}</small>
                  ) : (
                    recentRepos.map(r => (
                      <div key={r.path} className="row" style={{ justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <b>{r.name}</b> <span className="mono muted" style={{ fontSize: 11 }}>({r.branch})</span>
                          <div className="row" style={{ gap: 6, marginTop: 2 }}>
                            {r.dirtyCount > 0 && <span className="badge badge-warn" style={{ fontSize: 10 }}>{r.dirtyCount} {tx({ en: 'modified', pt: 'modificado(s)' })}</span>}
                            {r.stashCount > 0 && <span className="badge badge-info" style={{ fontSize: 10 }}>{r.stashCount} stash</span>}
                          </div>
                        </div>
                        <Link to={`/revisao?repo=${encodeURIComponent(r.path)}`} className="btn btn-sm">
                          {tx({ en: 'Review', pt: 'Revisar' })}
                        </Link>
                      </div>
                    ))
                  )}
                </div>

                {/* Factory waiting on human */}
                <div style={{ padding: 12, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Factory size={13} /> {tx({ en: 'Waiting for your decision', pt: 'Esperando sua decisão' })}
                    </span>
                    <span className={`badge ${waitingUserTasks.length > 0 ? 'badge-warn' : ''}`}>{waitingUserTasks.length}</span>
                  </div>
                  {waitingUserTasks.length === 0 ? (
                    <small className="muted">{tx({ en: 'No Factory task blocked on you right now.', pt: 'Nenhuma tarefa da Fábrica bloqueada esperando você.' })}</small>
                  ) : (
                    waitingUserTasks.slice(0, 3).map(t => (
                      <div key={t.id} className="row" style={{ justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <b>{t.title}</b>
                          <div className="mono muted" style={{ fontSize: 11 }}>{t.branchName}</div>
                        </div>
                        <Link to="/fabrica" className="btn btn-sm">
                          {tx({ en: 'Open', pt: 'Abrir' })}
                        </Link>
                      </div>
                    ))
                  )}
                </div>

                {/* Pipelines needing attention */}
                <div style={{ padding: 12, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Workflow size={13} /> {tx({ en: 'Followed pipelines', pt: 'Pipelines acompanhadas' })}
                    </span>
                    <span className={`badge ${alertWatches.some(w => w.latest?.status === 'failed') ? 'badge-crit' : ''}`}>{alertWatches.length}</span>
                  </div>
                  {alertWatches.length === 0 ? (
                    <small className="muted">{tx({ en: 'No failing or running followed pipeline.', pt: 'Nenhuma pipeline seguida com falha ou rodando.' })}</small>
                  ) : (
                    alertWatches.map(w => (
                      <div key={w.id} className="row" style={{ justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <b>{w.fullPath.split('/').pop()}</b>
                          <div className="mono muted" style={{ fontSize: 11 }}>{w.latest?.ref} • {w.latest?.status}</div>
                        </div>
                        <Link to="/pipelines" className="btn btn-sm">
                          {tx({ en: 'Inspect', pt: 'Ver' })}
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <DailyCard watches={pipelineWatches} />

        {/* 2. Featured section: Software Factory */}
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <Factory size={16} style={{ color: 'var(--accent)' }} />
              <span className="card-title">{tx({ en: 'Software Factory and autonomous agents', pt: 'Fábrica de Software e Agentes Autônomos' })}</span>
              {executingTasks.length > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'rgba(74, 222, 128, 0.15)',
                    color: '#4ade80',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.2s infinite' }} />
                  {executingTasks.length} {executingTasks.length === 1 ? tx({ en: 'run active in the background', pt: 'execução ativa em background' }) : tx({ en: 'runs active in the background', pt: 'execuções ativas em background' })}
                </span>
              )}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link to="/fabrica" className="btn btn-sm">
                {tx({ en: 'Open the full Factory', pt: 'Abrir Fábrica Completa' })} <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {tasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--muted)' }}>
                <p style={{ margin: '0 0 10px', fontSize: 13.5 }}>
                  {tx({ en: 'No demand created in the Software Factory yet.', pt: 'Nenhuma demanda criada ainda na Fábrica de Software.' })}
                </p>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--muted)' }}>
                  {tx({ en: 'Create a demand so the Architect plans it and the Implementer codes it in isolated Git worktrees, with mechanical test validation.', pt: 'Crie uma demanda para que o Architect planeje e o Implementer codifique em worktrees Git isoladas com validação mecânica de testes.' })}
                </p>
                <Link to="/fabrica" className="btn btn-sm btn-primary">
                  <Plus size={14} /> {tx({ en: 'Start the first demand', pt: 'Iniciar Primeira Demanda' })}
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.slice(0, 4).map(task => {
                  const isTaskExecuting = isTaskRunning(task)
                  return (
                    <div
                      key={task.id}
                      onClick={() => navigate('/fabrica')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--r)',
                        cursor: 'pointer',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 260, flex: 1 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: isTaskExecuting ? '#4ade80' : task.state === 'done' ? '#6cb6ff' : '#8b9cb6',
                            boxShadow: isTaskExecuting ? '0 0 8px #4ade80' : 'none',
                            animation: isTaskExecuting ? 'pulse 1.2s infinite' : 'none',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                            {task.title}
                          </span>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {task.branchName} • {tx({ en: `created on ${new Date(task.createdAt).toLocaleDateString(locale())} at ${new Date(task.createdAt).toLocaleTimeString(locale())}`, pt: `criado em ${new Date(task.createdAt).toLocaleDateString(locale())} às ${new Date(task.createdAt).toLocaleTimeString(locale())}` })}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FactoryStatusChip state={task.state} executing={task.executing} />
                        {task.state === 'waiting_approval' && (
                          <span className="badge badge-warn" style={{ fontSize: 11 }}>
                            {tx({ en: 'Waiting for approval', pt: 'Aguardando aprovação' })}
                          </span>
                        )}
                        <span className="btn btn-ghost btn-sm" style={{ padding: '0 8px', fontSize: 12 }}>
                          {tx({ en: 'See details →', pt: 'Ver detalhes →' })}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 3. Two columns: Kubernetes and machine */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          {/* Column 1: Kubernetes and observability */}
          <div className="card">
            <div className="card-head">
              <Cpu size={16} style={{ color: '#5ad2dd' }} />
              <span className="card-title">{tx({ en: 'Cluster & observability', pt: 'Cluster & Observabilidade' })}</span>
            </div>
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cluster.session ? (
                <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--r)', border: '1px solid var(--line)' }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>
                      {cluster.session.kubeconfig.filename}
                    </span>
                    <EnvStamp env={cluster.session.kubeconfig.environment} />
                  </div>
                  <div className="row" style={{ fontSize: 12, color: 'var(--muted)', gap: 10 }}>
                    <span>{tx({ en: 'Context:', pt: 'Contexto:' })} <b className="mono" style={{ color: 'var(--ink)' }}>{cluster.session.context}</b></span>
                    <span>•</span>
                    <span>{tx({ en: 'Available contexts:', pt: 'Contextos disponíveis:' })} <b className="mono">{cluster.session.kubeconfig.contexts?.length ?? 1}</b></span>
                  </div>
                  {cluster.problems > 0 && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--crit)' }}>
                      <AlertTriangle size={14} />
                      <span>{tx({ en: <>There are <strong>{cluster.problems} pods with problems</strong> detected in this cluster.</>, pt: <>Existem <strong>{cluster.problems} pods com problema</strong> detectados neste cluster.</> })}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 'var(--r)', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  {tx({ en: 'No cluster connected. Go to the Cluster screen to load your kubeconfig file.', pt: 'Nenhum cluster conectado. Vá para a tela Cluster para carregar seu arquivo kubeconfig.' })}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                <Link to="/cluster" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <Cpu size={13} /> {tx({ en: 'Pods and nodes', pt: 'Pods e Nós' })}
                </Link>
                <Link to="/logs" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <Terminal size={13} /> {tx({ en: 'Application logs', pt: 'Logs de Aplicação' })}
                </Link>
                <Link to="/incidente" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <History size={13} /> {tx({ en: 'Timeline', pt: 'Linha do Tempo' })}
                </Link>
                <Link to="/recursos" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <Activity size={13} /> Requests &amp; Limits
                </Link>
              </div>
            </div>
          </div>

          {/* Column 2: local machine and repositories */}
          <div className="card">
            <div className="card-head">
              <Stethoscope size={16} style={{ color: 'var(--ok)' }} />
              <span className="card-title">{tx({ en: 'Local development environment', pt: 'Ambiente de Desenvolvimento Local' })}</span>
            </div>
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--r)', border: '1px solid var(--line)' }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tx({ en: 'Machine diagnosis', pt: 'Diagnóstico da Máquina' })}</span>
                  {doctorFalta === 0 ? (
                    <span className="badge badge-ok" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={12} /> {tx({ en: 'All set', pt: 'Tudo pronto' })}
                    </span>
                  ) : (
                    <span className="badge badge-crit" style={{ fontSize: 11 }}>
                      {tx({ en: `${doctorFalta} pending`, pt: `${doctorFalta} pendências` })}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {doctorFalta === 0
                    ? tx({ en: 'All required dependencies and tools for work are set up and installed.', pt: 'Todas as dependências e ferramentas obrigatórias para trabalho estão configuradas e instaladas.' })
                    : tx({ en: `There are ${doctorFalta} required tools or credentials missing for a full run.`, pt: `Existem ${doctorFalta} ferramentas ou credenciais obrigatórias pendentes para execução completa.` })}
                </p>
                {doctorFalta > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Link to="/maquina" className="btn btn-sm btn-danger" style={{ fontSize: 11, padding: '2px 8px' }}>
                      {tx({ en: 'Fix pending items now →', pt: 'Resolver pendências agora →' })}
                    </Link>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                <Link to="/dev-runbooks" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <Terminal size={13} /> {tx({ en: 'Dev runbooks', pt: 'Runbooks de Dev' })}
                </Link>
                <Link to="/repositorios" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <GitBranch size={13} /> {tx({ en: 'Repositories', pt: 'Repositórios' })}
                </Link>
                <Link to="/revisao" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <GitPullRequest size={13} /> {tx({ en: 'Pre-MR review', pt: 'Revisão Pré-MR' })}
                </Link>
                <Link to="/pipelines" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <Workflow size={13} /> Pipelines CI/CD
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Engineering and productivity shortcuts */}
        <div className="card">
          <div className="card-head">
            <Sparkles size={16} style={{ color: '#c084fc' }} />
            <span className="card-title">{tx({ en: 'Engineering & productivity tools', pt: 'Ferramentas de Engenharia & Produtividade' })}</span>
          </div>
          <div className="card-pad">
            <div className="grid" style={{ ['--min' as string]: '200px', gap: 10 }}>
              <Link
                to="/dev-runbooks"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <Terminal size={20} style={{ color: '#5ad2dd', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tx({ en: 'Dev runbooks', pt: 'Runbooks de Dev' })}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tx({ en: 'Runnable local commands', pt: 'Comandos locais executáveis' })}</span>
                </div>
              </Link>

              <Link
                to="/catalogo"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <Sparkles size={20} style={{ color: '#c084fc', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tx({ en: 'AI catalog', pt: 'Catálogo de IA' })}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tx({ en: 'Skills, prompts and rules', pt: 'Skills, prompts e regras' })}</span>
                </div>
              </Link>

              <Link
                to="/conversores"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <Wrench size={20} style={{ color: '#facc15', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tx({ en: 'Converters', pt: 'Conversores' })}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tx({ en: 'JWT, UUID, Base64 and JSON', pt: 'JWT, UUID, Base64 e JSON' })}</span>
                </div>
              </Link>

              <Link
                to="/gerador"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <Dices size={20} style={{ color: '#4ade80', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tx({ en: 'Data generator', pt: 'Gerador de Dados' })}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tx({ en: 'CPF, CNPJ and test data', pt: 'CPF, CNPJ e dados de teste' })}</span>
                </div>
              </Link>

              <Link
                to="/vulnerabilidades"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <ShieldAlert size={20} style={{ color: 'var(--crit)', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tx({ en: 'Vulnerabilities', pt: 'Vulnerabilidades' })}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tx({ en: 'Dependency and CVE scan', pt: 'Scan de dependências e CVEs' })}</span>
                </div>
              </Link>

              <Link
                to="/runbooks"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <BookOpen size={20} style={{ color: '#60a5fa', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tx({ en: 'Kubernetes runbooks', pt: 'Runbooks Kubernetes' })}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tx({ en: 'Procedures with kubectl steps', pt: 'Procedimentos com passos kubectl' })}</span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Page>
  )
}
