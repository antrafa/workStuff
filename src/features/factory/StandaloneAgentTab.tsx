import { useState, useRef, useEffect } from 'react'
import {
  BookOpen, Bot, ClipboardList, Cpu, Eye, ExternalLink, FolderOpen, ListTree, Play, ShieldAlert, Sparkles, Square, Swords, Terminal, Wrench
} from 'lucide-react'
import { Link } from 'react-router'
import { Markdown, Modal } from '@/ui'
import { DevRunbookDoc } from '../devRunbooks/DevRunbookDoc'
import { api } from '@/lib/api'
import { streamPost } from '@/lib/stream'
import type { SessionEvent } from './factoryRun'
import type { SpecializedAgentId } from '../../../server/lib/factory/types.ts'
import { tx } from '@/lib/i18n'

// The two ideation agents that stand on their own, outside an idea (see /factory/agents/run)
type StandaloneAgentId = SpecializedAgentId | 'red' | 'planner'

const AGENT_CARDS: Array<{
  id: StandaloneAgentId
  name: string
  role: string
  icon: typeof Bot
  placeholder: string
  // when: at which point of the agent's work the runbook helps (shown as the button hint)
  runbooks: Array<{ title: string; file: string; when: string }>
}> = [
  {
    id: 'analyst',
    name: 'Analyst',
    role: tx({ en: 'Turns the request into verifiable acceptance criteria and points out the questions only you can answer', pt: 'Transforma a demanda em critérios de aceite verificáveis e aponta as dúvidas que só você responde' }),
    icon: ClipboardList,
    placeholder: tx({ en: 'e.g. Specify the request "allow exporting the orders report as CSV": acceptance criteria, out of scope and business questions...', pt: 'Ex.: Especifique a demanda "permitir exportar o relatório de pedidos em CSV": critérios de aceite, fora de escopo e dúvidas de negócio...' }),
    runbooks: [
      { title: tx({ en: 'Repository pre-flight', pt: 'Pre-flight do repositório' }), file: 'factory/agentes-preflight.md', when: tx({ en: 'Before delegating: clean repo, up-to-date base, green build', pt: 'Antes de delegar: repo limpo, base atualizada, build verde' }) },
    ],
  },
  {
    id: 'architect',
    name: 'Architect',
    role: tx({ en: 'Requirements analysis, software architecture, risk mapping and technical planning', pt: 'Análise de requisitos, arquitetura de software, mapeamento de riscos e planejamento técnico' }),
    icon: Sparkles,
    placeholder: tx({ en: 'e.g. Analyze the authentication module architecture and plan OAuth2 support without breaking legacy clients...', pt: 'Ex.: Analise a arquitetura do módulo de autenticação e elabore um plano para suportar autenticação OAuth2 sem quebrar clientes legados...' }),
    runbooks: [
      { title: tx({ en: 'Repository pre-flight', pt: 'Pre-flight do repositório' }), file: 'factory/agentes-preflight.md', when: tx({ en: 'Before delegating: clean repo, up-to-date base, green build', pt: 'Antes de delegar: repo limpo, base atualizada, build verde' }) },
      { title: tx({ en: 'Architecture and dependency map', pt: 'Mapa de arquitetura e dependências' }), file: 'factory/analise-dependencias.md', when: tx({ en: 'Before planning: what the project uses and what changed', pt: 'Antes de planejar: o que o projeto usa e o que mudou' }) },
    ],
  },
  {
    id: 'implementer',
    name: 'Implementer',
    role: tx({ en: 'Proposes the implementation or refactoring as text, without changing the project folder', pt: 'Propõe a implementação ou refatoração em texto, sem alterar a pasta do projeto' }),
    icon: Wrench,
    placeholder: tx({ en: 'e.g. Add retry with exponential backoff to the HTTP client in src/lib/api...', pt: 'Ex.: Adicione tratamento de retry com backoff exponencial no cliente HTTP da pasta src/lib/api...' }),
    runbooks: [
      { title: tx({ en: 'Isolated worktree', pt: 'Worktree isolada' }), file: 'factory/isolamento-worktree.md', when: tx({ en: 'Reproduce the task by hand without touching your checkout', pt: 'Reproduzir a tarefa à mão sem mexer no seu checkout' }) },
      { title: tx({ en: 'Update the branch with the base', pt: 'Atualizar branch com a base' }), file: 'factory/sincronizar-branch.md', when: tx({ en: 'The base moved while the agent worked', pt: 'A base andou enquanto o agente trabalhava' }) },
      { title: tx({ en: 'Rebase conflicts', pt: 'Conflitos de rebase' }), file: 'factory/rebase-conflitos.md', when: tx({ en: 'The rebase stopped on a conflict', pt: 'O rebase parou com conflito' }) },
      { title: tx({ en: 'Revert an out-of-scope change', pt: 'Reverter alteração fora do escopo' }), file: 'factory/reverter-fora-escopo.md', when: tx({ en: 'The agent touched a file it should not have', pt: 'O agente mexeu em arquivo que não devia' }) },
    ],
  },
  {
    id: 'tester',
    name: 'Tester',
    role: tx({ en: 'Finds test scenarios and proposes the automated tests, without changing the project folder', pt: 'Identifica cenários de teste e propõe os testes automatizados, sem alterar a pasta do projeto' }),
    icon: Terminal,
    placeholder: tx({ en: 'e.g. Write unit tests for the upload route covering empty files, invalid formats and success...', pt: 'Ex.: Crie testes unitários para a rota de upload cobrindo arquivos vazios, formatos inválidos e sucesso...' }),
    runbooks: [
      { title: tx({ en: 'Acceptance gates', pt: 'Portões de aceitação' }), file: 'factory/portoes-aceitacao.md', when: tx({ en: 'Check by hand the same gates the pipeline applies', pt: 'Conferir à mão os mesmos portões que a esteira aplica' }) },
      { title: tx({ en: 'Failed test gate', pt: 'Portão de testes reprovado' }), file: 'factory/testes-isolados.md', when: tx({ en: 'Reproduce and isolate the test failure in the worktree', pt: 'Reproduzir e isolar a falha de teste na worktree' }) },
    ],
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    role: tx({ en: 'Code review for bugs, regressions, convention drift and unmet acceptance criteria', pt: 'Revisão de código em busca de bugs, regressões, desvio de convenções e de critérios de aceite' }),
    icon: Eye,
    placeholder: tx({ en: 'e.g. Review the files in src/auth for security flaws, token leaks and concurrency issues...', pt: 'Ex.: Revise os arquivos da pasta src/auth em busca de falhas de segurança, vazamento de tokens e problemas de concorrência...' }),
    runbooks: [
      { title: tx({ en: 'Inspect the delivery', pt: 'Inspecionar a entrega' }), file: 'factory/inspecionar-entrega.md', when: tx({ en: 'Before approving: what the agent really changed', pt: 'Antes de aprovar: o que o agente realmente mudou' }) },
      { title: tx({ en: 'Publish the branch for an MR', pt: 'Publicar a branch para MR' }), file: 'factory/publicar-mr.md', when: tx({ en: 'Push the branch to the remote to open the MR', pt: 'Enviar a branch ao remoto para abrir o MR' }) },
      { title: tx({ en: 'Local merge failed', pt: 'Merge local falhou' }), file: 'factory/merge-local-falhou.md', when: tx({ en: 'Approving with a local merge failed', pt: 'A aprovação com merge local deu erro' }) },
    ],
  },
  {
    id: 'security',
    name: 'Security',
    role: tx({ en: 'Security audit: injection, authorization, secrets, sensitive data in logs and vulnerable dependencies', pt: 'Auditoria de segurança: injeção, autorização, segredos, dado sensível em log e dependências vulneráveis' }),
    icon: ShieldAlert,
    placeholder: tx({ en: 'e.g. Audit src/upload for path traversal, missing validation and secrets in the code...', pt: 'Ex.: Audite a pasta src/upload em busca de path traversal, validação ausente e segredos no código...' }),
    runbooks: [
      { title: tx({ en: 'Security audit', pt: 'Auditoria de segurança' }), file: 'factory/auditoria-seguranca.md', when: tx({ en: 'A secret, a stray file or a vulnerable dependency in the diff', pt: 'Segredo, arquivo indevido ou dependência vulnerável no diff' }) },
    ],
  },
  {
    id: 'documenter',
    name: 'Documenter',
    role: tx({ en: 'Proposes the documentation update and drafts the MR description, without changing the project folder', pt: 'Propõe a atualização da documentação e redige a descrição de MR, sem alterar a pasta do projeto' }),
    icon: BookOpen,
    placeholder: tx({ en: 'e.g. From the current branch changes, propose the README update and the MR description...', pt: 'Ex.: Com base nas mudanças da branch atual, proponha a atualização do README e a descrição do MR...' }),
    runbooks: [
      { title: tx({ en: 'Publish the branch for an MR', pt: 'Publicar a branch para MR' }), file: 'factory/publicar-mr.md', when: tx({ en: 'Push the branch to the remote to open the MR', pt: 'Enviar a branch ao remoto para abrir o MR' }) },
    ],
  },
  {
    id: 'red',
    name: 'Red team',
    role: tx({ en: 'Plays devil\'s advocate before you build: describe an idea and it points out where it can fail, what it hides in cost and what you are taking for granted', pt: 'Faz o advogado do diabo antes de você construir: descreva uma ideia e ele aponta onde ela pode falhar, que custo esconde e o que você está dando como certo' }),
    icon: Swords,
    placeholder: tx({ en: 'Describe the idea as you would to a colleague. e.g. I want customers to see their invoices in the portal instead of asking support by email. What could go wrong?', pt: 'Descreva a ideia como contaria a um colega. Ex.: Quero que o cliente veja as faturas no portal em vez de pedir ao suporte por e-mail. O que pode dar errado?' }),
    runbooks: [],
  },
  {
    id: 'planner',
    name: 'Planner',
    role: tx({ en: 'Turns an idea into a work plan: large steps in order, starting with the smallest version that already works, each with examples of how to check it is done', pt: 'Transforma uma ideia num plano de trabalho: etapas grandes, em ordem, começando pela menor versão que já funciona, cada uma com exemplos de como conferir que ficou pronta' }),
    icon: ListTree,
    placeholder: tx({ en: 'Say what you want built and what stays out for now. e.g. Customers download their invoices as PDF from the portal; downloading many at once can wait.', pt: 'Diga o que quer construir e o que fica de fora por enquanto. Ex.: O cliente baixa as faturas em PDF pelo portal; baixar várias de uma vez pode esperar.' }),
    runbooks: [],
  },
]

