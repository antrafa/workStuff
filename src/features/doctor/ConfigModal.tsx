import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Modal, SkeletonRows, useToast } from '@/ui'
import { tx } from '@/lib/i18n'
import { fetchConfig, saveConfig, type DoctorConfig } from './api'

// What is specific to your context. Lives in ~/.workstuff; the code assumes no company.
export function ConfigModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [cfg, setCfg] = useState<DoctorConfig | null>(null)
  const [defaults, setDefaults] = useState<DoctorConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => {
    fetchConfig().then(r => (setCfg(r.config), setDefaults(r.defaults))).catch(e => toast((e as Error).message))
  }, [toast])

  const save = async () => {
    if (!cfg) return
    setSaving(true)
    try {
      await saveConfig(cfg)
      toast(tx({ en: 'Checks saved; running the diagnosis again', pt: 'Verificações salvas; rodando o diagnóstico de novo' }))
      onSaved()
      onClose()
    } catch (e) {
      toast(tx({ en: `Not saved: ${(e as Error).message}`, pt: `Não salvou: ${(e as Error).message}` }))
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof DoctorConfig>(k: K, v: DoctorConfig[K]) => setCfg(c => c && { ...c, [k]: v })

  return (
    <Modal
      title={tx({ en: 'Customize checks', pt: 'Personalizar verificações' })}
      onClose={onClose}
      width={720}
      footer={<><button className="btn" onClick={onClose}>{tx({ en: 'Cancel', pt: 'Cancelar' })}</button><button className="btn btn-primary" disabled={!cfg || saving} onClick={save}>{saving ? tx({ en: 'Saving…', pt: 'Salvando…' }) : tx({ en: 'Save', pt: 'Salvar' })}</button></>}
    >
      {!cfg ? <SkeletonRows rows={4} /> : (
        <div className="stack" style={{ ['--gap' as string]: '18px' }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {tx({
              en: <>What belongs to your context (private repositories, internal addresses, your projects' versions) is saved in{' '}
                <code className="inline">~/.workstuff/doctor-config.json</code>. The Git servers of every connection on the{' '}
                <Link to="/repositorios" onClick={onClose}>Repositories</Link> screen are added to the network and SSH checks on their own.</>,
              pt: <>O que é do seu contexto (repositórios privados, endereços internos, versões dos seus projetos) fica salvo em
                <code className="inline">~/.workstuff/doctor-config.json</code>. Os servidores Git de cada conexão da tela{' '}
                <Link to="/repositorios" onClick={onClose}>Repositórios</Link> já entram no teste de rede e de SSH sozinhos.</>,
            })}
          </p>

          <Section title={tx({ en: 'Private Maven repositories', pt: 'Repositórios Maven privados' })} hint={tx({ en: 'Each becomes a check: ~/.m2/settings.xml must contain the given text (usually the repository host).', pt: 'Cada um vira uma verificação: o ~/.m2/settings.xml precisa conter o texto informado (normalmente o host do repositório).' })}>
            <Pairs rows={cfg.mavenRegistries.map(r => [r.label, r.match])} labels={[tx({ en: 'Name', pt: 'Nome' }), tx({ en: 'Text in settings.xml', pt: 'Texto no settings.xml' })]} placeholders={[tx({ en: 'Company Nexus', pt: 'Nexus da empresa' }), 'nexus.exemplo.com']}
              onChange={rows => set('mavenRegistries', rows.map(([label, match]) => ({ label, match })))} />
          </Section>

          <Section title={tx({ en: 'Private npm scopes', pt: 'Escopos npm privados' })} hint={tx({ en: '~/.npmrc must have <scope>:registry set.', pt: 'O ~/.npmrc precisa ter <escopo>:registry configurado.' })}>
            <List values={cfg.npmScopes} placeholder={tx({ en: '@my-company', pt: '@minha-empresa' })} onChange={v => set('npmScopes', v)} />
          </Section>

          <Section title={tx({ en: 'Addresses that must respond', pt: 'Endereços que precisam responder' })} hint={tx({ en: 'VPN, proxy, internal services: the panel tests whether each one responds.', pt: 'VPN, proxy, serviços internos: o painel testa se cada um responde.' })}>
            <Pairs rows={cfg.urls.map(u => [u.label, u.url])} labels={[tx({ en: 'Name', pt: 'Nome' }), 'URL']} placeholders={['Intranet', 'https://intranet.exemplo.com']}
              onChange={rows => set('urls', rows.map(([label, url]) => ({ label, url })))} />
          </Section>

          <Section title={tx({ en: 'Required versions', pt: 'Versões exigidas' })} hint={tx({ en: 'Java and Maven by their SDKMAN identifier (sdk list java); Node by its major number. The suggested fix installs exactly that version.', pt: 'Java e Maven pelo identificador do SDKMAN (sdk list java); Node pelo número principal. A correção sugerida instala exatamente essa versão.' })}>
            <div className="grid" style={{ ['--min' as string]: '200px' }}>
              <label className="field"><span>Java</span><List values={cfg.javaVersions} placeholder="21.0.8-zulu" onChange={v => set('javaVersions', v)} /></label>
              <label className="field"><span>Maven</span><List values={cfg.mavenVersions} placeholder="3.9.6" onChange={v => set('mavenVersions', v)} /></label>
              <label className="field"><span>Node</span><List values={cfg.nodeVersions} placeholder="22" onChange={v => set('nodeVersions', v)} /></label>
            </div>
            {defaults && (
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setCfg(c => c && { ...c, javaVersions: defaults.javaVersions, mavenVersions: defaults.mavenVersions, nodeVersions: defaults.nodeVersions })}>
                {tx({ en: 'Back to the default versions', pt: 'Voltar às versões padrão' })}
              </button>
            )}
          </Section>
        </div>
      )}
    </Modal>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="stack" style={{ ['--gap' as string]: '6px' }}>
      <b style={{ fontSize: 13.5 }}>{title}</b>
      <small className="muted">{hint}</small>
      {children}
    </section>
  )
}

function List({ values, placeholder, onChange }: { values: string[]; placeholder: string; onChange: (v: string[]) => void }) {
  return (
    <div className="stack" style={{ ['--gap' as string]: '6px' }}>
      {values.map((v, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input mono" style={{ flex: 1 }} value={v} placeholder={placeholder} onChange={e => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onChange(values.filter((_, j) => j !== i))} title={tx({ en: 'Remove', pt: 'Remover' })}><Trash2 size={13} /></button>
        </div>
      ))}
      <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...values, ''])}><Plus size={13} /> {tx({ en: 'Add', pt: 'Adicionar' })}</button>
    </div>
  )
}

function Pairs({ rows, labels, placeholders, onChange }: { rows: [string, string][]; labels: [string, string]; placeholders: [string, string]; onChange: (rows: [string, string][]) => void }) {
  const edit = (i: number, k: 0 | 1, v: string) => onChange(rows.map((r, j) => (j === i ? (k === 0 ? [v, r[1]] : [r[0], v]) : r)))
  return (
    <div className="stack" style={{ ['--gap' as string]: '6px' }}>
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input" style={{ flex: 1 }} value={r[0]} placeholder={placeholders[0]} aria-label={labels[0]} onChange={e => edit(i, 0, e.target.value)} />
          <input className="input mono" style={{ flex: 2 }} value={r[1]} placeholder={placeholders[1]} aria-label={labels[1]} onChange={e => edit(i, 1, e.target.value)} />
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onChange(rows.filter((_, j) => j !== i))} title={tx({ en: 'Remove', pt: 'Remover' })}><Trash2 size={13} /></button>
        </div>
      ))}
      <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...rows, ['', '']])}><Plus size={13} /> {tx({ en: 'Add', pt: 'Adicionar' })}</button>
    </div>
  )
}
