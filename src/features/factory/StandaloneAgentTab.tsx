import { useState, useRef, useEffect } from 'react'
import {
  BookOpen, Bot, ClipboardList, Cpu, Eye, ExternalLink, FolderOpen, Play, ShieldAlert, Sparkles, Square, Terminal, Wrench
} from 'lucide-react'
import { Link } from 'react-router'
import { Markdown, Modal } from '@/ui'
import { DevRunbookDoc } from '../devRunbooks/DevRunbookDoc'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import type { SessionEvent } from './factoryRun'
import type { SpecializedAgentId } from '../../../server/lib/factory/types.ts'

const AGENT_CARDS: Array<{
  id: SpecializedAgentId
  name: string
  role: string
  icon: typeof Bot
  placeholder: string
  // when: em que momento do trabalho do agente o runbook ajuda (aparece como dica no botão)
  runbooks: Array<{ title: string; file: string; when: string }>
}> = [
  {
    id: 'analyst',
    name: 'Analyst',
    role: 'Transforma a demanda em critérios de aceite verificáveis e aponta as dúvidas que só você responde',
    icon: ClipboardList,
    placeholder: 'Ex.: Especifique a demanda "permitir exportar o relatório de pedidos em CSV": critérios de aceite, fora de escopo e dúvidas de negócio...',
    runbooks: [
      { title: 'Pre-flight do repositório', file: 'factory/agentes-preflight.md', when: 'Antes de delegar: repo limpo, base atualizada, build verde' },
    ],
  },
  {
    id: 'architect',
    name: 'Architect',
    role: 'Análise de requisitos, arquitetura de software, mapeamento de riscos e planejamento técnico',
    icon: Sparkles,
    placeholder: 'Ex.: Analise a arquitetura do módulo de autenticação e elabore um plano para suportar autenticação OAuth2 sem quebrar clientes legados...',
    runbooks: [
      { title: 'Pre-flight do repositório', file: 'factory/agentes-preflight.md', when: 'Antes de delegar: repo limpo, base atualizada, build verde' },
      { title: 'Mapa de arquitetura e dependências', file: 'factory/analise-dependencias.md', when: 'Antes de planejar: o que o projeto usa e o que mudou' },
    ],
  },
  {
    id: 'implementer',
    name: 'Implementer',
    role: 'Propõe a implementação ou refatoração em texto, sem alterar a pasta do projeto',
    icon: Wrench,
    placeholder: 'Ex.: Adicione tratamento de retry com backoff exponencial no cliente HTTP da pasta src/lib/api...',
    runbooks: [
      { title: 'Worktree isolada', file: 'factory/isolamento-worktree.md', when: 'Reproduzir a tarefa à mão sem mexer no seu checkout' },
      { title: 'Atualizar branch com a base', file: 'factory/sincronizar-branch.md', when: 'A base andou enquanto o agente trabalhava' },
      { title: 'Conflitos de rebase', file: 'factory/rebase-conflitos.md', when: 'O rebase parou com conflito' },
      { title: 'Reverter alteração fora do escopo', file: 'factory/reverter-fora-escopo.md', when: 'O agente mexeu em arquivo que não devia' },
    ],
  },
  {
    id: 'tester',
    name: 'Tester',
    role: 'Identifica cenários de teste e propõe os testes automatizados, sem alterar a pasta do projeto',
    icon: Terminal,
    placeholder: 'Ex.: Crie testes unitários para a rota de upload cobrindo arquivos vazios, formatos inválidos e sucesso...',
    runbooks: [
      { title: 'Portões de aceitação', file: 'factory/portoes-aceitacao.md', when: 'Conferir à mão os mesmos portões que a esteira aplica' },
      { title: 'Portão de testes reprovado', file: 'factory/testes-isolados.md', when: 'Reproduzir e isolar a falha de teste na worktree' },
    ],
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    role: 'Revisão de código em busca de bugs, regressões, desvio de convenções e de critérios de aceite',
    icon: Eye,
    placeholder: 'Ex.: Revise os arquivos da pasta src/auth em busca de falhas de segurança, vazamento de tokens e problemas de concorrência...',
    runbooks: [
      { title: 'Inspecionar a entrega', file: 'factory/inspecionar-entrega.md', when: 'Antes de aprovar: o que o agente realmente mudou' },
      { title: 'Publicar a branch para MR', file: 'factory/publicar-mr.md', when: 'Enviar a branch ao remoto para abrir o MR' },
      { title: 'Merge local falhou', file: 'factory/merge-local-falhou.md', when: 'A aprovação com merge local deu erro' },
    ],
  },
  {
    id: 'security',
    name: 'Security',
    role: 'Auditoria de segurança: injeção, autorização, segredos, dado sensível em log e dependências vulneráveis',
    icon: ShieldAlert,
    placeholder: 'Ex.: Audite a pasta src/upload em busca de path traversal, validação ausente e segredos no código...',
    runbooks: [
      { title: 'Auditoria de segurança', file: 'factory/auditoria-seguranca.md', when: 'Segredo, arquivo indevido ou dependência vulnerável no diff' },
    ],
  },
  {
    id: 'documenter',
    name: 'Documenter',
    role: 'Propõe a atualização da documentação e redige a descrição de MR, sem alterar a pasta do projeto',
    icon: BookOpen,
    placeholder: 'Ex.: Com base nas mudanças da branch atual, proponha a atualização do README e a descrição do MR...',
    runbooks: [
      { title: 'Publicar a branch para MR', file: 'factory/publicar-mr.md', when: 'Enviar a branch ao remoto para abrir o MR' },
    ],
  }
]

