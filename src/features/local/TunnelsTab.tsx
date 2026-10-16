import {
  AlertTriangle, Cable, Layers, Pencil, Play, Plus, RotateCw, Save, ScrollText, Square, Trash2, WrapText, X,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Async, ConfirmModal, Empty, EnvStamp, Modal, Search, SkeletonRows, useToast } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { tx } from '@/lib/i18n'
import {
  deleteTunnel,
  fetchTunnels,
  saveTunnel,
  tunnelAction,
  tunnelCommandLine,
  tunnelLogsUrl,
  tunnelProfileAction,
  type Action,
  type Tunnel,
  type TunnelStatus,
  type TunnelTargetKind,
} from './api'
import '../cluster/cluster.css'

const POLL_MS = 3_000
const MAX_LINES = 5_000

type KubeconfigOption = {
  id: string
  filename: string
  contexts: string[]
  currentContext: string
  environment: 'DES' | 'ITG' | 'HML' | 'PRO' | null
}

function TunnelStateBadge({ t }: { t: TunnelStatus }) {
  if (t.pid && !t.portOpen) {
    return <span className="badge badge-info">◌ {tx({ en: 'connecting', pt: 'conectando' })}</span>
  }
  if (t.pid) {
    return <span className="badge badge-ok">● {tx({ en: 'connected', pt: 'conectado' })}</span>
  }
  if (t.lastError) {
    return (
      <span className="badge badge-crit" title={t.lastError}>
        ▲ {tx({ en: 'dropped', pt: 'queda detectada' })}
      </span>
    )
  }
  if (t.portOpen) {
    return (
      <span
        className="badge badge-warn"
        title={tx({
          en: `Local port ${t.localPort} is taken by PID ${t.portPid ?? '?'}`,
          pt: `A porta local ${t.localPort} está ocupada pelo PID ${t.portPid ?? '?'}`,
        })}
      >
        ◆ {tx({ en: 'port taken', pt: 'porta ocupada' })}
      </span>
    )
  }
  return <span className="badge">○ {tx({ en: 'stopped', pt: 'parado' })}</span>
}

