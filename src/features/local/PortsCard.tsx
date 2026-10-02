import { Skull, Unplug } from 'lucide-react'
import { useState } from 'react'
import { ConfirmModal, Empty, Search, useToast } from '@/ui'
import { killCommand, killPort, type Port, type Services } from './api'

// Só loopback é local de verdade: 0.0.0.0 e :: aceitam conexão de outras máquinas da rede.
const exposed = (address: string) => address === '0.0.0.0' || address === '::' || address === '*'

export function PortsCard({ data, onChanged }: { data: Services; onChanged: () => void }) {
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<Port | null>(null)
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const toast = useToast()
  const ports = data.ports.filter(p => !query || `${p.port} ${p.process ?? ''} ${p.pid ?? ''}`.toLowerCase().includes(query.toLowerCase()))

  const kill = async (p: Port, forced: boolean) => {
    setBusy(p.pid)
    try {
      const r = await killPort(p.pid!, forced)
      toast(r.stillAlive ? `O processo ${p.pid} ainda está vivo; tente de novo marcando "Forçar"` : `Processo ${p.pid} encerrado (porta ${p.port})`)
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
        <div className="card-title spacer">Portas em escuta · {data.platform}</div>
        <Search value={query} onChange={setQuery} placeholder="Filtrar por porta, processo ou PID" width={260} />
      </div>
      {ports.length === 0 ? <Empty icon={Unplug} title="Nenhuma porta neste filtro" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th className="num">Porta</th><th>Endereço</th><th>Processo</th><th className="num">PID</th><th /></tr></thead>
            <tbody>
              {ports.map(p => {
                const self = p.panel
                return (
                  <tr key={`${p.address}|${p.port}|${p.pid}`}>
                    <td className="num mono">{p.port}</td>
                    <td className="mono">{p.address}{exposed(p.address) && <span className="badge badge-warn" style={{ marginLeft: 6 }} title="Aceita conexão de outras máquinas da rede">rede</span>}</td>
                    <td className="mono">
                      {p.process ?? <span className="muted" title="Processo de outro usuário (root, serviço do sistema)">outro usuário</span>}
                      {self && <span className="badge badge-signal" style={{ marginLeft: 6 }}>este painel</span>}
                    </td>
                    <td className="num mono">{p.pid ?? '—'}</td>
                    <td className="num">
                      <button
                        className="btn btn-sm"
                        disabled={!p.pid || self || busy === p.pid}
                        onClick={() => (setForce(false), setTarget(p))}
                        title={self ? 'É um processo deste painel (servidor ou tela): encerrá-lo derrubaria o workStuff' : !p.pid ? 'Processo de outro usuário: o sistema não informa o PID' : `Encerra o processo ${p.pid}, que libera a porta ${p.port}`}
                      >
                        <Skull size={12} /> Encerrar
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
          title={`Encerrar o processo da porta ${target.port}?`}
          confirmLabel={force ? 'Forçar encerramento' : 'Encerrar'}
          icon={Skull}
          onConfirm={() => kill(target, force)}
          onClose={() => setTarget(null)}
        >
          <p>O painel vai rodar nesta máquina:</p>
          <pre className="code">{killCommand(data.os, target.pid, force)}</pre>
          <p className="muted" style={{ fontSize: 12.5 }}>
            {target.process ?? 'O processo'} (PID {target.pid}) para, e tudo o que ele estava fazendo é interrompido: requisições em andamento falham e dados
            não salvos se perdem. Se for um servidor de desenvolvimento, basta subir de novo.
          </p>
          <label className="row" style={{ fontSize: 13, ['--gap' as string]: '8px' }}>
            <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />
            Forçar ({data.os === 'win32' ? 'taskkill /F' : 'SIGKILL'}): encerra na hora, sem dar chance de o processo fechar arquivos e conexões. Use só se o
            encerramento normal não resolver.
          </label>
        </ConfirmModal>
      )}
    </section>
  )
}
