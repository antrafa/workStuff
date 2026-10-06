import {
  Activity, ArrowUpCircle, BellRing, BookOpen, Bot, Cpu, Dices, Factory, FileSearch, GitBranch, GitCompare, GitPullRequest, History, LayoutDashboard, ScrollText, Server, ServerCog, ShieldAlert, Sparkles, Stethoscope, Terminal, Users, Workflow, Wrench,
  type LucideIcon,
} from 'lucide-react'
// Relative, not '@/': scripts/check-nav.ts imports this file in Node
import { tx } from '../lib/i18n.ts'

// mock: the screen still uses sample data; it goes away when the feature is ported.
export type NavItem = { path: string; label: string; hint: string; icon: LucideIcon; mock?: true }
// `id` is stable across languages: open groups are remembered by it, and code checks it
export type NavGroup = { id: string; label: string; items: NavItem[] }

// Single source of the menu: sidebar, breadcrumb, palette and hidden items read from here.
export const NAV: NavGroup[] = [
  {
    id: 'overview',
    label: tx({ en: 'Overview', pt: 'Visão Geral' }),
    items: [
      { path: '/', label: tx({ en: 'Home', pt: 'Início' }), hint: tx({ en: 'Consolidated view of the environment, the cluster and the factory agents', pt: 'Painel consolidado do ambiente, cluster e agentes da fábrica' }), icon: LayoutDashboard },
    ],
  },
  {
    id: 'development',
    label: tx({ en: 'Development', pt: 'Desenvolvimento' }),
    items: [
      { path: '/fabrica', label: tx({ en: 'Factory', pt: 'Fábrica' }), hint: tx({ en: 'Agent-driven development with worktrees and approval', pt: 'Desenvolvimento guiado por agentes com worktrees e aprovação' }), icon: Factory },
      { path: '/dev-runbooks', label: tx({ en: 'Dev runbooks', pt: 'Runbooks de dev' }), hint: tx({ en: 'Local procedures and commands for day-to-day development', pt: 'Procedimentos e comandos locais para o dia a dia do dev' }), icon: Terminal },
    ],
  },
  {
    id: 'tools',
    label: tx({ en: 'Tools', pt: 'Ferramentas' }),
    items: [
      { path: '/maquina', label: tx({ en: 'Machine', pt: 'Máquina' }), hint: tx({ en: 'What is missing to get work done', pt: 'O que falta instalar para trabalhar' }), icon: Stethoscope },
      { path: '/perfil', label: tx({ en: 'Team profile', pt: 'Perfil de equipe' }), hint: tx({ en: 'Exports and imports the setup for someone else', pt: 'Exporta e importa a configuração para outra pessoa' }), icon: Users },
      { path: '/conversores', label: tx({ en: 'Converters', pt: 'Conversores' }), hint: tx({ en: 'JWT, base64, URL, timestamp, UUID, cron, JSON, diff, regex, hash', pt: 'JWT, base64, URL, timestamp, UUID, cron, JSON, diff, regex, hash' }), icon: Wrench },
      { path: '/servicos', label: tx({ en: 'Local services', pt: 'Serviços locais' }), hint: tx({ en: 'Listening ports, containers and compose projects', pt: 'Portas em escuta, containers e projetos compose' }), icon: Server },
      { path: '/agenda', label: tx({ en: 'Scheduled checks', pt: 'Verificações agendadas' }), hint: tx({ en: 'Alerts when a pipeline, certificate or pods change state', pt: 'Avisa quando pipeline, certificado ou pods mudam de estado' }), icon: BellRing },
      { path: '/gerador', label: tx({ en: 'Data generator', pt: 'Gerador de dados' }), hint: tx({ en: 'Test CPF, CNPJ, person and company', pt: 'CPF, CNPJ, pessoa e empresa de teste' }), icon: Dices },
    ],
  },
  {
    id: 'deploy',
    label: tx({ en: 'Deploy', pt: 'Deploy' }),
    items: [
      { path: '/repositorios', label: tx({ en: 'Repositories', pt: 'Repositórios' }), hint: tx({ en: 'Browses GitLab/GitHub and clones with the folder hierarchy', pt: 'Navega no GitLab/GitHub e clona com a hierarquia de pastas' }), icon: GitBranch },
      { path: '/pipelines', label: tx({ en: 'Pipelines', pt: 'Pipelines' }), hint: tx({ en: 'GitLab CI and GitHub Actions runs, with failures explained by AI', pt: 'Esteiras do GitLab CI e GitHub Actions, com a falha explicada pela IA' }), icon: Workflow },
      { path: '/revisao', label: tx({ en: 'Pre-MR review', pt: 'Revisão antes do MR' }), hint: tx({ en: 'AI reviews your branch diff against the base', pt: 'A IA revisa o diff da sua branch contra a base' }), icon: GitPullRequest },
      { path: '/vulnerabilidades', label: tx({ en: 'Vulnerabilities', pt: 'Vulnerabilidades' }), hint: tx({ en: 'Known flaws and outdated versions in the dependencies', pt: 'Falhas conhecidas e versões desatualizadas nas dependências' }), icon: ShieldAlert },
    ],
  },
  {
    id: 'kubernetes',
    label: tx({ en: 'Kubernetes', pt: 'Kubernetes' }),
    items: [
      { path: '/cluster', label: tx({ en: 'Cluster', pt: 'Cluster' }), hint: tx({ en: 'Pods, nodes and live diagnosis', pt: 'Pods, nodes e diagnóstico ao vivo' }), icon: Cpu },
      { path: '/recursos', label: tx({ en: 'Requests & Limits', pt: 'Requests & Limits' }), hint: tx({ en: 'Resources declared in the manifests', pt: 'Recursos declarados nos manifests' }), icon: ServerCog },
      { path: '/logs', label: tx({ en: 'Logs', pt: 'Logs' }), hint: tx({ en: 'Logs from several pods at once, by application', pt: 'Logs de vários pods ao mesmo tempo, por aplicação' }), icon: ScrollText },
      { path: '/incidente', label: tx({ en: 'Timeline', pt: 'Linha do tempo' }), hint: tx({ en: 'Events, restarts and rollouts of an incident, and the post-mortem', pt: 'Eventos, restarts e rollouts de um incidente, e o post-mortem' }), icon: History },
      { path: '/comparar', label: tx({ en: 'Compare environments', pt: 'Comparar ambientes' }), hint: tx({ en: 'Image, replicas, resources and variables between two namespaces', pt: 'Imagem, réplicas, recursos e variáveis entre dois namespaces' }), icon: GitCompare },
      { path: '/upgrade', label: tx({ en: 'Upgrade', pt: 'Upgrade' }), hint: tx({ en: 'Removed APIs, certificates and credentials before upgrading', pt: 'APIs removidas, certificados e credenciais antes de atualizar' }), icon: ArrowUpCircle },
      { path: '/runbooks', label: tx({ en: 'Runbooks', pt: 'Runbooks' }), hint: tx({ en: 'Markdown procedures with executable kubectl steps', pt: 'Procedimentos em Markdown com passos kubectl executáveis' }), icon: BookOpen },
      { path: '/performance', label: tx({ en: 'Performance', pt: 'Performance' }), hint: tx({ en: 'CPU, memory and restarts over time', pt: 'CPU, memória e restarts no tempo' }), icon: Activity },
    ],
  },

  {
    id: 'ai',
    label: tx({ en: 'AI', pt: 'IA' }),
    items: [
      { path: '/catalogo', label: tx({ en: 'Catalog', pt: 'Catálogo' }), hint: tx({ en: 'Skills, prompts, rules and personas from your folders', pt: 'Skills, prompts, rules e personas das suas pastas' }), icon: Sparkles },
      { path: '/analise', label: tx({ en: 'Analysis', pt: 'Análise' }), hint: tx({ en: 'A project\'s architecture through AI', pt: 'Arquitetura de um projeto via IA' }), icon: FileSearch },
      { path: '/playbooks', label: tx({ en: 'Playbooks', pt: 'Playbooks' }), hint: tx({ en: 'Procedures and recipes run by AI with streaming', pt: 'Procedimentos e receitas executados pela IA via streaming' }), icon: Bot },
    ],
  },

]

export function findNav(pathname: string) {
  for (const group of NAV) {
    const item = group.items.find(i => {
      if (i.path === '/') return pathname === '/'
      return pathname === i.path || pathname.startsWith(i.path + '/')
    })
    if (item) return { group, item }
  }
  return null
}
