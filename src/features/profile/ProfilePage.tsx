import { Download, FileUp, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Empty, Page, useToast } from '@/ui'
import { api } from '@/lib/api'

type Plan = {
  doctor: { changed: string[] }
  repos: { add: { label: string; url: string; tokenSource: string }[]; existing: string[]; invalid: string[] }
  roots: { add: string[]; missing: string[]; existing: string[] }
  activations: { kind: string; slug: string; agents: string[]; foundLocally: boolean }[]
}

const FIELD_LABEL: Record<string, string> = {
  mavenRegistries: 'registries Maven', npmScopes: 'escopos npm', urls: 'endereços de rede',
  javaVersions: 'versões de Java', mavenVersions: 'versões de Maven', nodeVersions: 'versões de Node',
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<unknown>(null)
  const [fileName, setFileName] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [parts, setParts] = useState({ doctor: true, repos: true, roots: true })
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const toast = useToast()

  const load = async (file: File) => {
    setError(null)
    setPlan(null)
    setFileName(file.name)
    try {
      const parsed = JSON.parse(await file.text())
      setProfile(parsed)
      setPlan(await api.post<Plan>('/profile/preview', { profile: parsed }))
    } catch (e) {
      setError(e instanceof SyntaxError ? 'o arquivo não é um JSON válido' : (e as Error).message)
    }
  }

  const apply = async () => {
    setApplying(true)
    try {
      await api.post('/profile/apply', { profile, parts })
      toast('Perfil importado')
      setPlan(await api.post<Plan>('/profile/preview', { profile }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  const nothing = plan && !plan.doctor.changed.length && !plan.repos.add.length && !plan.roots.add.length

  return (
    <Page
      title="Perfil de equipe"
      hint="Leve a sua configuração para outra pessoa (ou outra máquina): versões e registries do Máquina, conexões de repositório e o que está ativo no Catálogo. Token nunca vai no arquivo."
    >
      <section className="card card-pad stack">
        <div className="row">
          <div className="spacer">
            <b>Exportar</b>
            <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>
              Conexões com token digitado saem como "sem token"; o workspace sai com <span className="mono">~</span> para valer em outra home.
            </p>
          </div>
          <a className="btn btn-primary" href="/api/profile/export" download><Download size={14} /> Baixar perfil</a>
        </div>
      </section>

      <section className="card card-pad stack">
        <div className="row">
          <div className="spacer">
            <b>Importar</b>
            <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>O painel mostra o que vai mudar antes de aplicar. Nada é instalado nem ativado sozinho.</p>
          </div>
          <label className="btn">
            <FileUp size={14} /> Escolher arquivo
            <input type="file" accept=".json,application/json" hidden onChange={e => e.target.files?.[0] && load(e.target.files[0])} />
          </label>
        </div>
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
      </section>

      {!plan && !error && (
        <div className="card"><Empty icon={Users} title="Nenhum perfil carregado">Peça o arquivo a quem já trabalha com a configuração certa.</Empty></div>
      )}

      {plan && (
        <section className="card">
          <div className="card-head"><div className="card-title spacer">O que muda com <span className="mono">{fileName}</span></div></div>
          <div className="card-pad stack">
            <Part
              checked={parts.doctor} onChange={v => setParts({ ...parts, doctor: v })} disabled={!plan.doctor.changed.length}
              title="Verificações do Máquina"
              detail={plan.doctor.changed.length ? `substitui: ${plan.doctor.changed.map(f => FIELD_LABEL[f] ?? f).join(', ')}` : 'igual ao que você já tem'}
            />
            <Part
              checked={parts.repos} onChange={v => setParts({ ...parts, repos: v })} disabled={!plan.repos.add.length}
              title="Conexões de repositório"
              detail={plan.repos.add.length ? `adiciona: ${plan.repos.add.map(r => r.label).join(', ')}` : 'nenhuma conexão nova'}
              extra={[
                ...(plan.repos.existing.length ? [`já existem: ${plan.repos.existing.join(', ')}`] : []),
                ...plan.repos.invalid.map(i => `ignorada: ${i}`),
                ...(plan.repos.add.some(r => r.tokenSource === 'none') ? ['conexões sem token: configure o token depois na tela Repositórios'] : []),
              ]}
            />
            <Part
              checked={parts.roots} onChange={v => setParts({ ...parts, roots: v })} disabled={!plan.roots.add.length}
              title="Pastas do Catálogo"
              detail={plan.roots.add.length ? `adiciona: ${plan.roots.add.join(', ')}` : 'nenhuma pasta nova'}
              extra={plan.roots.missing.length ? [`não existem nesta máquina (clone antes): ${plan.roots.missing.join(', ')}`] : []}
            />
            {plan.activations.length > 0 && (
              <div className="callout callout-info" style={{ fontSize: 12.5, display: 'block' }}>
                <b>Itens ativos no perfil</b> (ative na tela <Link to="/catalogo">Catálogo</Link>; o painel não escreve nas configurações dos agentes sozinho):
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {plan.activations.map(a => (
                    <li key={`${a.kind}/${a.slug}`}><span className="mono">{a.kind}/{a.slug}</span> em {a.agents.join(', ')}{!a.foundLocally && <span className="muted"> · não encontrado nas suas pastas</span>}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="row">
              <div className="spacer" />
              <button className="btn btn-primary" disabled={Boolean(nothing) || applying} onClick={apply}>{applying ? 'Importando…' : nothing ? 'Nada a importar' : 'Importar o selecionado'}</button>
            </div>
          </div>
        </section>
      )}
    </Page>
  )
}

type PartProps = { checked: boolean; onChange: (v: boolean) => void; disabled: boolean; title: string; detail: string; extra?: string[] }

function Part({ checked, onChange, disabled, title, detail, extra = [] }: PartProps) {
  return (
    <label className="row" style={{ alignItems: 'flex-start', opacity: disabled ? 0.6 : 1 }}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ marginTop: 3 }} />
      <div className="spacer">
        <b style={{ fontSize: 13.5 }}>{title}</b>
        <div className="muted" style={{ fontSize: 12.5 }}>{detail}</div>
        {extra.map(x => <div key={x} className="muted" style={{ fontSize: 12 }}>{x}</div>)}
      </div>
    </label>
  )
}
