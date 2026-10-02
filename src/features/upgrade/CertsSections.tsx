import { KeyRound, Lock, ScanSearch } from 'lucide-react'
import { useState } from 'react'
import { Async, Empty, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { CERT_BADGE, expiry, fetchIngressCerts, fetchKubeconfigCerts, type CertInfo, type IngressCert } from './api'

function CertBadge({ info }: { info: CertInfo }) {
  const b = CERT_BADGE[info.state]
  return (
    <>
      <span className={`badge ${b.badge}`}>{b.label}</span>
      {info.trusted === false && <span className="badge badge-warn" style={{ marginLeft: 4 }} title={info.detail}>não confiável</span>}
    </>
  )
}

export function IngressCertsSection({ namespace }: { namespace: string }) {
  const [certs, setCerts] = useState<IngressCert[] | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      setCerts((await fetchIngressCerts(namespace)).certificates)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title spacer">Hosts com TLS nos ingresses{namespace ? ` de ${namespace}` : ''}</div>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={running}><ScanSearch size={13} /> {running ? 'Conectando…' : certs ? 'Verificar de novo' : 'Verificar certificados'}</button>
      </div>
      <div className="card-pad stack">
        {!certs && !running && !error && (
          <p className="muted" style={{ fontSize: 12.5 }}>
            Para cada host de <span className="mono">spec.tls</span>, o painel abre uma conexão TLS e lê a data de vencimento do certificado apresentado.
            Não lê Secret. Host só acessível pela rede interna precisa da VPN.
          </p>
        )}
        {running && <SkeletonRows rows={4} height={32} />}
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
        {certs && !running && (certs.length === 0 ? (
          <Empty icon={Lock} title="Nenhum ingress com TLS" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Host</th><th>Estado</th><th>Vence em</th><th>Detalhe</th></tr></thead>
              <tbody>
                {certs.map(c => (
                  <tr key={c.host}>
                    <td><div className="mono">{c.host}</div><div className="muted" style={{ fontSize: 11.5 }}>{c.ingresses.join(', ')}</div></td>
                    <td><CertBadge info={c.info} /></td>
                    <td className="mono">{expiry(c.info)}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{c.info.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  )
}

export function KubeconfigCertsSection() {
  const state = useAsync(fetchKubeconfigCerts)
  return (
    <section className="card">
      <div className="card-head"><div className="card-title spacer">Credenciais dos kubeconfigs</div></div>
      <div className="card-pad stack">
        <p className="muted" style={{ fontSize: 12.5 }}>
          Lê o vencimento do certificado de cliente de cada kubeconfig da sua pasta, sem falar com cluster nenhum. Token e login por exec (OIDC, cloud) não
          guardam a data no arquivo.
        </p>
        <Async state={state} isEmpty={d => d.length === 0} empty={<Empty icon={KeyRound} title="Nenhum kubeconfig" />}>
          {data => (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Kubeconfig</th><th>Usuário</th><th>Estado</th><th>Vence em</th><th>Detalhe</th></tr></thead>
                <tbody>
                  {data.flatMap(k => (k.error
                    ? [<tr key={k.id}><td className="mono">{k.id}</td><td colSpan={4}><span className="badge badge-crit">erro</span> <span className="muted" style={{ fontSize: 12 }}>{k.error}</span></td></tr>]
                    : k.users.map(u => (
                      <tr key={`${k.id}|${u.user}`}>
                        <td><span className="mono">{k.id}</span>{k.environment && <span className="badge" style={{ marginLeft: 6 }}>{k.environment}</span>}</td>
                        <td className="mono">{u.user}</td>
                        <td><CertBadge info={u.info} /></td>
                        <td className="mono">{expiry(u.info)}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{u.info.detail}</td>
                      </tr>
                    ))))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
    </section>
  )
}
