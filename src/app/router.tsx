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
          { index: true, element: <Navigate to="/cluster" replace /> },
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
          { path: 'performance', element: page(() => import('@/features/performance/PerformancePage')) },
          { path: 'conversores', element: page(() => import('@/features/tools/ToolsPage')) },
          { path: 'servicos', element: page(() => import('@/features/local/LocalPage')) },
          { path: 'agenda', element: page(() => import('@/features/schedules/SchedulesPage')) },
          { path: 'gerador', element: page(() => import('@/features/gerador/GeradorPage')) },
          { path: 'catalogo', element: page(() => import('@/features/catalog/CatalogPage')) },
          { path: 'analise', element: page(() => import('@/features/analysis/AnalysisPage')) },
          { path: 'acervo', element: <Navigate to="/catalogo" replace /> },
          { path: 'configuracoes/:secao?', element: page(() => import('@/features/settings/SettingsPage')) },
          { path: '*', element: <Navigate to="/cluster" replace /> },
        ],
      },
    ],
  },
])
