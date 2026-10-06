import { Skull, Unplug } from 'lucide-react'
import { useState } from 'react'
import { ConfirmModal, Empty, Search, useToast } from '@/ui'
import { killCommand, killPort, type Port, type Services } from './api'
import { tx } from '@/lib/i18n'

// Only loopback is truly local: 0.0.0.0 and :: accept connections from other machines on the network.
const exposed = (address: string) => address === '0.0.0.0' || address === '::' || address === '*'

export function PortsCard({ data, onChanged }: { data: Services; onChanged: () => void }) {
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<Port | null>(null)
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const toast = useToast()
  // Same port with more than one process: one of them is answering in place of the other.
  const pidsByPort = new Map<number, Set<number | null>>()
  data.ports.forEach(p => pidsByPort.set(p.port, (pidsByPort.get(p.port) ?? new Set()).add(p.pid)))
  const conflict = (p: Port) => (pidsByPort.get(p.port)?.size ?? 0) > 1
  const ports = data.ports.filter(p => !query || `${p.port} ${p.process ?? ''} ${p.pid ?? ''}`.toLowerCase().includes(query.toLowerCase()))

  const kill = async (p: Port, forced: boolean) => {
    setBusy(p.pid)
    try {
      const r = await killPort(p.pid!, forced)
      toast(r.stillAlive
        ? tx({ en: `Process ${p.pid} is still alive; try again with "Force" checked`, pt: `O processo ${p.pid} ainda está vivo; tente de novo marcando "Forçar"` })
        : tx({ en: `Process ${p.pid} stopped (port ${p.port})`, pt: `Processo ${p.pid} encerrado (porta ${p.port})` }))
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
      onChanged()
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title spacer">{tx({ en: 'Listening ports', pt: 'Portas em escuta' })} · {data.platform}</div>
        <Search value={query} onChange={setQuery} placeholder={tx({ en: 'Filter by port, process or PID', pt: 'Filtrar por porta, processo ou PID' })} width={260} />
      </div>
      {ports.length === 0 ? <Empty icon={Unplug} title={tx({ en: 'No port in this filter', pt: 'Nenhuma porta neste filtro' })} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{tx({ en: 'State', pt: 'Estado' })}</th><th className="num">{tx({ en: 'Port', pt: 'Porta' })}</th><th>{tx({ en: 'Address', pt: 'Endereço' })}</th><th>{tx({ en: 'Process', pt: 'Processo' })}</th><th className="num">PID</th><th /></tr></thead>
            <tbody>
              {ports.map(p => {
                const self = p.panel
                return (
                  <tr key={`${p.address}|${p.port}|${p.pid}`}>
                    <td>{conflict(p) ? <span className="badge badge-crit" title={tx({ en: 'Another process also listens on this port', pt: 'Outro processo também escuta nesta porta' })}>{tx({ en: '◆ conflict', pt: '◆ conflito' })}</span> : <span className="badge badge-ok">● ok</span>}</td>
                    <td className="num mono">{p.port}</td>
                    <td className="mono">{p.address}{exposed(p.address) && <span className="badge badge-warn" style={{ marginLeft: 6 }} title={tx({ en: 'Accepts connections from other machines on the network', pt: 'Aceita conexão de outras máquinas da rede' })}>{tx({ en: 'network', pt: 'rede' })}</span>}</td>
                    <td className="mono">
                      {p.process ?? <span className="muted" title={tx({ en: "Another user's process (root, a system service)", pt: 'Processo de outro usuário (root, serviço do sistema)' })}>{tx({ en: 'another user', pt: 'outro usuário' })}</span>}
                      {self && <span className="badge badge-signal" style={{ marginLeft: 6 }}>{tx({ en: 'this panel', pt: 'este painel' })}</span>}
                    </td>
                    <td className="num mono">{p.pid ?? '—'}</td>
                    <td className="num">
                      <button
                        className="btn btn-sm"
                        disabled={!p.pid || self || busy === p.pid}
                        onClick={() => (setForce(false), setTarget(p))}
                        title={self
                          ? tx({ en: "It is one of this panel's processes (server or screen): stopping it would take workStuff down", pt: 'É um processo deste painel (servidor ou tela): encerrá-lo derrubaria o workStuff' })
                          : !p.pid
                            ? tx({ en: "Another user's process: the system does not give its PID", pt: 'Processo de outro usuário: o sistema não informa o PID' })
                            : tx({ en: `Stops process ${p.pid}, which frees port ${p.port}`, pt: `Encerra o processo ${p.pid}, que libera a porta ${p.port}` })}
                      >
                        <Skull size={12} /> {tx({ en: 'Stop', pt: 'Encerrar' })}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {target && target.pid && (
        <ConfirmModal
          title={tx({ en: `Stop the process on port ${target.port}?`, pt: `Encerrar o processo da porta ${target.port}?` })}
          action={tx({ en: 'stop process', pt: 'encerrar processo' })}
          env="LOCAL"
          command={killCommand(data.os, target.pid, force)}
          effects={[
            tx({ en: `${target.process ?? 'The process'} (PID ${target.pid}) stops and port ${target.port} is freed`, pt: `${target.process ?? 'O processo'} (PID ${target.pid}) para e a porta ${target.port} fica livre` }),
            tx({ en: 'Requests in progress fail', pt: 'Requisições em andamento falham' }),
          ]}
          losses={[
            tx({ en: 'Data the process has not saved', pt: 'Dados não salvos pelo processo' }),
            tx({ en: 'If it is a development server, just start it again', pt: 'Se for um servidor de desenvolvimento, basta subir de novo' }),
          ]}
          confirmLabel={force ? tx({ en: 'Force stop', pt: 'Forçar encerramento' }) : tx({ en: 'Stop', pt: 'Encerrar' })}
          icon={Skull}
          onConfirm={() => kill(target, force)}
          onClose={() => setTarget(null)}
        >
          <label className="row confirm-type" style={{ fontSize: 13, ['--gap' as string]: '8px', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} style={{ marginTop: 3 }} />
            <span>{tx({
              en: `Force (${data.os === 'win32' ? 'taskkill /F' : 'SIGKILL'}): stops it at once, without giving the process a chance to close files and connections. Use it only if the normal stop does not work.`,
              pt: `Forçar (${data.os === 'win32' ? 'taskkill /F' : 'SIGKILL'}): encerra na hora, sem dar chance de o processo fechar arquivos e conexões. Use só se o encerramento normal não resolver.`,
            })}</span>
          </label>
        </ConfirmModal>
      )}
    </section>
  )
}
