import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Modal, SkeletonRows, useToast } from '@/ui'
import { fetchConfig, saveConfig, type DoctorConfig } from './api'

// Cadastro do que é específico do seu contexto. Fica em ~/.workstuff; o código não presume empresa nenhuma.
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
      toast('Verificações salvas; rodando o diagnóstico de novo')
      onSaved()
      onClose()
    } catch (e) {
      toast(`Não salvou: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof DoctorConfig>(k: K, v: DoctorConfig[K]) => setCfg(c => c && { ...c, [k]: v })

  return (
    <Modal
      title="Personalizar verificações"
      onClose={onClose}
      width={720}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!cfg || saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</button></>}
    >
      {!cfg ? <SkeletonRows rows={4} /> : (
        <div className="stack" style={{ ['--gap' as string]: '18px' }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            O que é do seu contexto (repositórios privados, endereços internos, versões dos seus projetos) fica salvo em
            <code className="inline">~/.workstuff/doctor-config.json</code>. Os servidores Git de cada conexão da tela{' '}
            <Link to="/repositorios" onClick={onClose}>Repositórios</Link> já entram no teste de rede e de SSH sozinhos.
          </p>

          <Section title="Repositórios Maven privados" hint="Cada um vira uma verificação: o ~/.m2/settings.xml precisa conter o texto informado (normalmente o host do repositório).">
            <Pairs rows={cfg.mavenRegistries.map(r => [r.label, r.match])} labels={['Nome', 'Texto no settings.xml']} placeholders={['Nexus da empresa', 'nexus.exemplo.com']}
              onChange={rows => set('mavenRegistries', rows.map(([label, match]) => ({ label, match })))} />
          </Section>

          <Section title="Escopos npm privados" hint="O ~/.npmrc precisa ter <escopo>:registry configurado.">
            <List values={cfg.npmScopes} placeholder="@minha-empresa" onChange={v => set('npmScopes', v)} />
          </Section>

          <Section title="Endereços que precisam responder" hint="VPN, proxy, serviços internos: o painel testa se cada um responde.">
            <Pairs rows={cfg.urls.map(u => [u.label, u.url])} labels={['Nome', 'URL']} placeholders={['Intranet', 'https://intranet.exemplo.com']}
              onChange={rows => set('urls', rows.map(([label, url]) => ({ label, url })))} />
          </Section>

          <Section title="Versões exigidas" hint="Java e Maven pelo identificador do SDKMAN (sdk list java); Node pelo número principal. A correção sugerida instala exatamente essa versão.">
            <div className="grid" style={{ ['--min' as string]: '200px' }}>
              <label className="field"><span>Java</span><List values={cfg.javaVersions} placeholder="21.0.8-zulu" onChange={v => set('javaVersions', v)} /></label>
              <label className="field"><span>Maven</span><List values={cfg.mavenVersions} placeholder="3.9.6" onChange={v => set('mavenVersions', v)} /></label>
              <label className="field"><span>Node</span><List values={cfg.nodeVersions} placeholder="22" onChange={v => set('nodeVersions', v)} /></label>
            </div>
            {defaults && (
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setCfg(c => c && { ...c, javaVersions: defaults.javaVersions, mavenVersions: defaults.mavenVersions, nodeVersions: defaults.nodeVersions })}>
                Voltar às versões padrão
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
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onChange(values.filter((_, j) => j !== i))} title="Remover"><Trash2 size={13} /></button>
        </div>
      ))}
      <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...values, ''])}><Plus size={13} /> Adicionar</button>
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
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onChange(rows.filter((_, j) => j !== i))} title="Remover"><Trash2 size={13} /></button>
        </div>
      ))}
      <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...rows, ['', '']])}><Plus size={13} /> Adicionar</button>
    </div>
  )
}
