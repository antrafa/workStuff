import { FolderOpen, ScanSearch } from 'lucide-react'
import { useState } from 'react'
import { SkeletonRows } from '@/ui'
import { fetchClusterReport, pickFolder, scanManifests, type ClusterReport, type ManifestReport, type Removal } from './api'

type Props = { namespace: string; withCluster: boolean }

// Versão de destino é compartilhada: a do cluster vira o padrão para os manifests do repositório.
export function ApisSection({ namespace, withCluster }: Props) {
  const [target, setTarget] = useState('')
  const validTarget = target === '' || /^1\.\d{1,2}$/.test(target)

  return (
    <>
      <div className="row">
        <label className="row" style={{ ['--gap' as string]: '8px' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Versão de destino</span>
          <input className="input mono" style={{ width: 90 }} value={target} onChange={e => setTarget(e.target.value.trim())} placeholder={withCluster ? 'próxima' : '1.31'} />
        </label>
        {!validTarget && <span className="muted" style={{ fontSize: 12, color: 'var(--crit)' }}>use o formato 1.30</span>}
      </div>
      {withCluster && <ClusterCard namespace={namespace} target={validTarget ? target : ''} onTarget={t => !target && setTarget(t)} />}
      <ManifestsCard target={validTarget ? target : ''} />
    </>
  )
}

function ClusterCard({ namespace, target, onTarget }: { namespace: string; target: string; onTarget: (t: string) => void }) {
  const [report, setReport] = useState<ClusterReport | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const r = await fetchClusterReport(target, namespace)
      setReport(r)
      onTarget(r.target)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title spacer">No cluster{report && <> · <span className="mono">{report.serverVersion ?? 'versão desconhecida'}</span> → <span className="mono">{report.target}</span></>}</div>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={running}><ScanSearch size={13} /> {running ? 'Verificando…' : report ? 'Verificar de novo' : 'Verificar cluster'}</button>
      </div>
      <div className="card-pad stack">
        {!report && !running && !error && (
          <p className="muted" style={{ fontSize: 12.5 }}>
            Lista Deployments, CronJobs, Ingresses, RBAC, CRDs e outros{namespace ? ` do namespace ${namespace}` : ' de todos os namespaces'}, e lê a versão
            com que cada um foi aplicado (anotação do <span className="mono">kubectl apply</span>). Também lê as métricas do apiserver, que mostram chamadas recentes
            a API obsoleta feitas por Helm, operadores e CI.
          </p>
        )}
        {running && <SkeletonRows rows={3} height={32} />}
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
        {report && !running && <ClusterResult report={report} />}
      </div>
    </section>
  )
}

function ClusterResult({ report }: { report: ClusterReport }) {
  return (
    <>
      {report.objects.length === 0 && report.deprecatedCalls?.length === 0 && (
        <div className="callout callout-info" style={{ fontSize: 12.5 }}>Nada encontrado que quebre na {report.target} entre os {report.scanned} objetos lidos.</div>
      )}
      {report.objects.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Objeto</th><th>Aplicado com</th><th>Removida na</th><th>Trocar por</th></tr></thead>
            <tbody>
              {report.objects.map(o => (
                <tr key={`${o.kind}|${o.namespace}|${o.name}`}>
                  <td><div className="mono">{o.kind}/{o.name}</div><div className="muted" style={{ fontSize: 11.5 }}>{o.namespace ?? 'cluster'}</div></td>
                  <td className="mono">{o.appliedWith}</td>
                  <td className="mono">{o.removal.removedIn}</td>
                  <td><Replacement removal={o.removal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {report.deprecatedCalls && report.deprecatedCalls.length > 0 && (
        <div className="stack" style={{ ['--gap' as string]: '6px' }}>
          <div className="eyebrow">Chamadas recentes a API obsoleta (métricas do apiserver)</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Recurso</th><th>Versão chamada</th><th>Removida na</th></tr></thead>
              <tbody>
                {report.deprecatedCalls.map(c => (
                  <tr key={`${c.group}|${c.version}|${c.resource}`}>
                    <td className="mono">{c.resource}</td>
                    <td className="mono">{c.group ? `${c.group}/` : ''}{c.version}</td>
                    <td className="mono">{c.removedRelease}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Alguém ainda chama essas APIs: procure no chart do Helm, no operador ou no pipeline que aplica os manifests.</p>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12 }}>
        {report.scanned} objetos lidos.
        {report.deprecatedCalls === null && ' O RBAC não permite ler as métricas do apiserver; só a anotação foi conferida.'}
        {report.forbidden.length > 0 && ` Sem permissão para listar: ${report.forbidden.join(', ')}.`}
        {' '}Objeto criado por Helm ou operador não guarda a anotação: confira os manifests do repositório abaixo.
      </div>
    </>
  )
}

const Replacement = ({ removal }: { removal: Removal }) =>
  removal.replacement ? <span className="mono">{removal.replacement}</span> : <span className="badge badge-crit">sem substituto</span>

function ManifestsCard({ target }: { target: string }) {
  const [path, setPath] = useState('')
  const [report, setReport] = useState<ManifestReport | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dest = target || '1.31'

  const run = async (p = path) => {
    if (!p.trim()) return
    setPath(p)
    setRunning(true)
    setError(null)
    try {
      setReport(await scanManifests(p.trim(), dest))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const pick = async () => {
    try {
      const { path: picked } = await pickFolder()
      if (picked) run(picked)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section className="card">
      <div className="card-head"><div className="card-title spacer">Nos manifests de um repositório</div></div>
      <div className="card-pad stack">
        <form className="row" onSubmit={e => (e.preventDefault(), run())}>
          <input className="input mono spacer" value={path} onChange={e => setPath(e.target.value)} placeholder="/caminho/do/repositorio" disabled={running} />
          <button type="button" className="btn" onClick={pick} disabled={running}><FolderOpen size={14} /> Escolher</button>
          <button className="btn btn-primary" disabled={running || !path.trim()}><ScanSearch size={14} /> Verificar para {dest}</button>
        </form>
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
        {report && !running && (report.hits.length === 0 ? (
          <div className="callout callout-info" style={{ fontSize: 12.5 }}>Nenhum dos {report.files} arquivos YAML usa API removida até a {report.target}.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Arquivo</th><th>Recurso</th><th>apiVersion</th><th>Removida na</th><th>Trocar por</th></tr></thead>
              <tbody>
                {report.hits.map(h => (
                  <tr key={`${h.file}|${h.line}`}>
                    <td className="mono">{h.file}:{h.line}</td>
                    <td className="mono">{h.kind}{h.name ? `/${h.name}` : ''}</td>
                    <td className="mono">{h.apiVersion}</td>
                    <td className="mono">{h.removal.removedIn}</td>
                    <td><Replacement removal={h.removal} /></td>
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