export function StandaloneAgentTab() {
  const [selectedAgent, setSelectedAgent] = useState<SpecializedAgentId>('architect')
  const [repoPath, setRepoPath] = useState('')
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<'claude' | 'codex' | 'agy'>('agy')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [openRunbook, setOpenRunbook] = useState<{ title: string; file: string } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    api.get<{ provider?: 'claude' | 'codex' | 'agy' }>('/factory/settings')
      .then(res => {
        if (res?.provider) setProvider(res.provider)
      })
      .catch(() => {})
    // Leaving the tab ends the run: this stream owns the CLI process (unlike pipeline runs)
    return () => abortRef.current?.abort()
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
        (ev: SessionEvent) => {
          if (ev.type === 'text') setOutput(prev => prev + (ev.text ?? ''))
          if (ev.type === 'error') setError(ev.message ?? 'Falha na execução do agente.')
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
                  borderColor: isSelected ? 'var(--signal-line)' : undefined,
                  background: isSelected ? 'var(--signal-soft)' : undefined,
                  padding: 14,
                }}
                onClick={() => setSelectedAgent(agent.id)}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="row" style={{ gap: 6, fontWeight: 600 }}>
                    <Icon size={16} style={{ color: isSelected ? 'var(--signal)' : 'var(--muted)' }} />
                    {agent.name}
                  </span>
                  {isSelected && <span style={{ color: 'var(--signal)' }}>✓</span>}
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

        {error && (
          <div className="callout callout-crit">{error}</div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          {running ? (
            <button type="button" className="btn btn-danger" onClick={handleStop}>
              <Square size={14} /> Interromper
            </button>
          ) : (
            <button type="submit" className="btn btn-primary">
              <Play size={14} /> Executar {activeMeta.name}
            </button>
          )}
        </div>
      </form>

      {/* Runbooks do agente: rodam aqui mesmo, na pasta do repositório alvo */}
      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="row" style={{ gap: 6, alignItems: 'center', fontWeight: 600 }}>
            <BookOpen size={15} style={{ color: 'var(--signal)' }} /> Runbooks do {activeMeta.name}
          </span>
          <Link to="/dev-runbooks" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
            Todos os runbooks <ExternalLink size={11} />
          </Link>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {repoPath
            ? <>Os comandos rodam em <b className="mono">{repoPath}</b>. Leitura roda direto; o que altera o repositório pede confirmação.</>
            : 'Escolha o repositório alvo acima para os comandos já abrirem apontando para ele.'}
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
          {activeMeta.runbooks.map(rb => (
            <button
              key={rb.file}
              type="button"
              className="btn"
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, height: 'auto', padding: '8px 10px', textAlign: 'left' }}
              onClick={() => setOpenRunbook(rb)}
            >
              <span style={{ fontWeight: 600, fontSize: 12.5 }}>{rb.title}</span>
              <span className="muted" style={{ fontSize: 11.5, whiteSpace: 'normal' }}>{rb.when}</span>
            </button>
          ))}
        </div>
      </section>

      {openRunbook && (
        <Modal title={openRunbook.title} onClose={() => setOpenRunbook(null)} width={900}>
          <DevRunbookDoc file={openRunbook.file} initialValues={repoPath ? { projeto: repoPath } : {}} />
        </Modal>
      )}

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
