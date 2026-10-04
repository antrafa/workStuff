import { useState, useRef } from 'react'
import {
  Bot, FolderOpen, Play, ShieldAlert, Sparkles, Square, Terminal, Wrench
} from 'lucide-react'
import { Markdown } from '@/ui'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import type { SpecializedAgentId } from '../../../server/lib/factory/types.ts'

const AGENT_CARDS: Array<{
  id: SpecializedAgentId
  name: string
  role: string
  icon: typeof Bot
  placeholder: string
}> = [
  {
    id: 'architect',
    name: 'Architect',
    role: 'Análise de requisitos, arquitetura de software, mapeamento de riscos e planejamento técnico',
    icon: Sparkles,
    placeholder: 'Ex.: Analise a arquitetura do módulo de autenticação e elabore um plano para suportar autenticação OAuth2 sem quebrar clientes legados...',
  },
  {
    id: 'implementer',
    name: 'Implementer',
    role: 'Implementação de código e refatoração na pasta do projeto',
    icon: Wrench,
    placeholder: 'Ex.: Adicione tratamento de retry com backoff exponencial no cliente HTTP da pasta src/lib/api...',
  },
  {
    id: 'tester',
    name: 'Tester',
    role: 'Identificação de cenários de teste, escrita de testes automatizados e validação de QA',
    icon: Terminal,
    placeholder: 'Ex.: Crie testes unitários para a rota de upload cobrindo arquivos vazios, formatos inválidos e sucesso...',
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    role: 'Revisão de código em busca de bugs, problemas de segurança e inconsistências',
    icon: ShieldAlert,
    placeholder: 'Ex.: Revise os arquivos da pasta src/auth em busca de falhas de segurança, vazamento de tokens e problemas de concorrência...',
  },
]

export function StandaloneAgentTab() {
  const [selectedAgent, setSelectedAgent] = useState<SpecializedAgentId>('architect')
  const [repoPath, setRepoPath] = useState('')
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const activeMeta = AGENT_CARDS.find(a => a.id === selectedAgent)!

  const pickFolder = async () => {
    try {
      const res = await api.post<{ path: string | null }>('/factory/pick-folder')
      if (res.path) setRepoPath(res.path)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!repoPath.trim() || !prompt.trim()) {
      setError('Informe o repositório e o comando do agente.')
      return
    }

    setRunning(true)
    setError(null)
    setOutput('')
    abortRef.current = new AbortController()

    try {
      await streamPost(
        '/factory/agents/run',
        (ev: any) => {
          if (ev.type === 'text') setOutput(prev => prev + ev.text)
          if (ev.type === 'error') setError(ev.message)
        },
        abortRef.current.signal,
        {
          agentId: selectedAgent,
          repoPath,
          prompt,
        }
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Seleção do Agente Especializado */}
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Escolha o Agente Especializado</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {AGENT_CARDS.map(agent => {
            const Icon = agent.icon
            const isSelected = selectedAgent === agent.id
            return (
              <div
                key={agent.id}
                className="card card-pad stack"
                style={{
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--accent)' : undefined,
                  background: isSelected ? 'var(--surface-active)' : undefined,
                  padding: 14,
                }}
                onClick={() => setSelectedAgent(agent.id)}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="row" style={{ gap: 6, fontWeight: 600 }}>
                    <Icon size={16} style={{ color: isSelected ? 'var(--accent)' : 'var(--muted)' }} />
                    {agent.name}
                  </span>
                  {isSelected && <span style={{ color: 'var(--accent)' }}>✓</span>}
                </div>
                <span className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                  {agent.role}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Formulário de Execução */}
      <form onSubmit={handleRun} className="card card-pad stack">
        <label className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">Repositório Alvo</span>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="/caminho/do/projeto"
              value={repoPath}
              onChange={e => setRepoPath(e.target.value)}
              required
            />
            <button type="button" className="btn" onClick={pickFolder}>
              <FolderOpen size={16} /> Escolher
            </button>
          </div>
        </label>

        <label className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">Instrução para o {activeMeta.name}</span>
          <textarea
            className="input"
            rows={4}
            placeholder={activeMeta.placeholder}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            required
          />
        </label>

        {error && (
          <div className="card card-pad" style={{ background: 'var(--red-subtle)', borderColor: 'var(--red-line)' }}>
            <span style={{ color: 'var(--red)' }}>{error}</span>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          {running ? (
            <button type="button" className="btn" onClick={handleStop}>
              <Square size={14} /> Parar Execução
            </button>
          ) : (
            <button type="submit" className="btn btn-primary">
              <Play size={15} /> Executar {activeMeta.name}
            </button>
          )}
        </div>
      </form>

      {/* Saída em Streaming */}
      {output && (
        <div className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
            <span className="eyebrow">Resposta do {activeMeta.name}</span>
            {running && <span className="mono muted" style={{ fontSize: 12 }}>Processando streaming...</span>}
          </div>
          <div style={{ maxHeight: 500, overflowY: 'auto', paddingTop: 8 }}>
            <Markdown>{output}</Markdown>
          </div>
        </div>
      )}
    </div>
  )
}
