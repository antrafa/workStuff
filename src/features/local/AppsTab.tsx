import { AppWindow, ExternalLink, Pencil, Play, Plus, RotateCw, ScrollText, Square, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { Async, ConfirmModal, Empty, SkeletonRows, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { AppForm } from './AppForm'
import { AppLogs } from './AppLogs'
import { appAction, commandLine, deleteApp, fetchApps, type Action, type App, type AppStatus } from './api'
import { tx } from '@/lib/i18n'

const POLL_MS = 3_000

function StateBadge({ app }: { app: AppStatus }) {
  if (app.pid && app.port && !app.portOpen) return <span className="badge badge-info">◌ {tx({ en: 'starting', pt: 'iniciando' })}</span>
  if (app.pid) return <span className="badge badge-ok">● {tx({ en: 'running', pt: 'rodando' })}</span>
  if (app.portOpen) {
    return (
      <span className="badge badge-warn" title={tx({ en: `Port ${app.port} is taken by PID ${app.portPid ?? '?'}, which this panel did not start. Free it in the Ports and Docker tab.`, pt: `A porta ${app.port} está ocupada pelo PID ${app.portPid ?? '?'}, que este painel não iniciou. Libere na aba Portas e Docker.` })}>
        ◆ {tx({ en: 'port taken', pt: 'porta ocupada' })}
      </span>
    )
  }
  return <span className="badge">○ {tx({ en: 'stopped', pt: 'parado' })}</span>
}

export function AppsTab() {
  const state = useAsync(fetchApps)
  const [editing, setEditing] = useState<App | 'new' | null>(null)
  const [removing, setRemoving] = useState<AppStatus | null>(null)
  const [logsOf, setLogsOf] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const toast = useToast()

  // Status changes on its own (an app crashes, a port opens): keep polling while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && state.reload(), POLL_MS)
    return () => clearInterval(id)
  }, [state.reload])

  const act = async (app: AppStatus, action: Action) => {
    setBusy(app.id)
    try {
      const r = await appAction(app.id, action)
      if (r.stillAlive) toast(tx({ en: `${app.name} did not stop yet; try again in a few seconds`, pt: `${app.name} ainda não parou; tente de novo em alguns segundos` }))
      if (action !== 'stop') setLogsOf(app.id)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
      state.reload()
    }
  }

  const remove = async (app: AppStatus) => {
    try {
      await deleteApp(app.id)
      toast(tx({ en: `${app.name} deleted`, pt: `${app.name} excluída` }))
    } catch (e) {
      toast((e as Error).message)
    } finally {
      state.reload()
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title spacer">{tx({ en: 'Registered applications', pt: 'Aplicações cadastradas' })}</div>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}><Plus size={13} /> {tx({ en: 'New application', pt: 'Nova aplicação' })}</button>
      </div>
      <Async state={state} skeleton={<SkeletonRows rows={4} height={36} />}>
        {apps => apps.length === 0 ? (
          <Empty icon={AppWindow} title={tx({ en: 'No application registered', pt: 'Nenhuma aplicação cadastrada' })} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{tx({ en: 'State', pt: 'Estado' })}</th><th>{tx({ en: 'Application', pt: 'Aplicação' })}</th><th>{tx({ en: 'Command', pt: 'Comando' })}</th><th className="num">{tx({ en: 'Port', pt: 'Porta' })}</th><th className="num">PID</th><th /></tr></thead>
              <tbody>
                {apps.map(a => (
                  <Fragment key={a.id}>
                    <tr>
                      <td><StateBadge app={a} /></td>
                      <td><b>{a.name}</b><div className="muted mono" style={{ fontSize: 11.5 }}>{a.cwd}</div></td>
                      <td className="mono" style={{ fontSize: 12 }}>{commandLine(a)}</td>
                      <td className="num mono">{a.port ?? '—'}</td>
                      <td className="num mono">{a.pid ?? '—'}</td>
                      <td>
                        <div className="row" style={{ ['--gap' as string]: '6px', flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                          {a.pid ? (
                            <>
                              <button className="btn btn-sm" disabled={busy === a.id} onClick={() => act(a, 'stop')}><Square size={12} /> {tx({ en: 'Stop', pt: 'Parar' })}</button>
                              <button className="btn btn-sm" disabled={busy === a.id} onClick={() => act(a, 'restart')}><RotateCw size={12} /> {tx({ en: 'Restart', pt: 'Reiniciar' })}</button>
                            </>
                          ) : (
                            <button className="btn btn-sm" disabled={busy === a.id} onClick={() => act(a, 'start')}><Play size={12} /> {tx({ en: 'Start', pt: 'Iniciar' })}</button>
                          )}
                          <button className="btn btn-sm" aria-pressed={logsOf === a.id} onClick={() => setLogsOf(l => (l === a.id ? null : a.id))}><ScrollText size={12} /> Logs</button>
                          {a.url && <a className="btn btn-sm" href={a.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {tx({ en: 'Open', pt: 'Abrir' })}</a>}
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(a)} title={tx({ en: 'Edit', pt: 'Editar' })}><Pencil size={13} /></button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            disabled={Boolean(a.pid)}
                            onClick={() => setRemoving(a)}
                            title={a.pid ? tx({ en: 'Stop the application before deleting', pt: 'Pare a aplicação antes de excluir' }) : tx({ en: 'Delete', pt: 'Excluir' })}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {logsOf === a.id && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0 }}><AppLogs app={a} onClose={() => setLogsOf(null)} /></td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
      {editing && <AppForm app={editing === 'new' ? null : editing} onSaved={state.reload} onClose={() => setEditing(null)} />}
      {removing && (
        <ConfirmModal
          title={tx({ en: `Delete ${removing.name}?`, pt: `Excluir ${removing.name}?` })}
          action={tx({ en: 'delete application', pt: 'excluir aplicação' })}
          env="LOCAL"
          effects={[tx({ en: 'The application leaves this list; its folder and code stay untouched', pt: 'A aplicação sai desta lista; a pasta e o código dela não são tocados' })]}
          losses={[tx({ en: 'The registration (command, port, variables) and the last log', pt: 'O cadastro (comando, porta, variáveis) e o último log' })]}
          confirmLabel={tx({ en: 'Delete', pt: 'Excluir' })}
          icon={Trash2}
          onConfirm={() => remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </section>
  )
}
