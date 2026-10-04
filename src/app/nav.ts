import {
  Activity, ArrowUpCircle, BellRing, BookOpen, Bot, Cpu, Dices, Factory, FileSearch, GitBranch, GitCompare, GitPullRequest, History, LayoutDashboard, ScrollText, Server, ServerCog, ShieldAlert, Sparkles, Stethoscope, Terminal, Users, Workflow, Wrench,
  type LucideIcon,
} from 'lucide-react'



// mock: a tela ainda usa dados de exemplo; some quando a funcionalidade for portada.
export type NavItem = { path: string; label: string; hint: string; icon: LucideIcon; mock?: true }
export type NavGroup = { label: string; items: NavItem[] }

// Fonte única do menu: sidebar, breadcrumb e configuração de itens ocultos leem daqui.
export const NAV: NavGroup[] = [
  {
    label: 'Visão Geral',
    items: [
      { path: '/', label: 'Início', hint: 'Painel consolidado do ambiente, cluster e agentes da fábrica', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Desenvolvimento',
    items: [
      { path: '/fabrica', label: 'Fábrica', hint: 'Desenvolvimento guiado por agentes com worktrees e aprovação', icon: Factory },
      { path: '/dev-runbooks', label: 'Runbooks de dev', hint: 'Procedimentos e comandos locais para o dia a dia do dev', icon: Terminal },
    ],
  },
  {
    label: 'Deploy',
    items: [
      { path: '/maquina', label: 'Máquina', hint: 'O que falta instalar para trabalhar', icon: Stethoscope },
      { path: '/perfil', label: 'Perfil de equipe', hint: 'Exporta e importa a configuração para outra pessoa', icon: Users },
      { path: '/repositorios', label: 'Repositórios', hint: 'Navega no GitLab/GitHub e clona com a hierarquia de pastas', icon: GitBranch },
      { path: '/pipelines', label: 'Pipelines', hint: 'Esteiras do GitLab CI e GitHub Actions, com a falha explicada pela IA', icon: Workflow },
      { path: '/revisao', label: 'Revisão antes do MR', hint: 'A IA revisa o diff da sua branch contra a base', icon: GitPullRequest },
      { path: '/vulnerabilidades', label: 'Vulnerabilidades', hint: 'Falhas conhecidas e versões desatualizadas nas dependências', icon: ShieldAlert },
    ],
  },
  {
    label: 'Kubernetes',
    items: [
      { path: '/cluster', label: 'Cluster', hint: 'Pods, nodes e diagnóstico ao vivo', icon: Cpu },
      { path: '/recursos', label: 'Requests & Limits', hint: 'Recursos declarados nos manifests', icon: ServerCog },
      { path: '/logs', label: 'Logs', hint: 'Logs de vários pods ao mesmo tempo, por aplicação', icon: ScrollText },
      { path: '/incidente', label: 'Linha do tempo', hint: 'Eventos, restarts e rollouts de um incidente, e o post-mortem', icon: History },
      { path: '/comparar', label: 'Comparar ambientes', hint: 'Imagem, réplicas, recursos e variáveis entre dois namespaces', icon: GitCompare },
      { path: '/upgrade', label: 'Upgrade', hint: 'APIs removidas, certificados e credenciais antes de atualizar', icon: ArrowUpCircle },
      { path: '/runbooks', label: 'Runbooks', hint: 'Procedimentos em Markdown com passos kubectl executáveis', icon: BookOpen },
      { path: '/performance', label: 'Performance', hint: 'CPU, memória e restarts no tempo', icon: Activity },
    ],
  },
  {
    label: 'Ferramentas',
    items: [
      { path: '/conversores', label: 'Conversores', hint: 'JWT, base64, URL, timestamp, UUID, cron, JSON, diff, regex, hash', icon: Wrench },
      { path: '/servicos', label: 'Serviços locais', hint: 'Portas em escuta, containers e projetos compose', icon: Server },
      { path: '/agenda', label: 'Verificações agendadas', hint: 'Avisa quando pipeline, certificado ou pods mudam de estado', icon: BellRing },
      { path: '/gerador', label: 'Gerador de dados', hint: 'CPF, CNPJ, pessoa e empresa de teste', icon: Dices },
    ],
  },

  {
    label: 'IA',
    items: [
      { path: '/catalogo', label: 'Catálogo', hint: 'Skills, prompts, rules e personas das suas pastas', icon: Sparkles },
      { path: '/analise', label: 'Análise', hint: 'Arquitetura de um projeto via IA', icon: FileSearch },
      { path: '/playbooks', label: 'Playbooks', hint: 'Procedimentos e receitas executados pela IA via streaming', icon: Bot },
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
