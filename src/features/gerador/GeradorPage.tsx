import './gerador.css'
import { Building2, Dices, Fingerprint, IdCard, MapPin, User, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { CopyButton, Page } from '@/ui'
import { UFS, generate, type Kind, type Result } from './generate'

type CardSpec = { kind: Kind; icon: LucideIcon; title: string; description: string; estado?: boolean; alfanumerico?: boolean }

const CARDS: CardSpec[] = [
  { kind: 'pessoa', icon: User, title: 'Pessoa completa', description: 'Nome, CPF, idade e endereço coerentes entre si.', estado: true },
  { kind: 'cpf', icon: Fingerprint, title: 'CPF', description: 'Dígitos verificadores válidos; o 9º dígito segue a região fiscal do estado.', estado: true },
  { kind: 'cnpj', icon: IdCard, title: 'CNPJ', description: 'Numérico ou no novo formato alfanumérico.', alfanumerico: true },
  { kind: 'nome', icon: User, title: 'Nome', description: 'Nome e sobrenomes com gênero.' },
  { kind: 'endereco', icon: MapPin, title: 'Endereço', description: 'Logradouro, bairro, cidade e CEP.', estado: true },
  { kind: 'empresa', icon: Building2, title: 'Empresa completa', description: 'Razão social, CNPJ, CNAE, porte e endereço.', estado: true, alfanumerico: true },
]

const LABELS: Record<string, string> = {
  cpf: 'CPF', cpf_formatado: 'CPF formatado', cnpj: 'CNPJ', cnpj_formatado: 'CNPJ formatado', estado: 'Estado', estado_nome: 'Nome do estado',
  estado_cpf: 'Estado do CPF', tipo: 'Tipo', nome_completo: 'Nome completo',
  genero: 'Gênero', idade: 'Idade', endereco: 'Endereço', bairro: 'Bairro', cidade: 'Cidade', cep: 'CEP', razao_social: 'Razão social',
  nome_fantasia: 'Nome fantasia', porte: 'Porte', regime_tributario: 'Regime tributário', situacao: 'Situação', data_abertura: 'Data de abertura',
  capital_social: 'Capital social', cnae_codigo: 'CNAE', cnae_descricao: 'Descrição do CNAE',
}

export default function GeradorPage() {
  return (
    <Page title="Gerador de dados" hint="Massa de teste brasileira válida, gerada na sua máquina. Documentos passam na validação, mas não pertencem a ninguém.">
      <div className="gerador-grid">
        {CARDS.map(c => <GeneratorCard key={c.kind} spec={c} />)}
      </div>
    </Page>
  )
}

function GeneratorCard({ spec }: { spec: CardSpec }) {
  const [estado, setEstado] = useState('')
  const [alfanumerico, setAlfanumerico] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const Icon = spec.icon

  const run = () => setResult(generate(spec.kind, { estado: estado || null, alfanumerico }))

  const all = result ? Object.entries(result).map(([k, v]) => `${LABELS[k] ?? k}: ${v}`).join('\n') : ''

  return (
    <section className="card">
      <div className="card-head">
        <Icon size={16} color="var(--signal)" />
        <div className="stack spacer" style={{ ['--gap' as string]: '0' }}>
          <div className="card-title">{spec.title}</div>
          <small className="muted">{spec.description}</small>
        </div>
      </div>
      <div className="card-pad stack" style={{ ['--gap' as string]: '10px' }}>
        <div className="row">
          {spec.estado && (
            <select className="select" value={estado} onChange={e => setEstado(e.target.value)} title="Estado dos dados gerados">
              <option value="">qualquer estado</option>
              {UFS.map(uf => <option key={uf}>{uf}</option>)}
            </select>
          )}
          {spec.alfanumerico && (
            <label className="row" style={{ ['--gap' as string]: '6px', fontSize: 12.5 }} title="Novo formato da Receita, com letras na raiz do CNPJ">
              <input type="checkbox" checked={alfanumerico} onChange={e => setAlfanumerico(e.target.checked)} /> alfanumérico
            </label>
          )}
          <div className="spacer" />
          {result && <CopyButton value={all} label="copiar tudo" />}
          <button className="btn" onClick={run}>
            <Dices size={14} /> {result ? 'Gerar outro' : 'Gerar'}
          </button>
        </div>
        {result && (
          <dl className="gen-fields">
            {Object.entries(result).map(([k, v]) => (
              <div key={k} className="gen-field">
                <dt>{LABELS[k] ?? k}</dt>
                <dd className="mono">{v}</dd>
                <CopyButton value={v} />
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}
