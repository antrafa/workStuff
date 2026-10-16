import { lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router'
import { Layout } from './Layout'
import { RouteError } from './RouteError'

const page = (load: () => Promise<{ default: React.ComponentType }>) => {
  const Component = lazy(load)
  return <Component />
}

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        // Rota sem caminho só para o errorElement: o erro aparece dentro do layout, com o menu.
        errorElement: <RouteError />,
        children: [
          { index: true, element: page(() => import('@/features/dashboard/DashboardPage')) },
          { path: 'inicio', element: <Navigate to="/" replace /> },
          { path: 'documentacao/:slug?', element: page(() => import('@/features/manual/ManualPage')) },
          { path: 'dashboard', element: <Navigate to="/" replace /> },
          { path: 'maquina', element: page(() => import('@/features/doctor/DoctorPage')) },
          { path: 'perfil', element: page(() => import('@/features/profile/ProfilePage')) },
          { path: 'repositorios', element: page(() => import('@/features/repos/ReposPage')) },
          { path: 'pipelines', element: page(() => import('@/features/pipelines/PipelinesPage')) },
          { path: 'revisao', element: page(() => import('@/features/review/ReviewPage')) },
          { path: 'vulnerabilidades', element: page(() => import('@/features/vulns/VulnsPage')) },
          { path: 'gitlab', element: <Navigate to="/repositorios" replace /> },
          { path: 'cluster/:aba?', element: page(() => import('@/features/cluster/ClusterPage')) },
          { path: 'recursos', element: page(() => import('@/features/resources/ResourcesPage')) },
          { path: 'logs', element: page(() => import('@/features/logs/LogsPage')) },
          { path: 'incidente', element: page(() => import('@/features/incident/IncidentPage')) },
          { path: 'comparar', element: page(() => import('@/features/compare/ComparePage')) },
          { path: 'upgrade/:aba?', element: page(() => import('@/features/upgrade/UpgradePage')) },
          { path: 'runbooks', element: page(() => import('@/features/runbooks/RunbooksPage')) },
          { path: 'performance', element: page(() => import('@/features/performance/PerformancePage')) },
          { path: 'conversores', element: page(() => import('@/features/tools/ToolsPage')) },
          { path: 'requisicoes', element: page(() => import('@/features/http/HttpPage')) },
          { path: 'servicos', element: page(() => import('@/features/local/LocalPage')) },
          { path: 'agenda', element: page(() => import('@/features/schedules/SchedulesPage')) },
          { path: 'gerador', element: page(() => import('@/features/gerador/GeradorPage')) },
          { path: 'fabrica', element: page(() => import('@/features/factory/FactoryPage')) },
          { path: 'dev-runbooks', element: page(() => import('@/features/devRunbooks/DevRunbooksPage')) },
          { path: 'catalogo', element: page(() => import('@/features/catalog/CatalogPage')) },

          { path: 'analise', element: page(() => import('@/features/analysis/AnalysisPage')) },
          { path: 'playbooks', element: page(() => import('@/features/playbooks/PlaybooksPage')) },
          { path: 'acervo', element: <Navigate to="/catalogo" replace /> },
          { path: 'configuracoes/:secao?', element: page(() => import('@/features/settings/SettingsPage')) },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])
