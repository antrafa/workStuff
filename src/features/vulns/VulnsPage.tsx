import './vulns.css'
import { FolderOpen, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Empty, Page, SkeletonRows } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { DependencyTable } from './DependencyTable'
import { TrivyPanel } from './TrivyPanel'
import { SEVERITIES, SEVERITY_LABEL, fetchHistory, fetchSaved, fetchStatus, pickFolder, scan, type ScanResult } from './api'
import { tx } from '@/lib/i18n'

export default function VulnsPage() {
  const history = useAsync(fetchHistory)
  const status = useAsync(fetchStatus)
  const [path, setPath] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (target = path) => {
    if (!target.trim()) return
    setPath(target)
    setRunning(true)
    setError(null)
    try {
      setResult(await scan(target.trim()))
      history.reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const openSaved = async (savedPath: string) => {
    setPath(savedPath)
    setError(null)
    try {
      setResult(await fetchSaved(savedPath))
    } catch (e) {
      setError((e as Error).message)
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
    <Page
      title={tx({ en: 'Vulnerabilities', pt: 'Vulnerabilidades' })}
      hint={tx({
        en: "A project's dependencies (package.json and pom.xml) with the known flaws in the public OSV database and the latest published version. Only reads the files.",
        pt: 'Dependências de um projeto (package.json e pom.xml) com as falhas conhecidas na base pública OSV e a última versão publicada. Só lê os arquivos.',
      })}
    >
      <section className="card card-pad stack">
        <form className="row" onSubmit={e => (e.preventDefault(), run())}>
          <input className="input mono spacer" value={path} onChange={e => setPath(e.target.value)} placeholder={tx({ en: '/path/to/project or ~/workspace/project', pt: '/caminho/do/projeto ou ~/workspace/projeto' })} disabled={running} />
          <button type="button" className="btn" onClick={pick} disabled={running} title={tx({ en: "System's folder picker", pt: 'Seletor de pasta do sistema' })}><FolderOpen size={14} /> {tx({ en: 'Choose', pt: 'Escolher' })}</button>
          <button className="btn btn-primary" disabled={running || !path.trim()}><ShieldAlert size={14} /> {running ? tx({ en: 'Checking…', pt: 'Verificando…' }) : tx({ en: 'Check', pt: 'Verificar' })}</button>
        </form>
        {history.data && history.data.length > 0 && (
          <div className="row vu-history">
            <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'Recent:', pt: 'Recentes:' })}</span>
            {history.data.slice(0, 8).map(h => (
              <button key={h.path} className="chip" aria-pressed={h.path === result?.path} onClick={() => openSaved(h.path)} title={tx({ en: `checked ${relTime(h.scannedAt)}`, pt: `verificado ${relTime(h.scannedAt)}` })}>
                <span className="mono">{h.label.split('/').pop()}</span>
                {h.bySeverity.crítica + h.bySeverity.alta > 0 && <span className="count" style={{ color: 'var(--crit)' }}>{h.bySeverity.crítica + h.bySeverity.alta}</span>}
              </button>
            ))}
          </div>
        )}
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
      </section>

      {running && <SkeletonRows rows={5} height={40} />}
      {!running && !result && (
        <div className="card">
          <Empty icon={ShieldCheck} title={tx({ en: 'Choose a project', pt: 'Escolha um projeto' })}>
            {tx({
              en: 'The panel looks for package.json and pom.xml up to 4 levels below the folder, uses the exact version from package-lock.json when there is one, and queries OSV and the public registries.',
              pt: 'O painel procura package.json e pom.xml até 4 níveis abaixo da pasta, usa a versão exata do package-lock.json quando existe e consulta a OSV e os registries públicos.',
            })}
          </Empty>
        </div>
      )}
      {!running && result && <Result result={result} onRescan={() => run(result.path)} />}

      <TrivyPanel available={status.data?.trivy ?? null} path={result?.path ?? null} />
    </Page>
  )
}

function Result({ result, onRescan }: { result: ScanResult; onRescan: () => void }) {
  const outdated = result.dependencies.filter(d => (d.majorsBehind ?? 0) > 0).length
  const unknown = result.dependencies.filter(d => !d.version).length
  return (
    <>
      <div className="grid" style={{ ['--min' as string]: '140px' }}>
        {SEVERITIES.slice(0, 4).map(s => (
          <div key={s} className="stat">
            <span className="eyebrow">{SEVERITY_LABEL[s]}</span>
            <b style={{ color: result.bySeverity[s] ? (s === 'crítica' || s === 'alta' ? 'var(--crit)' : 'var(--warn)') : undefined }}>{result.bySeverity[s]}</b>
            <small>{tx({ en: 'known flaws', pt: 'falhas conhecidas' })}</small>
          </div>
        ))}
        <div className="stat"><span className="eyebrow">{tx({ en: 'Outdated', pt: 'Desatualizadas' })}</span><b>{outdated}</b><small>{tx({ en: 'one or more major versions behind', pt: 'uma ou mais versões major atrás' })}</small></div>
      </div>
      <div className="row muted" style={{ fontSize: 12.5 }}>
        <span>{tx({
          en: `${result.dependencies.length} dependencies in ${result.files.length} file(s) · checked ${relTime(result.scannedAt)}`,
          pt: `${result.dependencies.length} dependências em ${result.files.length} arquivo(s) · verificado ${relTime(result.scannedAt)}`,
        })}</span>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={onRescan}>{tx({ en: 'Check again', pt: 'Verificar de novo' })}</button>
      </div>
      {unknown > 0 && (
        <div className="callout callout-info" style={{ fontSize: 12.5 }}>
          {tx({
            en: `${unknown} dependency(ies) without an exact version (a range with no lockfile, or a version inherited from the parent/BOM): they were not queried. The trivy scan resolves the real versions.`,
            pt: `${unknown} dependência(s) sem versão exata (range sem lockfile ou versão herdada do parent/BOM): elas não foram consultadas. A varredura do trivy resolve as versões reais.`,
          })}
        </div>
      )}
      {result.errors.map(e => <div key={e} className="callout callout-warn" style={{ fontSize: 12.5 }}>{e}</div>)}
      <DependencyTable dependencies={result.dependencies} />
    </>
  )
}
