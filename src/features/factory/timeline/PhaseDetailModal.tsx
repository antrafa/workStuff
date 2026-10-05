import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Markdown, Modal } from '@/ui'
import type {
  BuildEnvelope,
  CriterionCheck,
  DocsEnvelope,
  ExecutionSpan,
  PlanEnvelope,
  ReviewEnvelope,
  SecurityFinding,
  SpecEnvelope,
  TestEnvelope,
} from '../../../../server/lib/factory/types.ts'
import { AGENT_UI, fmtDuration, type SessionEvent } from '../factoryRun'
import { FactoryStatusChip } from './FactoryStatusChip'

type Props = {
  span: ExecutionSpan
  events: SessionEvent[]
  onClose: () => void
}

type Tab = 'result' | 'output' | 'tools'

// Everything one phase of the trace did: its result (per agent or gate), the agent's own
// output while it runs, and every tool call with input and output.
export function PhaseDetailModal({ span, events, onClose }: Props) {
  const running = span.status === 'running'
  const [tab, setTab] = useState<Tab>(running && span.kind === 'agent' ? 'output' : 'result')
  const output = useMemo(() => spanEvents(span, events), [span, events])
  const agent = span.agentId ? AGENT_UI[span.agentId] : null

  return (
    <Modal title={span.name} onClose={onClose} width={920}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
          <FactoryStatusChip span={span.status} />
          {agent ? <b style={{ color: agent.color }}>{agent.name}</b> : <b>{span.kind === 'gate' ? 'Portão em código' : 'Código determinístico'}</b>}
          <span>·</span>
          <span className="mono">{fmtDuration(span.durationMs ?? (Date.now() - new Date(span.startedAt).getTime()))}</span>
          <span>·</span>
          <span className="mono">início {new Date(span.startedAt).toLocaleTimeString('pt-BR')}</span>
          {span.model && <><span>·</span><span>modelo <b className="mono">{span.model}</b></span></>}
          {span.usage?.costUsd !== undefined && <><span>·</span><span className="mono">US$ {span.usage.costUsd.toFixed(3)}</span></>}
          {Boolean(span.usage?.inputTokens || span.usage?.outputTokens) && (
            <><span>·</span><span className="mono">{(((span.usage?.inputTokens ?? 0) + (span.usage?.outputTokens ?? 0)) / 1000).toFixed(1)}k tokens</span></>
          )}
        </div>

        {span.error && (
          <div className="callout callout-crit">
            <AlertTriangle size={16} />
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{span.error}</span>
          </div>
        )}

        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'result'} onClick={() => setTab('result')}>Resultado</button>
          {span.kind === 'agent' && (
            <button type="button" role="tab" aria-selected={tab === 'output'} onClick={() => setTab('output')}>
              Saída do agente {running && <span className="live-dot" style={{ marginLeft: 6 }} />}
            </button>
          )}
          {span.kind === 'agent' && (
            <button type="button" role="tab" aria-selected={tab === 'tools'} onClick={() => setTab('tools')}>
              Ferramentas ({span.toolCalls?.length ?? 0})
            </button>
          )}
        </div>

        <div style={{ maxHeight: '62vh', overflowY: 'auto', minWidth: 0 }}>
          {tab === 'result' && <PhaseResult span={span} />}
          {tab === 'output' && <AgentOutput events={output} running={running} />}
          {tab === 'tools' && <ToolCalls span={span} />}
        </div>
      </div>
    </Modal>
  )
}

// Events of this phase: inside its time window and, when tagged, from its agent
// (Reviewer and Security run at the same time).
function spanEvents(span: ExecutionSpan, events: SessionEvent[]): SessionEvent[] {
  const start = new Date(span.startedAt).getTime() - 1000
  const end = span.finishedAt ? new Date(span.finishedAt).getTime() + 1000 : Infinity
  return events.filter(e => {
    const at = e.createdAt ? new Date(e.createdAt).getTime() : NaN
    if (Number.isNaN(at) || at < start || at > end) return false
    return !e.agentId || e.agentId === span.agentId
  })
}

