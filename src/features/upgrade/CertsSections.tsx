import { KeyRound, Lock, ScanSearch } from 'lucide-react'
import { useState } from 'react'
import { Async, Empty, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { CERT_BADGE, expiry, fetchIngressCerts, fetchKubeconfigCerts, type CertInfo, type IngressCert } from './api'
import { tx } from '@/lib/i18n'

const STATE = tx({ en: 'State', pt: 'Estado' })
const EXPIRES = tx({ en: 'Expires on', pt: 'Vence em' })
const DETAIL = tx({ en: 'Detail', pt: 'Detalhe' })

function CertBadge({ info }: { info: CertInfo }) {
  const b = CERT_BADGE[info.state]
  return (
    <>
      <span className={`badge ${b.badge}`}>{b.label}</span>
      {info.trusted === false && <span className="badge badge-warn" style={{ marginLeft: 4 }} title={info.detail}>{tx({ en: 'untrusted', pt: 'não confiável' })}</span>}
    </>
  )
}

export function IngressCertsSection({ namespace }: { namespace: string }) {
  const [certs, setCerts] = useState<IngressCert[] | null>(null)
  const [forbidden, setForbidden] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const r = await fetchIngressCerts(namespace)
      setCerts(r.certificates)
      setForbidden(r.forbidden)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title spacer">{tx({ en: 'Hosts with TLS', pt: 'Hosts com TLS' })}{namespace ? tx({ en: ` in ${namespace}`, pt: ` em ${namespace}` }) : ''}</div>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={running}><ScanSearch size={13} /> {running ? tx({ en: 'Connecting…', pt: 'Conectando…' }) : certs ? tx({ en: 'Check again', pt: 'Verificar de novo' }) : tx({ en: 'Check certificates', pt: 'Verificar certificados' })}</button>
      </div>
      <div className="card-pad stack">
        {!certs && !running && !error && (
          <p className="muted" style={{ fontSize: 12.5 }}>
            {tx({
              en: 'For each TLS host of the Ingresses and Istio VirtualServices, the panel opens a TLS connection and reads the expiry date of the certificate presented. It reads no Secret. A host reachable only on the internal network needs the VPN.',
              pt: 'Para cada host com TLS dos Ingresses e dos VirtualServices do Istio, o painel abre uma conexão TLS e lê a data de vencimento do certificado apresentado. Não lê Secret. Host só acessível pela rede interna precisa da VPN.',
            })}
          </p>
        )}
        {running && <SkeletonRows rows={4} height={32} />}
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
        {certs && !running && forbidden.length > 0 && (
          <div className="callout callout-warn" style={{ fontSize: 12.5 }}>{tx({ en: `No permission to list ${forbidden.join(' and ')}: their hosts were left out of the check.`, pt: `Sem permissão para listar ${forbidden.join(' e ')}: os hosts deles não entraram na verificação.` })}</div>
        )}
        {certs && !running && (certs.length === 0 ? (
          <Empty icon={Lock} title={tx({ en: 'No host with TLS', pt: 'Nenhum host com TLS' })}>{tx({ en: 'No Ingress with spec.tls and no Istio VirtualService in this scope.', pt: 'Nem Ingress com spec.tls nem VirtualService do Istio neste escopo.' })}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Host</th><th>{STATE}</th><th>{EXPIRES}</th><th>{DETAIL}</th></tr></thead>
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
      <div className="card-head"><div className="card-title spacer">{tx({ en: 'Kubeconfig credentials', pt: 'Credenciais dos kubeconfigs' })}</div></div>
      <div className="card-pad stack">
        <p className="muted" style={{ fontSize: 12.5 }}>
          {tx({
            en: 'Reads the client certificate expiry of each kubeconfig in your folder, without talking to any cluster. Tokens and exec logins (OIDC, cloud) keep no date in the file.',
            pt: 'Lê o vencimento do certificado de cliente de cada kubeconfig da sua pasta, sem falar com cluster nenhum. Token e login por exec (OIDC, cloud) não guardam a data no arquivo.',
          })}
        </p>
        <Async state={state} isEmpty={d => d.length === 0} empty={<Empty icon={KeyRound} title={tx({ en: 'No kubeconfig', pt: 'Nenhum kubeconfig' })} />}>
          {data => (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Kubeconfig</th><th>{tx({ en: 'User', pt: 'Usuário' })}</th><th>{STATE}</th><th>{EXPIRES}</th><th>{DETAIL}</th></tr></thead>
                <tbody>
                  {data.flatMap(k => (k.error
                    ? [<tr key={k.id}><td className="mono">{k.id}</td><td colSpan={4}><span className="badge badge-crit">{tx({ en: 'error', pt: 'erro' })}</span> <span className="muted" style={{ fontSize: 12 }}>{k.error}</span></td></tr>]
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
