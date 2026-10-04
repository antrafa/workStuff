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
import type { FactoryTask } from '../../../server/lib/factory/types.ts'
import { FactoryStatusChip } from '@/features/factory/timeline/FactoryStatusChip'

export default function DashboardPage() {
  const navigate = useNavigate()
  const cluster = useClusterShared()

  const [tasks, setTasks] = useState<FactoryTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)

  const [doctorChecks, setDoctorChecks] = useState<Check[]>([])
  const [loadingDoctor, setLoadingDoctor] = useState(true)

  const [services, setServices] = useState<Services | null>(null)
  const [loadingServices, setLoadingServices] = useState(true)

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

  useEffect(() => {
    loadAll(true)
  }, [])

  // Auto-refresh suave a cada 10 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      loadAll(true)
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  // Cálculos da Fábrica
  const executingTasks = tasks.filter(
    t => Boolean(t.executing) || ['planning', 'building', 'qa_security'].includes(t.state)
  )
  const waitingApprovalTasks = tasks.filter(t => t.state === 'waiting_approval')
  const reviewTasks = tasks.filter(t => t.state === 'review')
  const doneTasks = tasks.filter(t => t.state === 'done')
  const activeTasks = tasks.filter(t => t.state !== 'done' && t.state !== 'canceled')

  // Cálculos do Doctor
  const doctorFalta = doctorChecks.filter(c => c.status === 'falta').length
  const doctorAviso = doctorChecks.filter(c => c.status === 'aviso').length
  const doctorOk = doctorChecks.filter(c => c.status === 'ok').length

  // Cálculos de Serviços
  const listeningCount = services?.ports?.length ?? 0
  const dockerContainers = services?.containers?.length ?? 0

  return (
    <Page
      title="Início"
      hint="Painel consolidado com a saúde do cluster Kubernetes, execuções ativas da Fábrica de Software e atalhos rápidos do ambiente de desenvolvimento."
      actions={
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => loadAll(false)}
            disabled={refreshing}
            title="Atualizar todos os indicadores agora"
          >
            <RotateCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
          <Link to="/fabrica" className="btn btn-sm btn-primary">
            <Plus size={14} /> Nova Tarefa na Fábrica
          </Link>
        </div>
      }
    >
      <div className="stack" style={{ gap: 20 }}>
        {/* 1. GRADE DE MÉTRICAS PRINCIPAIS (HERO STATS) */}
        <div className="grid" style={{ ['--min' as string]: '220px' }}>
          {/* Card: Fábrica de Software */}
          <Link
            to="/fabrica"
            className="stat"
            style={{ textDecoration: 'none', color: 'inherit', position: 'relative', overflow: 'hidden' }}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Factory size={14} style={{ color: 'var(--accent)' }} /> Fábrica de Software
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
                  {executingTasks.length} rodando
                </span>
              )}
            </div>
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <b style={{ color: executingTasks.length > 0 ? '#4ade80' : 'var(--ink)' }}>
                {loadingTasks ? '...' : activeTasks.length}
              </b>
              <small style={{ color: 'var(--muted)' }}>tarefas em andamento</small>
            </div>
            <div className="row" style={{ gap: 10, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              <span>Aprovação: <strong style={{ color: waitingApprovalTasks.length > 0 ? 'var(--warn)' : 'inherit' }}>{waitingApprovalTasks.length}</strong></span>
              <span>•</span>
              <span>Revisão: <strong style={{ color: reviewTasks.length > 0 ? 'var(--accent)' : 'inherit' }}>{reviewTasks.length}</strong></span>
              <span>•</span>
              <span>Concluídas: {doneTasks.length}</span>
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
                <Cpu size={14} style={{ color: '#5ad2dd' }} /> Cluster Kubernetes
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
                    {cluster.problems === 1 ? 'pod com problema' : 'pods com problema'}
                  </small>
                </>
              ) : (
                <>
                  <b style={{ fontSize: 20, color: 'var(--muted)' }}>Desconectado</b>
                  <small style={{ color: 'var(--muted)' }}>selecionar cluster</small>
                </>
              )}
            </div>
            <div className="row" style={{ gap: 6, fontSize: 11, color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cluster.session ? (
                <span>Contexto: <strong className="mono" style={{ color: 'var(--ink)' }}>{cluster.session.context}</strong></span>
              ) : (
                <span>Nenhum kubeconfig ativo no momento</span>
              )}
            </div>
          </Link>

          {/* Card: Saúde da Máquina (Doctor) */}
          <Link
            to="/maquina"
            className="stat"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Stethoscope size={14} style={{ color: doctorFalta > 0 ? 'var(--crit)' : 'var(--ok)' }} /> Máquina &amp; Doctor
              </span>
              {doctorFalta === 0 && !loadingDoctor && (
                <span className="badge badge-ok" style={{ fontSize: 10 }}>Apta</span>
              )}
            </div>
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <b style={{ color: doctorFalta > 0 ? 'var(--crit)' : 'var(--ok)' }}>
                {loadingDoctor ? '...' : doctorFalta > 0 ? `${doctorFalta} pendências` : `${doctorOk} itens ok`}
              </b>
            </div>
            <div className="row" style={{ gap: 10, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              <span>{doctorAviso} avisos</span>
              <span>•</span>
              <span>Ferramentas e requisitos locais</span>
            </div>
          </Link>

          {/* Card: Serviços e Portas Locais */}
          <Link
            to="/servicos"
            className="stat"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Server size={14} style={{ color: '#c084fc' }} /> Serviços Locais
              </span>
              {dockerContainers > 0 && (
                <span className="badge" style={{ fontSize: 10, background: 'rgba(90, 210, 221, 0.15)', color: '#5ad2dd' }}>
                  {dockerContainers} containers
                </span>
              )}
            </div>
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <b>{loadingServices ? '...' : listeningCount}</b>
              <small style={{ color: 'var(--muted)' }}>portas em escuta</small>
            </div>
            <div className="row" style={{ gap: 10, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              <span>Docker: {services?.docker ? 'Ativo' : 'Inativo'}</span>
              <span>•</span>
              <span>Containers e processos locais</span>
            </div>
          </Link>
        </div>

        {/* 2. SEÇÃO DE DESTAQUE: FÁBRICA DE SOFTWARE */}
        <div className="card">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <Factory size={16} style={{ color: 'var(--accent)' }} />
              <span className="card-title">Fábrica de Software e Agentes Autônomos</span>
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
                  {executingTasks.length} {executingTasks.length === 1 ? 'execução ativa em background' : 'execuções ativas em background'}
                </span>
              )}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link to="/fabrica" className="btn btn-sm">
                Abrir Fábrica Completa <ArrowRight size={13} />
              </Link>
            </div>
          </div>

          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {tasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--muted)' }}>
                <p style={{ margin: '0 0 10px', fontSize: 13.5 }}>
                  Nenhuma demanda criada ainda na Fábrica de Software.
                </p>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--muted)' }}>
                  Crie uma demanda para que o Architect planeje e o Implementer codifique em worktrees Git isoladas com validação mecânica de testes.
                </p>
                <Link to="/fabrica" className="btn btn-sm btn-primary">
                  <Plus size={14} /> Iniciar Primeira Demanda
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.slice(0, 4).map(task => {
                  const isTaskExecuting = Boolean(task.executing) || ['planning', 'building', 'qa_security'].includes(task.state)
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
                            {task.branchName} • criado em {new Date(task.createdAt).toLocaleDateString()} às {new Date(task.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FactoryStatusChip status={task.state} />
                        {task.state === 'waiting_approval' && (
                          <span className="badge badge-warn" style={{ fontSize: 11 }}>
                            Aguardando aprovação
                          </span>
                        )}
                        <span className="btn btn-ghost btn-sm" style={{ padding: '0 8px', fontSize: 12 }}>
                          Ver detalhes →
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 3. GRID DE 2 COLUNAS: KUBERNETES & MÁQUINA */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          {/* Coluna 1: Kubernetes & Observabilidade */}
          <div className="card">
            <div className="card-head">
              <Cpu size={16} style={{ color: '#5ad2dd' }} />
              <span className="card-title">Cluster &amp; Observabilidade</span>
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
                    <span>Contexto: <b className="mono" style={{ color: 'var(--ink)' }}>{cluster.session.context}</b></span>
                    <span>•</span>
                    <span>Contextos disponíveis: <b className="mono">{cluster.session.kubeconfig.contexts?.length ?? 1}</b></span>
                  </div>
                  {cluster.problems > 0 && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--crit)' }}>
                      <AlertTriangle size={14} />
                      <span>Existem <strong>{cluster.problems} pods com problema</strong> detectados neste cluster.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 'var(--r)', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  Nenhum cluster conectado. Vá para a tela Cluster para carregar seu arquivo kubeconfig.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                <Link to="/cluster" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <Cpu size={13} /> Pods e Nós
                </Link>
                <Link to="/logs" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <Terminal size={13} /> Logs de Aplicação
                </Link>
                <Link to="/incidente" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <History size={13} /> Linha do Tempo
                </Link>
                <Link to="/recursos" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <Activity size={13} /> Requests &amp; Limits
                </Link>
              </div>
            </div>
          </div>

          {/* Coluna 2: Máquina Local & Repositórios */}
          <div className="card">
            <div className="card-head">
              <Stethoscope size={16} style={{ color: 'var(--ok)' }} />
              <span className="card-title">Ambiente de Desenvolvimento Local</span>
            </div>
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--r)', border: '1px solid var(--line)' }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Diagnóstico da Máquina</span>
                  {doctorFalta === 0 ? (
                    <span className="badge badge-ok" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={12} /> Tudo pronto
                    </span>
                  ) : (
                    <span className="badge badge-crit" style={{ fontSize: 11 }}>
                      {doctorFalta} pendências
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {doctorFalta === 0
                    ? 'Todas as dependências e ferramentas obrigatórias para trabalho estão configuradas e instaladas.'
                    : `Existem ${doctorFalta} ferramentas ou credenciais obrigatórias pendentes para execução completa.`}
                </p>
                {doctorFalta > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Link to="/maquina" className="btn btn-sm btn-danger" style={{ fontSize: 11, padding: '2px 8px' }}>
                      Resolver pendências agora →
                    </Link>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                <Link to="/dev-runbooks" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <Terminal size={13} /> Runbooks de Dev
                </Link>
                <Link to="/repositorios" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <GitBranch size={13} /> Repositórios
                </Link>
                <Link to="/revisao" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <GitPullRequest size={13} /> Revisão Pré-MR
                </Link>
                <Link to="/pipelines" className="btn btn-sm" style={{ justifyContent: 'flex-start' }}>
                  <Workflow size={13} /> Pipelines CI/CD
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* 4. ATALHOS RÁPIDOS DE ENGENHARIA & PRODUTIVIDADE */}
        <div className="card">
          <div className="card-head">
            <Sparkles size={16} style={{ color: '#c084fc' }} />
            <span className="card-title">Ferramentas de Engenharia &amp; Produtividade</span>
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
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Runbooks de Dev</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Comandos locais executáveis</span>
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
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Catálogo de IA</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Skills, prompts e regras</span>
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
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Conversores</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>JWT, UUID, Base64 e JSON</span>
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
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Gerador de Dados</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>CPF, CNPJ e dados de teste</span>
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
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Vulnerabilidades</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Scan de dependências e CVEs</span>
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
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Runbooks Kubernetes</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Procedimentos com passos kubectl</span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Page>
  )
}