function PhaseResult({ span }: { span: ExecutionSpan }) {
  if (span.kind !== 'agent') return <GateResult span={span} />
  const env = span.envelope
  if (!env) return <p className="muted">{span.status === 'running' ? 'A fase ainda está rodando; o resultado aparece quando ela terminar. Acompanhe na aba "Saída do agente".' : 'Esta fase não registrou resultado estruturado.'}</p>

  switch (span.agentId) {
    case 'analyst': return <SpecResult spec={env as SpecEnvelope} />
    case 'architect': return <PlanResult plan={env as PlanEnvelope} />
    case 'implementer': return <BuildResult build={env as BuildEnvelope} />
    case 'tester': return <TestResult test={env as TestEnvelope} />
    case 'reviewer':
    case 'security': return <ReviewResult review={env as ReviewEnvelope} />
    case 'documenter': return <DocsResult docs={env as DocsEnvelope} />
    default: return <JsonBlock value={env} />
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="stack" style={{ gap: 6, marginBottom: 16 }}>
      <span className="eyebrow">{title}</span>
      {children}
    </section>
  )
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <span className="muted" style={{ fontSize: 13 }}>{empty}</span>
  return <ul style={{ margin: 0, paddingLeft: 20 }}>{items.map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}</ul>
}

function Files({ files }: { files: string[] }) {
  if (files.length === 0) return <span className="muted" style={{ fontSize: 13 }}>Nenhum arquivo declarado.</span>
  return <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{files.map(f => <span key={f} className="badge mono">{f}</span>)}</div>
}

function SpecResult({ spec }: { spec: SpecEnvelope }) {
  return (
    <>
      {spec.summary && <Section title="O problema"><Markdown>{spec.summary}</Markdown></Section>}
      <Section title={`Critérios de aceite (${spec.acceptanceCriteria.length})`}><List items={spec.acceptanceCriteria} empty="Nenhum critério registrado." /></Section>
      <Section title="Fora do escopo"><List items={spec.outOfScope} empty="Nada declarado fora do escopo." /></Section>
      <Section title="Dúvidas para o desenvolvedor"><List items={spec.openQuestions} empty="Nenhuma dúvida bloqueante." /></Section>
    </>
  )
}

function PlanResult({ plan }: { plan: PlanEnvelope }) {
  return (
    <>
      <Section title="Arquivos-alvo"><Files files={plan.targetFiles} /></Section>
      <Section title="Riscos"><List items={plan.risks} empty="Nenhum risco levantado." /></Section>
      <Section title="Cenários de teste"><List items={plan.testScenarios} empty="Nenhum cenário previsto." /></Section>
      <Section title="Plano técnico"><Markdown>{plan.plan}</Markdown></Section>
    </>
  )
}

function BuildResult({ build }: { build: BuildEnvelope }) {
  return (
    <>
      {build.status === 'error' && <div className="callout callout-crit" style={{ marginBottom: 12 }}>O Implementer declarou um bloqueio.</div>}
      <Section title="Mensagem de commit proposta"><code className="inline">{build.commitMessage}</code></Section>
      <Section title="Arquivos alterados (declarados)"><Files files={build.changedFiles} /></Section>
      <Section title="Resumo"><Markdown>{build.summary}</Markdown></Section>
    </>
  )
}

function TestResult({ test }: { test: TestEnvelope }) {
  return (
    <>
      <Section title="Parecer do Tester">
        <span className={`badge ${test.testSuitePassed ? 'badge-ok' : 'badge-crit'}`} style={{ alignSelf: 'flex-start' }}>
          {test.testSuitePassed ? 'suíte passou' : 'suíte com falha'}
        </span>
      </Section>
      <Section title="Testes executados"><List items={test.testsRan} empty="Nenhum teste listado." /></Section>
      {test.coverageNotes && <Section title="Cobertura"><Markdown>{test.coverageNotes}</Markdown></Section>}
      {test.details && <Section title="Detalhes"><Markdown>{test.details}</Markdown></Section>}
    </>
  )
}

function ReviewResult({ review }: { review: ReviewEnvelope }) {
  return (
    <>
      {review.summary && <Section title="Parecer"><Markdown>{review.summary}</Markdown></Section>}
      {review.criteria.length > 0 && <Section title="Critérios de aceite"><Criteria criteria={review.criteria} /></Section>}
      <Section title={`Achados (${review.findings.length})`}><Findings findings={review.findings} /></Section>
      {review.mrDescription && <Section title="Rascunho da descrição do MR"><Markdown>{review.mrDescription}</Markdown></Section>}
    </>
  )
}

function DocsResult({ docs }: { docs: DocsEnvelope }) {
  return (
    <>
      <Section title="Documentação alterada"><Files files={docs.changedFiles} /></Section>
      <Section title="Descrição final do MR"><Markdown>{docs.mrDescription}</Markdown></Section>
    </>
  )
}