export function TunnelsTab() {
  const state = useAsync(fetchTunnels)
  const [editing, setEditing] = useState<Tunnel | 'new' | null>(null)
  const [removing, setRemoving] = useState<TunnelStatus | null>(null)
  const [confirmStart, setConfirmStart] = useState<{ tunnel: TunnelStatus; action: 'start' | 'restart' } | null>(null)
  const [confirmProfile, setConfirmProfile] = useState<{ profile: string; sensitive: TunnelStatus[] } | null>(null)
  const [logsOf, setLogsOf] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Tunnels a plain Stop did not end: their Stop button becomes Force stop (KILL)
  const [stuck, setStuck] = useState<Set<string>>(new Set())
  const toast = useToast()

  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && state.reload(), POLL_MS)
    return () => clearInterval(id)
  }, [state.reload])

  const act = async (t: TunnelStatus, action: Action, confirmSensitive = false) => {
    if ((action === 'start' || action === 'restart') && t.sensitive && !confirmSensitive) {
      setConfirmStart({ tunnel: t, action })
      return
    }
    setBusy(t.id)
    try {
      await tunnelAction(t.id, action, { confirmSensitive })
      if (action !== 'stop') setLogsOf(t.id)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
      state.reload()
    }
  }

  const stop = async (t: TunnelStatus, force: boolean) => {
    setBusy(t.id)
    try {
      const r = await tunnelAction(t.id, 'stop', { force })
      setStuck(s => {
        const next = new Set(s)
        if (r.stillAlive) next.add(t.id)
        else next.delete(t.id)
        return next
      })
      if (r.stillAlive) {
        toast(force
          ? tx({ en: `${t.name} is still alive even after Force stop; check it in Listening ports`, pt: `${t.name} continua vivo mesmo depois de Forçar parada; confira em Portas em escuta` })
          : tx({ en: `${t.name} did not stop. Click Force stop to end it at once.`, pt: `${t.name} não parou. Clique em Forçar parada para encerrar de vez.` }))
      }
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
      state.reload()
    }
  }

  const runProfile = async (profile: string, action: 'start' | 'stop', group: TunnelStatus[], confirmSensitive = false) => {
    const sensitive = group.filter(t => t.sensitive && !t.pid)
    if (action === 'start' && sensitive.length > 0 && !confirmSensitive) {
      setConfirmProfile({ profile, sensitive })
      return
    }
    setBusy(`profile:${profile}`)
    try {
      const res = await tunnelProfileAction(profile, action, confirmSensitive)
      if (res.errors.length > 0) {
        toast(res.errors.join(' · '))
      } else {
        toast(
          action === 'start'
            ? tx({ en: `Profile "${profile}" started (${res.started.length})`, pt: `Perfil "${profile}" iniciado (${res.started.length})` })
            : tx({ en: `Profile "${profile}" stopped (${res.stopped.length})`, pt: `Perfil "${profile}" parado (${res.stopped.length})` }),
        )
      }
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
      state.reload()
    }
  }

  const remove = async (t: TunnelStatus) => {
    try {
      await deleteTunnel(t.id)
      toast(tx({ en: `${t.name} deleted`, pt: `${t.name} excluído` }))
    } catch (e) {
      toast((e as Error).message)
    } finally {
      state.reload()
    }
  }

  return (
    <Async state={state} skeleton={<SkeletonRows rows={4} height={40} />}>
      {tunnels => {
        const profiles = [...new Set(tunnels.map(t => t.profile).filter((p): p is string => Boolean(p)))]
        const activeSensitive = tunnels.filter(t => t.pid && t.sensitive)

        return (
          <div className="stack">
            {activeSensitive.length > 0 && (
              <div className="callout callout-warn">
                <div className="row" style={{ gap: 8 }}>
                  <AlertTriangle size={15} />
                  <b>
                    {tx({
                      en: `${activeSensitive.length} active tunnel(s) connected to HML/PRO (or unclassified cluster):`,
                      pt: `${activeSensitive.length} túnel(is) ativo(s) apontando para HML/PRO (ou cluster sem classificação):`,
                    })}
                  </b>
                  <span>
                    {activeSensitive.map(t => `${t.name} (localhost:${t.localPort})`).join(', ')}
                  </span>
                </div>
              </div>
            )}

            {profiles.length > 0 && (
              <section className="card">
                <div className="card-head">
                  <Layers size={15} color="var(--signal)" />
                  <div className="card-title">{tx({ en: 'Tunnel profiles', pt: 'Perfis de túneis' })}</div>
                  <small className="muted">
                    {tx({
                      en: 'Start or stop all port-forwards of a local stack at once',
                      pt: 'Suba ou pare todos os port-forwards de uma pilha local de uma vez',
                    })}
                  </small>
                </div>
                <div className="card-pad">
                  <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                    {profiles.map(p => {
                      const group = tunnels.filter(t => t.profile === p)
                      const running = group.filter(t => t.pid !== null).length
                      return (
                        <div
                          key={p}
                          className="row"
                          style={{
                            gap: 8,
                            padding: '6px 10px',
                            background: 'var(--surface-2)',
                            border: '1px solid var(--line)',
                            borderRadius: 'var(--r)',
                          }}
                        >
                          <b>{p}</b>
                          <span className="badge mono">{running}/{group.length}</span>
                          <button
                            className="btn btn-sm"
                            disabled={busy === `profile:${p}` || running === group.length}
                            onClick={() => runProfile(p, 'start', group)}
                          >
                            <Play size={11} /> {tx({ en: 'Start profile', pt: 'Subir perfil' })}
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={busy === `profile:${p}` || running === 0}
                            onClick={() => runProfile(p, 'stop', group)}
                          >
                            <Square size={11} /> {tx({ en: 'Stop', pt: 'Parar' })}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}

            <section className="card">
              <div className="card-head">
                <Cable size={16} color="var(--signal)" />
                <div className="card-title spacer">{tx({ en: 'Kubernetes tunnels (kubectl port-forward)', pt: 'Túneis Kubernetes (kubectl port-forward)' })}</div>
                <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
                  <Plus size={13} /> {tx({ en: 'New tunnel', pt: 'Novo túnel' })}
                </button>
              </div>

              {tunnels.length === 0 ? (
                <div className="card-pad">
                  <Empty
                    icon={Cable}
                    title={tx({ en: 'No Kubernetes tunnel registered', pt: 'Nenhum túnel Kubernetes cadastrado' })}
                  />
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{tx({ en: 'State', pt: 'Estado' })}</th>
                        <th>{tx({ en: 'Tunnel', pt: 'Túnel' })}</th>
                        <th>Cluster / Namespace</th>
                        <th>{tx({ en: 'Target', pt: 'Alvo' })}</th>
                        <th className="num">{tx({ en: 'Local → Remote', pt: 'Local → Remota' })}</th>
                        <th className="num">PID</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {tunnels.map(t => (
                        <Fragment key={t.id}>
                          <tr>
                            <td><TunnelStateBadge t={t} /></td>
                            <td>
                              <div className="row" style={{ gap: 6 }}>
                                <b>{t.name}</b>
                                {t.profile && <span className="badge">{t.profile}</span>}
                              </div>
                              {t.lastError && !t.pid && (
                                <div className="mono" style={{ fontSize: 11, color: 'var(--crit)' }}>{t.lastError}</div>
                              )}
                            </td>
                            <td>
                              <div className="row" style={{ gap: 6 }}>
                                <EnvStamp env={t.environment} />
                                <span className="mono" style={{ fontSize: 12 }}>{t.kubeconfigId}</span>
                                <span className="badge mono">{t.namespace}</span>
                              </div>
                              {t.context && <div className="muted mono" style={{ fontSize: 11 }}>{t.context}</div>}
                            </td>
                            <td className="mono" style={{ fontSize: 12 }}>
                              {t.targetKind}/{t.targetName}
                            </td>
                            <td className="num mono">
                              127.0.0.1:{t.localPort} → :{t.remotePort}
                            </td>
                            <td className="num mono">{t.pid ?? '—'}</td>
                            <td>
                              <div className="row" style={{ gap: 6, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                                {t.pid ? (
                                  <>
                                    {stuck.has(t.id) ? (
                                      <button className="btn btn-sm btn-danger" disabled={busy === t.id} onClick={() => stop(t, true)} title={tx({ en: 'Ends the process at once (KILL), without letting it close on its own', pt: 'Encerra o processo na hora (KILL), sem esperar que ele feche sozinho' })}>
                                        <Square size={12} /> {tx({ en: 'Force stop', pt: 'Forçar parada' })}
                                      </button>
                                    ) : (
                                      <button className="btn btn-sm" disabled={busy === t.id} onClick={() => stop(t, false)}>
                                        <Square size={12} /> {tx({ en: 'Stop', pt: 'Parar' })}
                                      </button>
                                    )}
                                    <button className="btn btn-sm" disabled={busy === t.id} onClick={() => act(t, 'restart')}>
                                      <RotateCw size={12} /> {tx({ en: 'Restart', pt: 'Reiniciar' })}
                                    </button>
                                  </>
                                ) : (
                                  <button className="btn btn-sm" disabled={busy === t.id} onClick={() => act(t, 'start')}>
                                    <Play size={12} /> {tx({ en: 'Connect', pt: 'Conectar' })}
                                  </button>
                                )}
                                <button
                                  className="btn btn-sm"
                                  aria-pressed={logsOf === t.id}
                                  onClick={() => setLogsOf(l => (l === t.id ? null : t.id))}
                                >
                                  <ScrollText size={12} /> Logs
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm btn-icon"
                                  onClick={() => setEditing(t)}
                                  title={tx({ en: 'Edit', pt: 'Editar' })}
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm btn-icon"
                                  disabled={Boolean(t.pid)}
                                  onClick={() => setRemoving(t)}
                                  title={t.pid ? tx({ en: 'Stop the tunnel before deleting', pt: 'Pare o túnel antes de excluir' }) : tx({ en: 'Delete', pt: 'Excluir' })}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {logsOf === t.id && (
                            <tr>
                              <td colSpan={7} style={{ padding: 0 }}>
                                <TunnelLogs tunnel={t} onClose={() => setLogsOf(null)} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {editing && (
              <TunnelForm
                tunnel={editing === 'new' ? null : editing}
                onSaved={state.reload}
                onClose={() => setEditing(null)}
              />
            )}

            {confirmProfile && (
              <ConfirmModal
                title={tx({
                  en: `Start profile ${confirmProfile.profile}, with ${confirmProfile.sensitive.length} tunnel(s) to a sensitive environment?`,
                  pt: `Subir o perfil ${confirmProfile.profile}, com ${confirmProfile.sensitive.length} túnel(is) para ambiente sensível?`,
                })}
                action={tx({ en: 'open port-forward tunnels', pt: 'abrir túneis port-forward' })}
                env={confirmProfile.sensitive.some(t => t.environment !== 'HML') ? 'PRO' : 'HML'}
                effects={confirmProfile.sensitive.map(t => tx({
                  en: `${t.name}: localhost:${t.localPort} → ${t.targetKind}/${t.targetName}:${t.remotePort} in ${t.environment ?? 'unclassified (PRO)'}`,
                  pt: `${t.name}: localhost:${t.localPort} → ${t.targetKind}/${t.targetName}:${t.remotePort} em ${t.environment ?? 'não classificado (PRO)'}`,
                }))}
                losses={[
                  tx({
                    en: 'Any local application or migration connecting to these local ports will read/write against the remote cluster services',
                    pt: 'Qualquer aplicação ou migration local que conectar nessas portas locais lerá/escreverá nos serviços remotos do cluster',
                  }),
                ]}
                confirmLabel={tx({ en: 'Start profile', pt: 'Subir perfil' })}
                icon={Cable}
                onConfirm={() => runProfile(confirmProfile.profile, 'start', confirmProfile.sensitive, true)}
                onClose={() => setConfirmProfile(null)}
              />
            )}

            {confirmStart && (
              <ConfirmModal
                title={tx({
                  en: `Open tunnel to ${confirmStart.tunnel.environment ?? 'unclassified (PRO)'}: ${confirmStart.tunnel.name}?`,
                  pt: `Abrir túnel para ${confirmStart.tunnel.environment ?? 'não classificado (PRO)'}: ${confirmStart.tunnel.name}?`,
                })}
                action={tx({ en: 'open port-forward tunnel', pt: 'abrir túnel port-forward' })}
                env={confirmStart.tunnel.environment ?? 'PRO'}
                command={tunnelCommandLine(confirmStart.tunnel)}
                effects={[
                  tx({
                    en: `Forwards localhost:${confirmStart.tunnel.localPort} directly to ${confirmStart.tunnel.targetKind}/${confirmStart.tunnel.targetName}:${confirmStart.tunnel.remotePort} in namespace ${confirmStart.tunnel.namespace}`,
                    pt: `Encaminha localhost:${confirmStart.tunnel.localPort} diretamente para ${confirmStart.tunnel.targetKind}/${confirmStart.tunnel.targetName}:${confirmStart.tunnel.remotePort} no namespace ${confirmStart.tunnel.namespace}`,
                  }),
                ]}
                losses={[
                  tx({
                    en: 'Any local application or migration connecting to this local port will read/write against the remote cluster service',
                    pt: 'Qualquer aplicação ou migration local que conectar nesta porta local lerá/escreverá no serviço remoto do cluster',
                  }),
                ]}
                confirmLabel={tx({ en: 'Open tunnel', pt: 'Abrir túnel' })}
                icon={Cable}
                onConfirm={() => act(confirmStart.tunnel, confirmStart.action, true)}
                onClose={() => setConfirmStart(null)}
              />
            )}

            {removing && (
              <ConfirmModal
                title={tx({ en: `Delete tunnel ${removing.name}?`, pt: `Excluir túnel ${removing.name}?` })}
                action={tx({ en: 'delete tunnel', pt: 'excluir túnel' })}
                env="LOCAL"
                effects={[tx({ en: 'Removes the saved tunnel configuration and its log file', pt: 'Remove o cadastro do túnel e o arquivo de log local' })]}
                losses={[tx({ en: 'The saved port-forward configuration', pt: 'O cadastro salvo do port-forward' })]}
                confirmLabel={tx({ en: 'Delete', pt: 'Excluir' })}
                icon={Trash2}
                onConfirm={() => remove(removing)}
                onClose={() => setRemoving(null)}
              />
            )}
          </div>
        )
      }}
    </Async>
  )
}

function TunnelForm({ tunnel, onSaved, onClose }: { tunnel: Tunnel | null; onSaved: () => void; onClose: () => void }) {
  const kubes = useAsync(() => api.get<{ items: KubeconfigOption[] }>('/k8s/kubeconfigs'))
  const [name, setName] = useState(tunnel?.name ?? '')
  const [profile, setProfile] = useState(tunnel?.profile ?? '')
  const [kubeconfigId, setKubeconfigId] = useState(tunnel?.kubeconfigId ?? '')
  const [context, setContext] = useState(tunnel?.context ?? '')
  const [namespace, setNamespace] = useState(tunnel?.namespace ?? 'default')
  const [targetKind, setTargetKind] = useState<TunnelTargetKind>(tunnel?.targetKind ?? 'svc')
  const [targetName, setTargetName] = useState(tunnel?.targetName ?? '')
  const [localPort, setLocalPort] = useState(tunnel?.localPort ? String(tunnel.localPort) : '5432')
  const [remotePort, setRemotePort] = useState(tunnel?.remotePort ? String(tunnel.remotePort) : '5432')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const items = kubes.data?.items ?? []
  const selectedKube = items.find(k => k.id === kubeconfigId)

  useEffect(() => {
    if (!kubeconfigId && items.length > 0) {
      setKubeconfigId(items[0].id)
      setContext(items[0].currentContext)
    }
  }, [items, kubeconfigId])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveTunnel(
        {
          name,
          profile: profile.trim() || null,
          kubeconfigId,
          context,
          namespace,
          targetKind,
          targetName,
          localPort: Number(localPort),
          remotePort: Number(remotePort),
        },
        tunnel?.id,
      )
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={tunnel ? tx({ en: `Edit ${tunnel.name}`, pt: `Editar ${tunnel.name}` }) : tx({ en: 'New Kubernetes tunnel', pt: 'Novo túnel Kubernetes' })}
      width={620}
      onClose={onClose}
      footer={
        <>
          {error && <span className="field"><small className="error">{error}</small></span>}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{tx({ en: 'Cancel', pt: 'Cancelar' })}</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            <Save size={14} /> {tx({ en: 'Save', pt: 'Salvar' })}
          </button>
        </>
      }
    >
      <div className="stack" style={{ ['--gap' as string]: '12px' }}>
        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 2 }}>
            <span>{tx({ en: 'Tunnel name', pt: 'Nome do túnel' })}</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Postgres Passagem DES" autoFocus />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{tx({ en: 'Profile (optional group)', pt: 'Perfil (grupo opcional)' })}</span>
            <input className="input" value={profile} onChange={e => setProfile(e.target.value)} placeholder="Passagem local" />
          </label>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span>Kubeconfig</span>
            {items.length > 0 ? (
              <select
                className="select mono"
                value={kubeconfigId}
                onChange={e => {
                  const next = items.find(k => k.id === e.target.value)
                  setKubeconfigId(e.target.value)
                  if (next) setContext(next.currentContext)
                }}
              >
                {items.map(k => (
                  <option key={k.id} value={k.id}>
                    {k.filename} {k.environment ? `[${k.environment}]` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input mono" value={kubeconfigId} onChange={e => setKubeconfigId(e.target.value)} placeholder="config" />
            )}
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{tx({ en: 'Context (optional)', pt: 'Contexto (opcional)' })}</span>
            {selectedKube && selectedKube.contexts.length > 0 ? (
              <select className="select mono" value={context} onChange={e => setContext(e.target.value)}>
                {selectedKube.contexts.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input className="input mono" value={context} onChange={e => setContext(e.target.value)} placeholder="default" />
            )}
          </label>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ width: 180 }}>
            <span>Namespace</span>
            <input className="input mono" value={namespace} onChange={e => setNamespace(e.target.value)} placeholder="default" spellCheck={false} />
          </label>
          <label className="field" style={{ width: 130 }}>
            <span>{tx({ en: 'Kind', pt: 'Tipo' })}</span>
            <select className="select mono" value={targetKind} onChange={e => setTargetKind(e.target.value as TunnelTargetKind)}>
              <option value="svc">svc (Service)</option>
              <option value="pod">pod (Pod)</option>
              <option value="deploy">deploy (Deployment)</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{tx({ en: 'Resource name', pt: 'Nome do recurso' })}</span>
            <input className="input mono" value={targetName} onChange={e => setTargetName(e.target.value)} placeholder="postgres-service" spellCheck={false} />
          </label>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span>{tx({ en: 'Local port (127.0.0.1)', pt: 'Porta local (127.0.0.1)' })}</span>
            <input className="input mono" type="number" min={1} max={65535} value={localPort} onChange={e => setLocalPort(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>{tx({ en: 'Remote port (cluster)', pt: 'Porta remota (cluster)' })}</span>
            <input className="input mono" type="number" min={1} max={65535} value={remotePort} onChange={e => setRemotePort(e.target.value)} />
          </label>
        </div>
      </div>
    </Modal>
  )
}

function TunnelLogs({ tunnel, onClose }: { tunnel: Tunnel; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [wrap, setWrap] = useState(false)
  const body = useRef<HTMLPreElement>(null)
  const partial = useRef('')

  useEffect(() => {
    const es = new EventSource(tunnelLogsUrl(tunnel.id))
    es.onmessage = m => {
      const e = JSON.parse(m.data) as { type: 'chunk'; text: string; reset: boolean }
      if (e.reset) partial.current = ''
      const parts = (partial.current + e.text).split('\n')
      partial.current = parts.pop() ?? ''
      setLines(l => [...(e.reset ? [] : l), ...parts].slice(-MAX_LINES))
    }
    return () => es.close()
  }, [tunnel.id])

  const visible = query ? lines.filter(l => l.toLowerCase().includes(query.toLowerCase())) : lines

  return (
    <div className="logs-dock inline">
      <div className="logs-head">
        <b className="mono">{tunnel.name}</b>
        <Search value={query} onChange={setQuery} placeholder={tx({ en: 'filter by text…', pt: 'filtrar por texto…' })} width={200} />
        <div className="spacer" />
        <button className="btn btn-sm" aria-pressed={wrap} onClick={() => setWrap(w => !w)}>
          <WrapText size={13} /> {tx({ en: 'Wrap lines', pt: 'Quebrar linha' })}
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} title={tx({ en: 'Close logs', pt: 'Fechar logs' })}>
          <X size={14} />
        </button>
      </div>
      <pre ref={body} className={`logs-body ${wrap ? 'wrap' : ''}`}>
        {visible.length === 0 && (
          <div className="log-info">
            {tx({ en: 'Empty log: the tunnel has not written anything since the last start.', pt: 'Log vazio: o túnel não escreveu nada desde o último início.' })}
          </div>
        )}
        {visible.map((l, i) => (
          <div key={i} className={`log-${/error|unable|refused|lost/i.test(l) ? 'error' : 'info'}`}>{l}</div>
        ))}
      </pre>
    </div>
  )
}
