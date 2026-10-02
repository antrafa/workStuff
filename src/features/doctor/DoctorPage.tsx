import './doctor.css'
import { ExternalLink, Play, RotateCw, Settings2, ShieldCheck, Square, Stethoscope, Terminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Async, CopyButton, ConfirmModal, Empty, Page, Segmented, SkeletonRows, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { fetchChecks, runFix, type Check, type CheckStatus } from './api'
import { ConfigModal } from './ConfigModal'

const STATUS: Record<CheckStatus, { badge: string; label: string }> = {
  ok: { badge: 'badge-ok', label: 'ok' },
  aviso: { badge: 'badge-warn', label: 'aviso' },
  falta: { badge: 'badge-crit', label: 'falta' },
}

export default function DoctorPage() {
  const state = useAsync(fetchChecks)
  const checks = state.data?.items ?? []
  const count = (s: CheckStatus) => checks.filter(c => c.status === s).length
  const [view, setView] = useState<'pendentes' | 'tudo'>('pendentes')
  const [configuring, setConfiguring] = useState(false)

  return (
    <Page
      title="Máquina"
      hint="O que falta nesta máquina para trabalhar, e como resolver cada item. Nada é instalado sem você clicar."
      actions={
        <>
          <button className="btn" onClick={() => setConfiguring(true)} title="Registries privados, endereços internos e versões que seus projetos exigem"><Settings2 size={14} /> Personalizar verificações</button>
          <button className="btn btn-primary" onClick={state.reload} disabled={state.loading} title="Roda todas as verificações de novo">
            <RotateCw size={14} className={state.loading ? 'spin' : ''} /> {state.loading ? 'Verificando…' : 'Verificar de novo'}
          </button>
        </>
      }
    >
      {checks.length > 0 && (
        <div className="grid" style={{ ['--min' as string]: '180px' }}>
          <div className="stat"><span className="eyebrow">Tudo certo</span><b style={{ color: 'var(--ok)' }}>{count('ok')}</b><small>itens ok</small></div>
          <div className="stat"><span className="eyebrow">Pendências</span><b style={{ color: 'var(--crit)' }}>{count('falta')}</b><small>impedem o trabalho</small></div>
          <div className="stat"><span className="eyebrow">Avisos</span><b style={{ color: 'var(--warn)' }}>{count('aviso')}</b><small>funcionam, mas com limitação</small></div>
          {state.data && <div className="stat"><span className="eyebrow">Sistema</span><b style={{ fontSize: 18 }}>{state.data.platform.label}</b><small>comandos sugeridos para este sistema</small></div>}
        </div>
      )}
      {checks.length > 0 && count('falta') === 0 && (
        <div className="callout callout-info"><ShieldCheck size={16} />Máquina apta: nenhuma pendência obrigatória.</div>
      )}
      {checks.length > 0 && (
        <div className="row">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { id: 'pendentes', label: `Pendências e avisos (${count('falta') + count('aviso')})` },
              { id: 'tudo', label: `Tudo (${checks.length})` },
            ]}
          />
        </div>
      )}
      <Async
        state={state}
        isEmpty={d => d.items.length === 0}
        skeleton={<SkeletonRows rows={5} height={64} />}
        empty={
          <div className="card">
            <Empty icon={Stethoscope} title="Nenhum diagnóstico rodado ainda" action={<button className="btn btn-primary" onClick={state.reload}>Verificar máquina</button>}>
              A verificação lê versões e configurações locais; não altera nada.
            </Empty>
          </div>
        }
      >
        {({ items: all }) => {
          const list = view === 'tudo' ? all : all.filter(c => c.status !== 'ok')
          if (list.length === 0) return <div className="card"><Empty icon={ShieldCheck} title="Nada pendente" action={<button className="btn btn-sm" onClick={() => setView('tudo')}>Ver todas as {all.length} verificações</button>}>Tudo o que o painel verifica está ok nesta máquina.</Empty></div>
          return (
          <div className="stack">
            {[...new Set(list.map(c => c.grupo))].map(grupo => (
              <section key={grupo} className="card">
                <div className="card-head"><div className="card-title">{grupo}</div></div>
                {list.filter(c => c.grupo === grupo).map(c => <CheckRow key={c.item} check={c} onFixed={state.reload} />)}
              </section>
            ))}
          </div>
          )
        }}
      </Async>
      {configuring && <ConfigModal onClose={() => setConfiguring(false)} onSaved={state.reload} />}
    </Page>
  )
}

function CheckRow({ check, onFixed }: { check: Check; onFixed: () => void }) {
  const toast = useToast()
  const { badge, label } = STATUS[check.status]
  const [confirming, setConfirming] = useState(false)
  const [lines, setLines] = useState<string[] | null>(null)
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const execute = async () => {
    abort.current = new AbortController()
    setRunning(true)
    setLines([])
    let ok = false
    try {
      await runFix(check, e => {
        if (e.type === 'line') setLines(l => [...(l ?? []), e.text].slice(-400))
        if (e.type === 'done') {
          ok = e.ok
          setLines(l => [...(l ?? []), e.ok ? '✓ concluído' : `✗ falhou (código ${e.code})${e.error ? `: ${e.error}` : ''}`])
        }
      }, abort.current.signal)
    } catch (e) {
      setLines(l => [...(l ?? []), `✗ ${(e as Error).message}`])
    }
    setRunning(false)
    toast(ok ? `${check.item}: correção concluída, verificando de novo` : `${check.item}: a correção falhou; veja a saída`)
    if (ok) onFixed()
  }
  const isUrl = check.correcao?.startsWith('http')

  return (
    <div className="check-row">
      <span className={`badge ${badge}`}>{label}</span>
      <div className="stack" style={{ ['--gap' as string]: '6px', minWidth: 0, flex: 1 }}>
        <div className="row">
          <b>{check.item}</b>
          <span className="muted check-detail">{check.detalhe}</span>
        </div>
        {check.correcao && (
          <div className="row">
            {isUrl ? (
              <a className="btn btn-sm" href={check.correcao} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir página de download</a>
            ) : (
              <code className="code" style={{ flex: 1 }}>{check.correcao}</code>
            )}
            <CopyButton value={check.correcao} />
            {check.execucao === 'auto' && (
              running ? (
                <button className="btn btn-sm" onClick={() => abort.current?.abort()} title="Interrompe o comando"><Square size={12} /> Parar</button>
              ) : (
                <button className="btn btn-sm" onClick={() => setConfirming(true)} title="Roda a correção nesta máquina e verifica de novo">
                  <Play size={13} /> Executar
                </button>
              )
            )}
            {check.execucao === 'manual' && (
              <span className="muted row" style={{ fontSize: 12, ['--gap' as string]: '4px' }} title="Precisa de sudo: rode você mesmo no terminal">
                <Terminal size={13} /> rode no terminal
              </span>
            )}
          </div>
        )}
        {lines && <pre className="code fix-output">{lines.join('\n') || 'iniciando…'}</pre>}
      </div>
      {confirming && (
        <ConfirmModal title={`Executar a correção de ${check.item}?`} confirmLabel="Executar" icon={Play} onClose={() => setConfirming(false)} onConfirm={execute}>
          <p style={{ margin: '0 0 10px' }}>Roda este comando nesta máquina, sem sudo, instalando na sua home:</p>
          <code className="code" style={{ display: 'block' }}>{check.correcao}</code>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 12.5 }}>Pode levar alguns minutos e baixar da internet. Para desfazer, remova a versão pelo mesmo gerenciador (sdk ou nvm).</p>
        </ConfirmModal>
      )}
    </div>
  )
}
