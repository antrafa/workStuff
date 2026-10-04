import { useState, useEffect } from 'react'
import {
  Activity,
  Bot,
  Boxes,
  Factory,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { Page, Async, Empty } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'
import { FactoryBoard } from './FactoryBoard'
import { NewTaskModal } from './NewTaskModal'
import { TaskReviewDrawer } from './TaskReviewDrawer'
import { StandaloneAgentTab } from './StandaloneAgentTab'
import { FactoryTimelineGrid } from './timeline/FactoryTimelineGrid'
import { FactoryTraceVisualizer } from './timeline/FactoryTraceVisualizer'

export default function FactoryPage() {
  const [activeTab, setActiveTab] = useState<'timeline' | 'board' | 'agents'>('timeline')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<FactoryTask | null>(null)
  const [visualizerTask, setVisualizerTask] = useState<FactoryTask | null>(null)

  const tasksLoader = useAsync(() => api.get<FactoryTask[]>('/factory/tasks'))

  // Periodic light refresh every 6 seconds when tasks are running
  useEffect(() => {
    const hasActive = tasksLoader.data?.some(
      t => t.state === 'planning' || t.state === 'building' || t.state === 'qa_security'
    )
    if (!hasActive) return

    const interval = setInterval(() => {
      tasksLoader.reload()
      if (visualizerTask) {
        api.get<FactoryTask>(`/factory/tasks/${visualizerTask.id}`)
          .then(setVisualizerTask)
          .catch(() => {})
      }
    }, 6000)

    return () => clearInterval(interval)
  }, [tasksLoader.data, visualizerTask])

  const tasks = tasksLoader.data ?? []
  const activeCount = tasks.filter(t => t.state !== 'done' && t.state !== 'canceled').length
  const reviewCount = tasks.filter(t => t.state === 'review' || t.state === 'waiting_approval').length
  const doneCount = tasks.filter(t => t.state === 'done').length

  const handleSelectTask = (task: FactoryTask) => {
    setSelectedTask(task)
  }

  const handleOpenTrace = (task: FactoryTask) => {
    setVisualizerTask(task)
  }

  const handleDeleteTask = async (task: FactoryTask) => {
    if (!confirm(`Deseja excluir a tarefa "${task.title}" e limpar o ambiente?`)) return
    try {
      await api.delete(`/factory/tasks/${task.id}`)
      handleRefresh()
      if (visualizerTask?.id === task.id) setVisualizerTask(null)
      if (selectedTask?.id === task.id) setSelectedTask(null)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const handleRefresh = () => {
    tasksLoader.reload()
    if (selectedTask) {
      api.get<FactoryTask>(`/factory/tasks/${selectedTask.id}`)
        .then(setSelectedTask)
        .catch(() => setSelectedTask(null))
    }
    if (visualizerTask) {
      api.get<FactoryTask>(`/factory/tasks/${visualizerTask.id}`)
        .then(setVisualizerTask)
        .catch(() => setVisualizerTask(null))
    }
  }

  return (
    <Page
      title="Fábrica de Software"
      hint="Desenvolvimento com múltiplos agentes, rastreamento visual em linha do tempo, isolamento estrito via Git Worktrees e portões mecânicos de aceitação."
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
        {/* Detailed trace visualizer if a task is inspected */}
        {visualizerTask ? (
          <FactoryTraceVisualizer
            task={visualizerTask}
            onBack={() => setVisualizerTask(null)}
            onUpdate={handleRefresh}
          />
        ) : (
          <>
            {/* Header summary and tabs */}
            <div className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${activeTab === 'timeline' ? 'btn-primary' : ''}`}
                  onClick={() => setActiveTab('timeline')}
                >
                  <Activity size={14} /> Linha do Tempo ({tasks.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${activeTab === 'board' ? 'btn-primary' : ''}`}
                  onClick={() => setActiveTab('board')}
                >
                  <Boxes size={14} /> Quadro Kanban
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

            {/* Active tab content */}
            {activeTab === 'timeline' && (
              <Async state={tasksLoader}>
                {loadedTasks => (
                  <FactoryTimelineGrid
                    tasks={loadedTasks}
                    onOpenTrace={handleOpenTrace}
                    onDelete={handleDeleteTask}
                  />
                )}
              </Async>
            )}

            {activeTab === 'board' && (
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
            )}

            {activeTab === 'agents' && (
              <StandaloneAgentTab />
            )}
          </>
        )}

        {/* New task modal */}
        <NewTaskModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={handleRefresh}
        />

        {/* Task review drawer */}
        <TaskReviewDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleRefresh}
        />
      </div>
    </Page>
  )
}
