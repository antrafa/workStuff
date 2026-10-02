import { Container, ExternalLink, ScanSearch } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { SkeletonRows } from '@/ui'
import { SEVERITY_BADGE, bySeverity, trivyFolder, trivyImage, type TrivyFinding } from './api'

// Varredura completa (dependências transitivas e imagens), só quando o trivy está instalado.
export function TrivyPanel({ available, path }: { available: boolean | null; path: string | null }) {
  const [image, setImage] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ target: string; findings: TrivyFinding[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (available === null) return null
  if (!available) {
    return (
      <div className="callout callout-info" style={{ fontSize: 12.5 }}>
        <ScanSearch size={16} />
        <div className="spacer">
          Com o <a href="https://trivy.dev" target="_blank" rel="noreferrer">trivy</a> instalado, esta tela também varre as dependências transitivas
          (o que o lockfile puxa) e imagens de container. A tela <Link to="/maquina">Máquina</Link> mostra como instalar.
        </div>
      </div>
    )
  }

  const run = async (call: () => Promise<{ target: string; findings: TrivyFinding[] }>) => {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      setResult(await call())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title spacer">Varredura completa (trivy)</div>
      </div>
      <div className="card-pad stack">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" disabled={!path || running} onClick={() => run(() => trivyFolder(path!))} title={path ? `trivy fs ${path}` : 'Verifique um projeto primeiro'}>
            <ScanSearch size={14} /> Varrer o projeto inteiro
          </button>
          <form className="row spacer" onSubmit={e => (e.preventDefault(), image.trim() && run(() => trivyImage(image.trim())))}>
            <input className="input mono spacer" value={image} onChange={e => setImage(e.target.value)} placeholder="imagem, ex.: nginx:1.27" disabled={running} />
            <button className="btn" disabled={!image.trim() || running}><Container size={14} /> Varrer imagem</button>
          </form>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>A primeira execução baixa a base do trivy e pode levar alguns minutos.</p>
        {running && <SkeletonRows rows={4} height={32} />}
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
        {result && <Findings result={result} />}
      </div>
    </section>
  )
}

function Findings({ result }: { result: { target: string; findings: TrivyFinding[] } }) {
  if (!result.findings.length) return <div className="callout callout-info">Nenhuma falha encontrada em <span className="mono">{result.target}</span>.</div>
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Severidade</th>
            <th>Pacote</th>
            <th>Instalada</th>
            <th>Corrigida em</th>
            <th>Falha</th>
          </tr>
        </thead>
        <tbody>
          {[...result.findings].sort(bySeverity).map(f => (
            <tr key={`${f.target}|${f.pkg}|${f.id}`}>
              <td><span className={`badge ${SEVERITY_BADGE[f.severity]}`}>{f.severity}</span></td>
              <td>
                <div className="mono">{f.pkg}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{f.target}</div>
              </td>
              <td className="mono">{f.installed}</td>
              <td className="mono">{f.fixed ?? '—'}</td>
              <td>
                <div className="row" style={{ ['--gap' as string]: '6px' }}>
                  <span className="spacer" style={{ fontSize: 12.5 }}>{f.title || f.id}</span>
                  {f.url && <a className="btn btn-ghost btn-sm btn-icon" href={f.url} target="_blank" rel="noreferrer" title={f.id}><ExternalLink size={13} /></a>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