function Criteria({ criteria }: { criteria: CriterionCheck[] }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {criteria.map(c => (
        <div key={c.criterion} className="row" style={{ gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
          <span className={`badge ${c.met ? 'badge-ok' : 'badge-crit'}`}>{c.met ? 'atendido' : 'não atendido'}</span>
          <span>{c.criterion}{c.evidence && <span className="muted"> {c.evidence}</span>}</span>
        </div>
      ))}
    </div>
  )
}

function Findings({ findings }: { findings: SecurityFinding[] }) {
  if (findings.length === 0) return <span className="muted" style={{ fontSize: 13 }}>Nenhum achado.</span>
  return (
    <div className="stack" style={{ gap: 8 }}>
      {findings.map((f, i) => (
        <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
          <span className={`badge ${f.severity === 'critical' || f.severity === 'high' ? 'badge-crit' : f.severity === 'medium' ? 'badge-warn' : ''}`}>{f.severity}</span>
          <div className="stack" style={{ gap: 2 }}>
            <span>{f.description}</span>
            <span className="muted mono" style={{ fontSize: 11 }}>
              {f.file ? `${f.file}${f.line !== undefined ? `:${f.line}` : ''}` : 'sem arquivo'}
              {f.confidence !== undefined ? ` · confiança ${f.confidence}` : ''}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function GateResult({ span }: { span: ExecutionSpan }) {
  const d = (span.details ?? {}) as { command?: string; output?: string; skipped?: boolean }
  if (!d.command && !d.output) {
    return <p className="muted" style={{ fontSize: 13 }}>{span.status === 'failed' ? (span.kind === 'gate' ? 'O portão reprovou; o motivo está acima.' : 'O passo falhou; o motivo está acima.') : span.status === 'running' ? 'Em execução.' : 'Verificação concluída sem saída registrada.'}</p>
  }
  return (
    <>
      {d.command && <Section title="Comando (executado no sandbox)"><Markdown>{'```sh\n' + d.command + '\n```'}</Markdown></Section>}
      {d.skipped && <div className="callout callout-warn" style={{ marginBottom: 12 }}>A verificação não rodou.</div>}
      {d.output && <Section title="Saída"><Markdown>{'```text\n' + d.output + '\n```'}</Markdown></Section>}
    </>
  )
}

function AgentOutput({ events, running }: { events: SessionEvent[]; running: boolean }) {
  const endRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (running) endRef.current?.scrollIntoView({ block: 'end' })
  }, [events.length, running])

  if (events.length === 0) {
    return <p className="muted">{running ? 'Aguardando a primeira saída do agente...' : 'Nenhum evento registrado para esta fase.'}</p>
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      {events.map((e, i) => {
        if (e.type === 'text') return <div key={i} className="card card-pad"><Markdown>{e.text ?? ''}</Markdown></div>
        if (e.type === 'thinking') return <div key={i} className="muted" style={{ fontSize: 12, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>{e.text}</div>
        if (e.type === 'tool') return <div key={i} className="mono" style={{ fontSize: 12, color: 'var(--fx-implementer)' }}>▸ {e.tool} {toolSummary(e.input)}</div>
        if (e.type === 'tool-result') return null
        return <div key={i} className="mono" style={{ fontSize: 12, color: e.type === 'error' ? 'var(--crit)' : 'var(--info)' }}>{e.message ?? e.type}</div>
      })}
      <div ref={endRef} />
    </div>
  )
}

function ToolCalls({ span }: { span: ExecutionSpan }) {
  const calls = span.toolCalls ?? []
  if (calls.length === 0) return <p className="muted">Nenhuma ferramenta chamada nesta fase.</p>
  return (
    <div className="stack" style={{ gap: 6 }}>
      {calls.map((c, i) => (
        <details key={c.id ?? i} className="card" style={{ padding: '8px 12px' }}>
          <summary className="row" style={{ gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <b className="mono" style={{ color: c.isError ? 'var(--crit)' : 'var(--fx-implementer)' }}>{c.tool}</b>
            <span className="mono muted spacer" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toolSummary(c.input)}</span>
            {c.durationMs !== undefined && <span className="mono muted" style={{ fontSize: 11 }}>{fmtDuration(c.durationMs)}</span>}
            {c.isError && <span className="badge badge-crit">erro</span>}
          </summary>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            <JsonBlock value={c.input} />
            {c.output && <Markdown>{'```text\n' + c.output + '\n```'}</Markdown>}
          </div>
        </details>
      ))}
    </div>
  )
}

// One line naming what a tool call touched: the command, the file or the pattern
function toolSummary(input: unknown): string {
  if (!input || typeof input !== 'object') return String(input ?? '')
  const i = input as Record<string, unknown>
  const v = i.command ?? i.file_path ?? i.path ?? i.pattern ?? i.query ?? Object.values(i)[0]
  return typeof v === 'string' ? v : JSON.stringify(v ?? '')
}

function JsonBlock({ value }: { value: unknown }) {
  return <Markdown>{'```json\n' + JSON.stringify(value, null, 2) + '\n```'}</Markdown>
}
