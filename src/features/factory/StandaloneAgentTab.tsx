import { useState, useRef, useEffect } from 'react'
import {
  BookOpen, Bot, Cpu, FolderOpen, Play, ShieldAlert, Sparkles, Square, Terminal, Wrench
} from 'lucide-react'
import { Link } from 'react-router'
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
  runbookTitle: string
  runbookFile: string
}> = [
  {
    id: 'architect',
    name: 'Architect',
    role: 'Análise de requisitos, arquitetura de software, mapeamento de riscos e planejamento técnico',
    icon: Sparkles,
    placeholder: 'Ex.: Analise a arquitetura do módulo de autenticação e elabore um plano para suportar autenticação OAuth2 sem quebrar clientes legados...',
    runbookTitle: 'Pre-flight Check do Repositório',
    runbookFile: 'factory/agentes-preflight.md',
  },
  {
    id: 'implementer',
    name: 'Implementer',
    role: 'Implementação de código e refatoração na pasta do projeto',
    icon: Wrench,
    placeholder: 'Ex.: Adicione tratamento de retry com backoff exponencial no cliente HTTP da pasta src/lib/api...',
    runbookTitle: 'Sincronização e Rebase de Branch',
    runbookFile: 'factory/sincronizar-branch.md',
  },
  {
    id: 'tester',
    name: 'Tester',
    role: 'Identificação de cenários de teste, escrita de testes automatizados e validação de QA',
    icon: Terminal,
    placeholder: 'Ex.: Crie testes unitários para a rota de upload cobrindo arquivos vazios, formatos inválidos e sucesso...',
    runbookTitle: 'Validação Manual de Portões de Aceitação',
    runbookFile: 'factory/portoes-aceitacao.md',
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    role: 'Revisão de código em busca de bugs, problemas de segurança e inconsistências',
    icon: ShieldAlert,
    placeholder: 'Ex.: Revise os arquivos da pasta src/auth em busca de falhas de segurança, vazamento de tokens e problemas de concorrência...',
    runbookTitle: 'Auditoria de Segurança e Verificação Pré-MR',
    runbookFile: 'factory/auditoria-seguranca.md',
  },
]

export function StandaloneAgentTab() {
  const [selectedAgent, setSelectedAgent] = useState<SpecializedAgentId>('architect')
  const [repoPath, setRepoPath] = useState('')
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<'claude' | 'codex' | 'agy'>('agy')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    api.get<{ provider?: 'claude' | 'codex' | 'agy' }>('/factory/settings')
      .then(res => {
        if (res?.provider) setProvider(res.provider)
      })
      .catch(() => {})
  }, [])

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
          provider,
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
      <form onSubmit={handleRun} className="card card-pad stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <label className="stack" style={{ gap: 4, flex: 2 }}>
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

          <label className="stack" style={{ gap: 4, flex: 1 }}>
            <span className="eyebrow row" style={{ gap: 4 }}>
              <Cpu size={12} /> Provedor de IA
            </span>
            <select
              className="input"
              value={provider}
              onChange={e => setProvider(e.target.value as any)}
            >
              <option value="agy">Antigravity (AGY)</option>
              <option value="codex">Codex</option>
              <option value="claude">Claude Code</option>
            </select>
          </label>
        </div>

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

        {activeMeta.runbookTitle && (
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius)', fontSize: 12 }}>
            <span className="row" style={{ gap: 6, color: 'var(--muted)', alignItems: 'center' }}>
              <BookOpen size={14} style={{ color: 'var(--accent)' }} />
              <span>Procedimento operacional sugerido: <b>{activeMeta.runbookTitle}</b></span>
            </span>
            <Link to="/dev-runbooks" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
              Abrir nos Runbooks →
            </Link>
          </div>
        )}

        {error && (
          <div className="card card-pad" style={{ background: 'var(--red-subtle)', borderColor: 'var(--red-line)' }}>
            <span style={{ color: 'var(--red)' }}>{error}</span>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          {running ? (
            <button type="button" className="btn" onClick={handleStop} style={{ borderColor: 'var(--red)' }}>
              <Square size={14} style={{ color: 'var(--red)' }} /> Interromper
            </button>
          ) : (
            <button type="submit" className="btn btn-primary">
              <Play size={14} /> Executar {activeMeta.name}
            </button>
          )}
        </div>
      </form>

      {/* Terminal de Saída do Agente */}
      {output && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="eyebrow">Resposta do {activeMeta.name}</span>
            {running && <span className="muted" style={{ fontSize: 12 }}>Processando com IA...</span>}
          </div>
          <div
            className="card card-pad"
            style={{
              maxHeight: 500,
              overflowY: 'auto',
              background: 'var(--surface)',
              lineHeight: 1.5,
            }}
          >
            <Markdown>{output}</Markdown>
          </div>
        </div>
      )}
    </div>
  )
}
