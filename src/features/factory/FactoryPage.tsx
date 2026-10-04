import { useState, useEffect } from 'react'
import {
  Bot, Boxes, Factory, Plus, RefreshCw
} from 'lucide-react'
import { Page, Async, Empty } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'
import { FactoryBoard } from './FactoryBoard'
import { NewTaskModal } from './NewTaskModal'
import { TaskReviewDrawer } from './TaskReviewDrawer'
import { StandaloneAgentTab } from './StandaloneAgentTab'

export default function FactoryPage() {
  const [activeTab, setActiveTab] = useState<'board' | 'agents'>('board')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<FactoryTask | null>(null)

  const tasksLoader = useAsync(() => api.get<FactoryTask[]>('/factory/tasks'))

  // Atualização periódica leve a cada 8 segundos se houver tarefa rodando
  useEffect(() => {
    const hasActive = tasksLoader.data?.some(t => t.state === 'planning' || t.state === 'building' || t.state === 'qa_security')
    if (!hasActive) return

    const interval = setInterval(() => {
      tasksLoader.reload()
    }, 8000)

    return () => clearInterval(interval)
  }, [tasksLoader.data])

  const tasks = tasksLoader.data ?? []
  const activeCount = tasks.filter(t => t.state !== 'done' && t.state !== 'canceled').length
  const reviewCount = tasks.filter(t => t.state === 'review' || t.state === 'waiting_approval').length
  const doneCount = tasks.filter(t => t.state === 'done').length

  const handleSelectTask = (task: FactoryTask) => {
    setSelectedTask(task)
  }

  const handleRefresh = () => {
    tasksLoader.reload()
    if (selectedTask) {
      api.get<FactoryTask>(`/factory/tasks/${selectedTask.id}`)
        .then(setSelectedTask)
        .catch(() => setSelectedTask(null))
    }
  }

  return (
    <Page
      title="Fábrica de Software"
      hint="Desenvolvimento orientado a agentes com isolamento estrito via Git Worktrees. Puxe issues ou crie demandas para os agentes Architect, Implementer, Tester e Reviewer."
      actions={
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={handleRefresh} title="Atualizar tarefas">
            <RefreshCw size={14} /> Atualizar
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setModalOpen(true)}>
            <Plus size={15} /> Nova Tarefa
          </button>
        </div>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        {/* Badges de Resumo e Sub-navegação */}
        <div className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'board' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTab('board')}
            >
              <Boxes size={14} /> Esteira da Fábrica ({tasks.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'agents' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTab('agents')}
            >
              <Bot size={14} /> Agentes Especializados
            </button>
          </div>

          <div className="row" style={{ gap: 12, fontSize: 12, color: 'var(--muted)' }}>
            <span>Em andamento: <b>{activeCount}</b></span>
            <span>·</span>
            <span>Aguardando você: <b style={{ color: reviewCount > 0 ? 'var(--accent)' : undefined }}>{reviewCount}</b></span>
            <span>·</span>
            <span>Concluídas: <b style={{ color: 'var(--green)' }}>{doneCount}</b></span>
          </div>
        </div>

        {/* Conteúdo da Aba Ativa */}
        {activeTab === 'board' ? (
          <Async state={tasksLoader}>
            {loadedTasks => (
              loadedTasks.length === 0 ? (
                <Empty
                  icon={Factory}
                  title="Nenhuma tarefa na esteira"
                >
                  <p className="muted" style={{ maxWidth: 440, margin: '8px auto 16px' }}>
                    Adicione uma demanda manual ou importe uma issue aberta do seu GitLab ou GitHub para iniciar a esteira com os agentes.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
                    <Plus size={15} /> Adicionar Primeira Tarefa
                  </button>
                </Empty>
              ) : (
                <FactoryBoard
                  tasks={loadedTasks}
                  onSelectTask={handleSelectTask}
                  onUpdate={handleRefresh}
                />
              )
            )}
          </Async>
        ) : (
          <StandaloneAgentTab />
        )}

        {/* Modal de Criação */}
        <NewTaskModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={handleRefresh}
        />

        {/* Gaveta de Revisão / Aprovação */}
        <TaskReviewDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleRefresh}
        />
      </div>
    </Page>
  )
}
