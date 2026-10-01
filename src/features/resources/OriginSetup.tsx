import { CheckCircle2, FolderTree, GitBranch } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Empty, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { fetchRepoSources, saveConfig, testConfig, type ResourcesConfig } from './api'

type Props = { current: ResourcesConfig | null; onSaved: () => void; onCancel?: () => void }

// Escolhe de onde ler os manifests: uma conexão GitLab e o grupo cujos subgrupos viram a lista.
export function OriginSetup({ current, onSaved, onCancel }: Props) {
  const sources = useAsync(fetchRepoSources)
  const gitlab = (sources.data ?? []).filter(s => s.provider === 'gitlab')
  const hasGithubOnly = (sources.data ?? []).length > 0 && gitlab.length === 0
  const [sourceId, setSourceId] = useState(current?.sourceId ?? '')
  const [groupPath, setGroupPath] = useState(current?.groupPath ?? '')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const chosen = sourceId || gitlab[0]?.id || ''

  const run = async (save: boolean) => {
    setBusy(true)
    setResult(null)
    try {
      const r = save ? await saveConfig({ sourceId: chosen, groupPath }) : await testConfig({ sourceId: chosen, groupPath })
      setResult({ ok: true, text: `${r.groupPath}: ${r.clients} subgrupo(s) encontrado(s)` })
      if (save) {
        toast('Origem salva')
        onSaved()
      }
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (sources.data && gitlab.length === 0) {
    return (
      <div className="card">
        <Empty icon={GitBranch} title="Nenhuma conexão GitLab" action={<Link className="btn btn-primary" to="/repositorios">Criar conexão em Repositórios</Link>}>
          {hasGithubOnly
            ? 'Só há conexões GitHub. Esta tela lê manifests em grupos do GitLab, então precisa de uma conexão GitLab.'
            : 'Esta tela usa uma conexão da tela Repositórios para ler os manifests. Crie uma conexão GitLab lá e volte aqui.'}
        </Empty>
      </div>
    )
  }

  return (
    <section className="card card-pad stack">
      <div className="row"><FolderTree size={16} /><b>De onde ler os manifests</b></div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Escolha um grupo do GitLab. Cada subgrupo direto dele vira um item da lista; cada projeto dentro do subgrupo é uma stack, cujos YAML
        são lidos para mostrar requests, limits e flags da JVM. Projetos soltos no próprio grupo também entram.
      </p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field">
          <span>Conexão GitLab</span>
          <select className="select" value={chosen} onChange={e => setSourceId(e.target.value)}>
            {gitlab.map(s => <option key={s.id} value={s.id}>{s.label} ({s.url.replace('https://', '')})</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: 1, minWidth: 260 }}>
          <span>Grupo</span>
          <input className="input mono" value={groupPath} onChange={e => setGroupPath(e.target.value)} placeholder="minha-org/ambientes (ou cole a URL do grupo)" />
        </label>
        <button className="btn" disabled={busy || !chosen || !groupPath.trim()} onClick={() => run(false)} title="Confere o grupo e conta os subgrupos, sem salvar">Testar</button>
        <button className="btn btn-primary" disabled={busy || !chosen || !groupPath.trim()} onClick={() => run(true)}>Salvar</button>
        {onCancel && <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>}
      </div>
      {result && (
        <div className={`callout ${result.ok ? 'callout-info' : 'callout-crit'}`} style={{ fontSize: 12.5 }}>
          {result.ok && <CheckCircle2 size={15} />}{result.text}
        </div>
      )}
    </section>
  )
}
