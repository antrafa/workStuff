import { Container, Play, RotateCw, Square, Unplug } from 'lucide-react'
import { useState } from 'react'
import { Async, ConfirmModal, Empty, Page, Search, SkeletonRows, useToast } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

type Port = { address: string; port: number; pid: number | null; process: string | null }
type ContainerRow = { id: string; name: string; image: string; state: string; status: string; ports: string; project: string | null }
type Compose = { name: string; status: string; configFiles: string }
type Services = { platform: string; ports: Port[]; docker: boolean; containers: ContainerRow[]; compose: Compose[] }
type Action = 'start' | 'stop' | 'restart'
type Pending = { kind: 'container' | 'compose'; target: string; label: string; action: Action }

const ACTION_LABEL: Record<Action, string> = { start: 'Iniciar', stop: 'Parar', restart: 'Reiniciar' }
// Só loopback é local de verdade: 0.0.0.0 e :: aceitam conexão de outras máquinas da rede.
const exposed = (address: string) => address === '0.0.0.0' || address === '::' || address === '*'

export default function LocalPage() {
  const state = useAsync(() => api.get<Services>('/local/services'))
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const toast = useToast()

  const act = async (p: Pending) => {
    setBusy(p.target)
    try {
      await api.post(`/local/${p.kind === 'container' ? 'containers' : 'compose'}/${encodeURIComponent(p.target)}/${p.action}`)
      toast(`${ACTION_LABEL[p.action]}: ${p.label}`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
      state.reload()
    }
  }

  const command = (p: Pending) => (p.kind === 'container' ? `docker ${p.action} ${p.label}` : `docker compose -p ${p.label} ${p.action === 'start' ? 'up -d' : p.action}`)

  return (
    <Page
      eyebrow="Ferramentas"
      title="Serviços locais"
      hint="O que está rodando nesta máquina: portas em escuta com o processo dono, containers Docker e projetos compose."
      actions={<button className="btn" onClick={state.reload}><RotateCw size={14} className={state.loading ? 'spin' : ''} /> Atualizar</button>}
    >
      <Async state={state} skeleton={<SkeletonRows rows={6} height={36} />}>
        {d => {
          const ports = d.ports.filter(p => !query || `${p.port} ${p.process ?? ''}`.toLowerCase().includes(query.toLowerCase()))
          return (
            <>
              <section className="card">
                <div className="card-head">
                  <div className="card-title spacer">Portas em escuta · {d.platform}</div>
                  <Search value={query} onChange={setQuery} placeholder="Filtrar por porta ou processo" width={240} />
                </div>
                {ports.length === 0 ? <Empty icon={Unplug} title="Nenhuma porta neste filtro" /> : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th className="num">Porta</th><th>Endereço</th><th>Processo</th><th className="num">PID</th></tr></thead>
                      <tbody>
                        {ports.map(p => (
                          <tr key={`${p.address}|${p.port}|${p.pid}`}>
                            <td className="num mono">{p.port}</td>
                            <td className="mono">{p.address}{exposed(p.address) && <span className="badge badge-warn" style={{ marginLeft: 6 }} title="Aceita conexão de outras máquinas da rede">rede</span>}</td>
                            <td className="mono">{p.process ?? <span className="muted" title="Processo de outro usuário (root, serviço do sistema)">outro usuário</span>}</td>
                            <td className="num mono">{p.pid ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {!d.docker ? (
                <div className="callout callout-info" style={{ fontSize: 12.5 }}>O Docker não está instalado ou o daemon não responde; a tela Máquina mostra o que falta.</div>
              ) : (
                <>
                  <section className="card">
                    <div className="card-head"><div className="card-title spacer">Containers ({d.containers.length})</div></div>
                    {d.containers.length === 0 ? <Empty icon={Container} title="Nenhum container" /> : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead><tr><th>Container</th><th>Estado</th><th>Portas</th><th /></tr></thead>
                          <tbody>
                            {d.containers.map(c => {
                              const running = c.state === 'running'
                              const ask = (action: Action) => setPending({ kind: 'container', target: c.id, label: c.name, action })
                              return (
                                <tr key={c.id}>
                                  <td><div className="mono">{c.name}</div><div className="muted" style={{ fontSize: 11.5 }}>{c.image}{c.project ? ` · compose ${c.project}` : ''}</div></td>
                                  <td><span className={`badge ${running ? 'badge-ok' : c.state === 'exited' ? '' : 'badge-warn'}`}>{c.state}</span> <span className="muted" style={{ fontSize: 12 }}>{c.status}</span></td>
                                  <td className="mono" style={{ fontSize: 12 }}>{c.ports || '—'}</td>
                                  <td className="num">
                                    <div className="row" style={{ ['--gap' as string]: '4px', justifyContent: 'flex-end' }}>
                                      {running
                                        ? <><button className="btn btn-sm" disabled={busy === c.id} onClick={() => ask('restart')}><RotateCw size={12} /> Reiniciar</button><button className="btn btn-sm" disabled={busy === c.id} onClick={() => ask('stop')}><Square size={12} /> Parar</button></>
                                        : <button className="btn btn-sm" disabled={busy === c.id} onClick={() => ask('start')}><Play size={12} /> Iniciar</button>}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                  <section className="card">
                    <div className="card-head"><div className="card-title spacer">Projetos compose ({d.compose.length})</div></div>
                    {d.compose.length === 0 ? (
                      <Empty icon={Container} title="Nenhum projeto compose">Projetos aparecem aqui depois do primeiro docker compose up.</Empty>
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead><tr><th>Projeto</th><th>Estado</th><th /></tr></thead>
                          <tbody>
                            {d.compose.map(p => {
                              const ask = (action: Action) => setPending({ kind: 'compose', target: p.name, label: p.name, action })
                              return (
                                <tr key={p.name}>
                                  <td><div className="mono">{p.name}</div><div className="muted" style={{ fontSize: 11.5 }}>{p.configFiles}</div></td>
                                  <td className="muted">{p.status}</td>
                                  <td className="num">
                                    <div className="row" style={{ ['--gap' as string]: '4px', justifyContent: 'flex-end' }}>
                                      <button className="btn btn-sm" disabled={busy === p.name} onClick={() => ask('start')}><Play size={12} /> Subir</button>
                                      <button className="btn btn-sm" disabled={busy === p.name} onClick={() => ask('stop')}><Square size={12} /> Parar</button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )
        }}
      </Async>
      {pending && (
        <ConfirmModal
          title={`${ACTION_LABEL[pending.action]} ${pending.kind === 'container' ? 'container' : 'projeto compose'}`}
          confirmLabel={ACTION_LABEL[pending.action]}
          icon={pending.action === 'stop' ? Square : pending.action === 'start' ? Play : RotateCw}
          onConfirm={() => act(pending)}
          onClose={() => setPending(null)}
        >
          <p>O painel vai rodar nesta máquina:</p>
          <pre className="code">{command(pending)}</pre>
          {pending.action !== 'start' && <p className="muted" style={{ fontSize: 12.5 }}>Quem estiver usando o serviço perde a conexão até ele voltar.</p>}
        </ConfirmModal>
      )}
    </Page>
  )
}
