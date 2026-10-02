import {
  Activity, ArrowUpCircle, BellRing, Cpu, Dices, FileSearch, GitBranch, GitCompare, GitPullRequest, History, ScrollText, Server, ServerCog, ShieldAlert, Sparkles, Stethoscope, Users, Workflow, Wrench,
  type LucideIcon,
} from 'lucide-react'

// mock: a tela ainda usa dados de exemplo; some quando a funcionalidade for portada.
export type NavItem = { path: string; label: string; hint: string; icon: LucideIcon; mock?: true }
export type NavGroup = { label: string; items: NavItem[] }

// Fonte única do menu: sidebar, breadcrumb e configuração de itens ocultos leem daqui.
export const NAV: NavGroup[] = [
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
    ],
  },
]

export function findNav(pathname: string) {
  for (const group of NAV) {
    const item = group.items.find(i => pathname === i.path || pathname.startsWith(i.path + '/'))
    if (item) return { group, item }
  }
  return null
}