export function StandaloneAgentTab() {
  const [selectedAgent, setSelectedAgent] = useState<StandaloneAgentId>('architect')
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
      setError(tx({ en: 'Enter the repository and the instruction for the agent.', pt: 'Informe o repositório e o comando do agente.' }))
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
          if (ev.type === 'error') setError(ev.message ?? tx({ en: 'The agent run failed.', pt: 'Falha na execução do agente.' }))
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
      {/* Agent picker */}
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">{tx({ en: 'Choose the specialized agent', pt: 'Escolha o Agente Especializado' })}</span>
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

      {/* Run form */}
      <form onSubmit={handleRun} className="card card-pad stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <label className="stack" style={{ gap: 4, flex: 2 }}>
            <span className="eyebrow">{tx({ en: 'Target repository', pt: 'Repositório Alvo' })}</span>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder={tx({ en: '/path/to/the/project', pt: '/caminho/do/projeto' })}
                value={repoPath}
                onChange={e => setRepoPath(e.target.value)}
                required
              />
              <button type="button" className="btn" onClick={pickFolder}>
                <FolderOpen size={16} /> {tx({ en: 'Choose', pt: 'Escolher' })}
              </button>
            </div>
          </label>

          <label className="stack" style={{ gap: 4, flex: 1 }}>
            <span className="eyebrow row" style={{ gap: 4 }}>
              <Cpu size={12} /> {tx({ en: 'AI provider', pt: 'Provedor de IA' })}
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
          <span className="eyebrow">{tx({ en: `Instruction for the ${activeMeta.name}`, pt: `Instrução para o ${activeMeta.name}` })}</span>
          <textarea
            className="textarea"
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
              <Square size={14} /> {tx({ en: 'Stop', pt: 'Interromper' })}
            </button>
          ) : (
            <button type="submit" className="btn btn-primary">
              <Play size={14} /> {tx({ en: `Run ${activeMeta.name}`, pt: `Executar ${activeMeta.name}` })}
            </button>
          )}
        </div>
      </form>

      {/* The agent's runbooks: they run right here, in the target repository folder */}
      {activeMeta.runbooks.length > 0 && <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="row" style={{ gap: 6, alignItems: 'center', fontWeight: 600 }}>
            <BookOpen size={15} style={{ color: 'var(--signal)' }} /> {tx({ en: `${activeMeta.name} runbooks`, pt: `Runbooks do ${activeMeta.name}` })}
          </span>
          <Link to="/dev-runbooks" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
            {tx({ en: 'All runbooks', pt: 'Todos os runbooks' })} <ExternalLink size={11} />
          </Link>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {repoPath
            ? tx({
              en: <>The commands run in <b className="mono">{repoPath}</b>. Reads run right away; what changes the repository asks for confirmation.</>,
              pt: <>Os comandos rodam em <b className="mono">{repoPath}</b>. Leitura roda direto; o que altera o repositório pede confirmação.</>,
            })
            : tx({ en: 'Choose the target repository above so the commands open pointing at it.', pt: 'Escolha o repositório alvo acima para os comandos já abrirem apontando para ele.' })}
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
      </section>}

      {openRunbook && (
        <Modal title={openRunbook.title} onClose={() => setOpenRunbook(null)} width={900}>
          <DevRunbookDoc file={openRunbook.file} initialValues={repoPath ? { projeto: repoPath } : {}} />
        </Modal>
      )}

      {/* Agent output */}
      {output && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="eyebrow">{tx({ en: `${activeMeta.name} answer`, pt: `Resposta do ${activeMeta.name}` })}</span>
            {running && <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'Processing with AI...', pt: 'Processando com IA...' })}</span>}
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
