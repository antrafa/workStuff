import { useState, useEffect } from 'react'
import {
  Compass,
  Factory,
  Plus,
  RefreshCw,
  Terminal,
} from 'lucide-react'
import { Link } from 'react-router'
import { Page, Async, Empty, Segmented } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import type { FactoryTask } from '../../../server/lib/factory/types.ts'
import { FactoryBoard } from './FactoryBoard'
import { NewTaskModal } from './NewTaskModal'
import { TaskReviewDrawer } from './TaskReviewDrawer'
import { StandaloneAgentTab } from './StandaloneAgentTab'
import { FactoryTraceVisualizer } from './timeline/FactoryTraceVisualizer'
import { isTaskRunning, WAITING_STATES } from './factoryRun'
import { FactoryWizard, WIZARD_SEEN_KEY } from './FactoryWizard'
import { tx } from '@/lib/i18n'

function wizardSeen(): boolean {
  try {
    return localStorage.getItem(WIZARD_SEEN_KEY) === '1'
  } catch {
    return true
  }
}

export default function FactoryPage() {
  const [activeTab, setActiveTab] = useState<'board' | 'agents'>('board')
  const [modalOpen, setModalOpen] = useState(false)
  // The drawer reads the task from the polled list by id, so it never shows a stale copy
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [visualizerTask, setVisualizerTask] = useState<FactoryTask | null>(null)

  const tasksLoader = useAsync(() => api.get<FactoryTask[]>('/factory/tasks'))
  const [wizardOpen, setWizardOpen] = useState(false)
  // First visit with an empty pipeline: start guided
  useEffect(() => {
    if (tasksLoader.data?.length === 0 && !wizardSeen()) setWizardOpen(true)
  }, [tasksLoader.data])

  // The board refreshes itself while something runs; the trace visualizer polls its own task
  const hasActive = Boolean(tasksLoader.data?.some(isTaskRunning))
  useEffect(() => {
    if (!hasActive) return
    const interval = setInterval(tasksLoader.reload, 2500)
    return () => clearInterval(interval)
  }, [hasActive])

  const tasks = tasksLoader.data ?? []
  const selectedTask = tasks.find(t => t.id === selectedId) ?? null
  const activeCount = tasks.filter(isTaskRunning).length
  const reviewCount = tasks.filter(t => WAITING_STATES.includes(t.state)).length
  const doneCount = tasks.filter(t => t.state === 'done').length

  const handleSelectTask = (task: FactoryTask) => {
    setSelectedId(task.id)
  }

  const handleOpenTrace = (task: FactoryTask) => {
    setVisualizerTask(task)
  }

  const handleRefresh = () => tasksLoader.reload()

  return (
    <Page
      title={tx({ en: 'Software Factory', pt: 'Fábrica de Software' })}
      hint={tx({
        en: 'Multi-agent development with a visual timeline, strict isolation in Git worktrees and mechanical acceptance gates.',
        pt: 'Desenvolvimento com múltiplos agentes, rastreamento visual em linha do tempo, isolamento estrito via Git Worktrees e portões mecânicos de aceitação.',
      })}
      actions={
        <div className="row" style={{ gap: 8 }}>
          <Link to="/dev-runbooks?file=factory%2Fworktrees-limpeza.md" className="btn btn-sm" title={tx({ en: 'Open the development and factory runbooks', pt: 'Abrir Runbooks de Desenvolvimento e Fábrica' })}>
            <Terminal size={14} /> {tx({ en: 'Factory runbooks', pt: 'Runbooks da Fábrica' })}
          </Link>
          <button type="button" className="btn btn-sm" onClick={handleRefresh} title={tx({ en: 'Refresh tasks', pt: 'Atualizar tarefas' })}>
            <RefreshCw size={14} /> {tx({ en: 'Refresh', pt: 'Atualizar' })}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setWizardOpen(true)} title={tx({ en: 'Step by step: prerequisites, repository, request and cost', pt: 'Passo a passo: pré-requisitos, repositório, demanda e custo' })}>
            <Compass size={14} /> {tx({ en: 'Guided mode', pt: 'Modo guiado' })}
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setModalOpen(true)}>
            <Plus size={15} /> {tx({ en: 'New task', pt: 'Nova Tarefa' })}
          </button>
        </div>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        {/* Detailed trace visualizer if a task is inspected */}
        {visualizerTask ? (
          <FactoryTraceVisualizer
            // A new task (from the wizard) remounts it: its live state belongs to one task
            key={visualizerTask.id}
            task={visualizerTask}
            onBack={() => setVisualizerTask(null)}
            onOpenReview={t => {
              setVisualizerTask(null)
              setSelectedId(t.id)
            }}
            onUpdate={handleRefresh}
          />
        ) : (
          <>
            {/* Header summary and tabs */}
            <div className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
              <Segmented
                options={[
                  { id: 'board', label: tx({ en: `Board (${tasks.length})`, pt: `Quadro (${tasks.length})` }) },
                  { id: 'agents', label: tx({ en: 'Specialized agents', pt: 'Agentes Especializados' }) },
                ]}
                value={activeTab}
                onChange={setActiveTab}
              />

              <div className="row" style={{ gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                <span>{tx({ en: 'Running', pt: 'Em andamento' })}: <b>{activeCount}</b></span>
                <span>·</span>
                <span>{tx({ en: 'Waiting for you', pt: 'Aguardando você' })}: <b style={{ color: reviewCount > 0 ? 'var(--signal)' : undefined }}>{reviewCount}</b></span>
                <span>·</span>
                <span>{tx({ en: 'Done', pt: 'Concluídas' })}: <b style={{ color: 'var(--ok)' }}>{doneCount}</b></span>
              </div>
            </div>

            {activeTab === 'board' && (
              <Async state={tasksLoader}>
                {loadedTasks => (
                  loadedTasks.length === 0 ? (
                    <Empty
                      icon={Factory}
                      title={tx({ en: 'No task in the pipeline', pt: 'Nenhuma tarefa na esteira' })}
                    >
                      <p className="muted" style={{ maxWidth: 440, margin: '8px auto 16px' }}>
                        {tx({
                          en: 'Add a request by hand or import an open issue from your GitLab or GitHub to start the pipeline with the agents.',
                          pt: 'Adicione uma demanda manual ou importe uma issue aberta do seu GitLab ou GitHub para iniciar a esteira com os agentes.',
                        })}
                      </p>
                      <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
                        <Plus size={15} /> {tx({ en: 'Add the first task', pt: 'Adicionar Primeira Tarefa' })}
                      </button>
                    </Empty>
                  ) : (
                    <FactoryBoard
                      tasks={loadedTasks}
                      onOpenTrace={handleOpenTrace}
                      onOpenReview={handleSelectTask}
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

        {wizardOpen && (
          <FactoryWizard
            onClose={() => {
              try {
                localStorage.setItem(WIZARD_SEEN_KEY, '1')
              } catch {
                // private window: it opens again next visit
              }
              setWizardOpen(false)
            }}
            onStarted={task => {
              setWizardOpen(false)
              handleRefresh()
              setVisualizerTask(task)
            }}
          />
        )}

        {/* New task modal */}
        <NewTaskModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={handleRefresh}
        />

        {/* Task review drawer */}
        <TaskReviewDrawer
          key={selectedTask?.id}
          task={selectedTask}
          onClose={() => setSelectedId(null)}
          onUpdate={handleRefresh}
        />
      </div>
    </Page>
  )
}
