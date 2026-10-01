import {
  Activity, Cpu, Dices, FileSearch, GitBranch, ServerCog, Sparkles, Stethoscope, Wrench,
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
      { path: '/repositorios', label: 'Repositórios', hint: 'Navega no GitLab/GitHub e clona com a hierarquia de pastas', icon: GitBranch },
    ],
  },
  {
    label: 'Kubernetes',
    items: [
      { path: '/cluster', label: 'Cluster', hint: 'Pods, nodes e diagnóstico ao vivo', icon: Cpu },
      { path: '/recursos', label: 'Requests & Limits', hint: 'Recursos declarados nos manifests', icon: ServerCog },
      { path: '/performance', label: 'Performance', hint: 'CPU, memória e restarts no tempo', icon: Activity },
    ],
  },
  {
    label: 'Ferramentas',
    items: [
      { path: '/conversores', label: 'Conversores', hint: 'JWT, base64, URL, timestamp, UUID, cron', icon: Wrench },
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
