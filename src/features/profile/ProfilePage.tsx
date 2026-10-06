import { Download, FileUp, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Empty, Page, useToast } from '@/ui'
import { api } from '@/lib/api'
import { tx } from '@/lib/i18n'

type Plan = {
  doctor: { changed: string[] }
  repos: { add: { label: string; url: string; tokenSource: string }[]; existing: string[]; invalid: string[] }
  roots: { add: string[]; missing: string[]; existing: string[] }
  activations: { kind: string; slug: string; agents: string[]; foundLocally: boolean }[]
}

const FIELD_LABEL: Record<string, string> = tx({
  en: {
    mavenRegistries: 'Maven registries', npmScopes: 'npm scopes', urls: 'network addresses',
    javaVersions: 'Java versions', mavenVersions: 'Maven versions', nodeVersions: 'Node versions',
  },
  pt: {
    mavenRegistries: 'registries Maven', npmScopes: 'escopos npm', urls: 'endereços de rede',
    javaVersions: 'versões de Java', mavenVersions: 'versões de Maven', nodeVersions: 'versões de Node',
  },
})

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
      setError(e instanceof SyntaxError ? tx({ en: 'the file is not valid JSON', pt: 'o arquivo não é um JSON válido' }) : (e as Error).message)
    }
  }

  const apply = async () => {
    setApplying(true)
    try {
      await api.post('/profile/apply', { profile, parts })
      toast(tx({ en: 'Profile imported', pt: 'Perfil importado' }))
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
      title={tx({ en: 'Team profile', pt: 'Perfil de equipe' })}
      hint={tx({ en: "Take your setup to someone else (or another machine): Machine versions and registries, repository connections and what is active in the Catalog. Tokens never go in the file.", pt: 'Leve a sua configuração para outra pessoa (ou outra máquina): versões e registries do Máquina, conexões de repositório e o que está ativo no Catálogo. Token nunca vai no arquivo.' })}
    >
      <section className="card card-pad stack">
        <div className="row">
          <div className="spacer">
            <b>{tx({ en: 'Export', pt: 'Exportar' })}</b>
            <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>
              {tx({
                en: <>Connections with a typed token go out as "no token"; the workspace goes out with <span className="mono">~</span> so it works in another home.</>,
                pt: <>Conexões com token digitado saem como "sem token"; o workspace sai com <span className="mono">~</span> para valer em outra home.</>,
              })}
            </p>
          </div>
          <a className="btn btn-primary" href="/api/profile/export" download><Download size={14} /> {tx({ en: 'Download profile', pt: 'Baixar perfil' })}</a>
        </div>
      </section>

      <section className="card card-pad stack">
        <div className="row">
          <div className="spacer">
            <b>{tx({ en: 'Import', pt: 'Importar' })}</b>
            <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>{tx({ en: 'The panel shows what will change before applying. Nothing is installed or activated on its own.', pt: 'O painel mostra o que vai mudar antes de aplicar. Nada é instalado nem ativado sozinho.' })}</p>
          </div>
          <label className="btn">
            <FileUp size={14} /> {tx({ en: 'Choose file', pt: 'Escolher arquivo' })}
            <input type="file" accept=".json,application/json" hidden onChange={e => e.target.files?.[0] && load(e.target.files[0])} />
          </label>
        </div>
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
      </section>

      {!plan && !error && (
        <div className="card"><Empty icon={Users} title={tx({ en: 'No profile loaded', pt: 'Nenhum perfil carregado' })}>{tx({ en: 'Ask for the file from someone who already works with the right setup.', pt: 'Peça o arquivo a quem já trabalha com a configuração certa.' })}</Empty></div>
      )}

      {plan && (
        <section className="card">
          <div className="card-head"><div className="card-title spacer">{tx({ en: 'What changes with ', pt: 'O que muda com ' })}<span className="mono">{fileName}</span></div></div>
          <div className="card-pad stack">
            <Part
              checked={parts.doctor} onChange={v => setParts({ ...parts, doctor: v })} disabled={!plan.doctor.changed.length}
              title={tx({ en: 'Machine checks', pt: 'Verificações do Máquina' })}
              detail={plan.doctor.changed.length
                ? tx({ en: 'replaces: ', pt: 'substitui: ' }) + plan.doctor.changed.map(f => FIELD_LABEL[f] ?? f).join(', ')
                : tx({ en: 'same as what you already have', pt: 'igual ao que você já tem' })}
            />
            <Part
              checked={parts.repos} onChange={v => setParts({ ...parts, repos: v })} disabled={!plan.repos.add.length}
              title={tx({ en: 'Repository connections', pt: 'Conexões de repositório' })}
              detail={plan.repos.add.length
                ? tx({ en: 'adds: ', pt: 'adiciona: ' }) + plan.repos.add.map(r => r.label).join(', ')
                : tx({ en: 'no new connection', pt: 'nenhuma conexão nova' })}
              extra={[
                ...(plan.repos.existing.length ? [tx({ en: 'already exist: ', pt: 'já existem: ' }) + plan.repos.existing.join(', ')] : []),
                ...plan.repos.invalid.map(i => tx({ en: 'ignored: ', pt: 'ignorada: ' }) + i),
                ...(plan.repos.add.some(r => r.tokenSource === 'none') ? [tx({ en: 'connections without a token: set the token later on the Repositories screen', pt: 'conexões sem token: configure o token depois na tela Repositórios' })] : []),
              ]}
            />
            <Part
              checked={parts.roots} onChange={v => setParts({ ...parts, roots: v })} disabled={!plan.roots.add.length}
              title={tx({ en: 'Catalog folders', pt: 'Pastas do Catálogo' })}
              detail={plan.roots.add.length
                ? tx({ en: 'adds: ', pt: 'adiciona: ' }) + plan.roots.add.join(', ')
                : tx({ en: 'no new folder', pt: 'nenhuma pasta nova' })}
              extra={plan.roots.missing.length ? [tx({ en: 'do not exist on this machine (clone them first): ', pt: 'não existem nesta máquina (clone antes): ' }) + plan.roots.missing.join(', ')] : []}
            />
            {plan.activations.length > 0 && (
              <div className="callout callout-info" style={{ fontSize: 12.5, display: 'block' }}>
                {tx({
                  en: <><b>Items active in the profile</b> (activate them on the <Link to="/catalogo">Catalog</Link> screen; the panel does not write the agents' settings on its own):</>,
                  pt: <><b>Itens ativos no perfil</b> (ative na tela <Link to="/catalogo">Catálogo</Link>; o painel não escreve nas configurações dos agentes sozinho):</>,
                })}
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {plan.activations.map(a => (
                    <li key={`${a.kind}/${a.slug}`}><span className="mono">{a.kind}/{a.slug}</span> {tx({ en: 'in', pt: 'em' })} {a.agents.join(', ')}{!a.foundLocally && <span className="muted">{tx({ en: ' · not found in your folders', pt: ' · não encontrado nas suas pastas' })}</span>}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="row">
              <div className="spacer" />
              <button className="btn btn-primary" disabled={Boolean(nothing) || applying} onClick={apply}>{applying ? tx({ en: 'Importing…', pt: 'Importando…' }) : nothing ? tx({ en: 'Nothing to import', pt: 'Nada a importar' }) : tx({ en: 'Import selected', pt: 'Importar o selecionado' })}</button>
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
