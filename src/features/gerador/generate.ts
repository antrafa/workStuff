// Gerador de dados brasileiros de teste, no navegador.
// Mesmos tipos, mesmas listas e as mesmas chaves de saída de bin/generate.sh.
// Imports relativos (sem '@/') para o autoteste rodar direto no node: scripts/check-gerador.ts.
import { ATIVIDADES_EMPRESARIAIS, NOMES_EMPRESAS, SUFIXOS_EMPRESAS } from './data/empresas.ts'
import { BAIRROS, CIDADES, ESTADOS, NOMES_RUAS, TIPOS_LOGRADOURO } from './data/enderecos.ts'
import { NOMES_FEMININOS, NOMES_MASCULINOS, SOBRENOMES } from './data/nomes.ts'

export const UFS = ESTADOS.map(e => e.uf).sort()

export type Kind = 'pessoa' | 'cpf' | 'cnpj' | 'nome' | 'endereco' | 'empresa'
export type Options = { estado: string | null; alfanumerico: boolean }
export type Result = Record<string, string>

const between = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const pick = <T,>(list: readonly T[]) => list[between(0, list.length - 1)]
const pad = (n: number, size: number) => String(n).padStart(size, '0')

// Sorteio ponderado: [valor, peso] com pesos somando 100.
function weighted<T>(options: [T, number][]): T {
  let roll = between(1, 100)
  for (const [value, weight] of options) {
    roll -= weight
    if (roll <= 0) return value
  }
  return options[0][0]
}

function checkDigit(values: number[], weights: number[]) {
  const rest = values.reduce((sum, v, i) => sum + v * weights[i], 0) % 11
  return rest < 2 ? 0 : 11 - rest
}

// ── CPF ── o 9º dígito indica a região fiscal de emissão (índice = dígito).
// Tabela oficial da Receita; a do Bash repetia BA/SE em 4 e 5, punha BA no 6 e não tinha MG nem RN.
const CPF_REGIONS: string[][] = [
  ['RS'], ['DF', 'GO', 'MS', 'MT', 'TO'], ['AC', 'AM', 'AP', 'PA', 'RO', 'RR'], ['CE', 'MA', 'PI'],
  ['AL', 'PB', 'PE', 'RN'], ['BA', 'SE'], ['MG'], ['ES', 'RJ'], ['SP'], ['PR', 'SC'],
]

export function cpf(estado: string | null = null) {
  const regions = CPF_REGIONS.flatMap((ufs, digit) => (estado && ufs.includes(estado) ? [digit] : []))
  const region = regions.length ? pick(regions) : between(0, 9)
  const base = [...Array.from({ length: 8 }, () => between(0, 9)), region]
  const d1 = checkDigit(base, [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = checkDigit([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  const raw = [...base, d1, d2].join('')
  return {
    raw,
    formatted: raw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
    // O Bash devolve o primeiro estado da região; quem pediu um estado recebe o que pediu.
    estado: regions.length ? estado! : CPF_REGIONS[region][0],
  }
}

// ── CNPJ ── alfanumérico (IN RFB 2.229/2024): cada caractere vale seu código ASCII − 48.
// O Bash original usava A=10 (ASCII − 55) e gerava DVs que a Receita rejeita; aqui segue a norma.
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function cnpj(alfanumerico: boolean) {
  const root = Array.from({ length: 8 }, () => (alfanumerico ? pick([...ALNUM]) : String(between(0, 9))))
  const base = [...root, '0', '0', '0', '1']
  const values = base.map(c => c.charCodeAt(0) - 48)
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const d1 = checkDigit(values, w1)
  const d2 = checkDigit([...values, d1], [6, ...w1])
  const raw = [...base, d1, d2].join('')
  return { raw, formatted: raw.replace(/(\w{2})(\w{3})(\w{3})(\w{4})(\d{2})/, '$1.$2.$3/$4-$5') }
}

const CNAES: [string, string][] = [
  ['4713-0', 'Lojas de variedades, exceto lojas de departamentos'],
  ['4711-3', 'Hipermercados'],
  ['5611-2', 'Restaurantes e outros estabelecimentos de serviços de alimentação e bebidas'],
  ['4744-0', 'Farmácias e drogarias'],
  ['8511-2', 'Educação infantil - creche'],
  ['8610-1', 'Atividades de atendimento hospitalar'],
  ['6201-5', 'Desenvolvimento de programas de computador sob encomenda'],
  ['4120-4', 'Construção de edifícios'],
  ['4530-7', 'Manutenção e reparação de automóveis'],
  ['9602-5', 'Cabeleireiros, manicure e pedicure'],
]

// ── Nomes ──
type Genero = 'M' | 'F'
const primeiro = (g: Genero) => pick(g === 'M' ? NOMES_MASCULINOS : NOMES_FEMININOS)

function distintos(gerar: () => string) {
  const a = gerar()
  let b = gerar()
  while (b === a) b = gerar()
  return [a, b]
}

// Simples, completo (2 sobrenomes) ou composto (2 nomes + 2 sobrenomes), como o gerar_nome_variado.
function nomeVariado() {
  const genero = pick<Genero>(['M', 'F'])
  const formato = between(0, 2)
  const nomes = formato === 2 ? distintos(() => primeiro(genero)) : [primeiro(genero)]
  const sobrenomes = formato === 0 ? [pick(SOBRENOMES)] : distintos(() => pick(SOBRENOMES))
  return { nome_completo: [...nomes, ...sobrenomes].join(' '), genero }
}

// ── Endereço ──
// Uma faixa contígua por UF, sempre dentro do território real (AM, DF e GO ficam com o maior bloco).
const CEP_RANGES: Record<string, [number, number]> = {
  SP: [1000, 19999], RJ: [20000, 28999], MG: [30000, 39999], PR: [80000, 87999], RS: [90000, 99999],
  BA: [40000, 48999], PE: [50000, 56999], CE: [60000, 63999], GO: [73700, 76799], SC: [88000, 89999],
  AL: [57000, 57999], AM: [69000, 69299], AP: [68900, 68999], AC: [69900, 69999], DF: [70000, 72799],
  ES: [29000, 29999], MA: [65000, 65999], MS: [79000, 79999], MT: [78000, 78899], PA: [66000, 68899],
  PB: [58000, 58999], PI: [64000, 64999], RN: [59000, 59999], RO: [76800, 76999], RR: [69300, 69399],
  SE: [49000, 49999], TO: [77000, 77999],
}

const COMPLEMENTOS = [
  'Apt 101', 'Apt 201', 'Apt 301', 'Apt 102', 'Apt 203', 'Casa 1', 'Casa 2', 'Casa A', 'Casa B',
  'Bloco A', 'Bloco B', 'Bloco C', 'Sala 101', 'Sala 201', 'Sala 301', 'Loja 1', 'Loja 2', 'Loja A',
  'Conjunto 1', 'Conjunto 2', 'Fundos', 'Frente', '', '', '',
]

export function cep(uf: string) {
  const [min, max] = CEP_RANGES[uf]
  return `${pad(between(min, max), 5)}-${pad(between(0, 999), 3)}`
}

function endereco(estado: string | null) {
  const info = ESTADOS.find(e => e.uf === estado) ?? pick(ESTADOS)
  const cidades = CIDADES.filter(([uf]) => uf === info.uf).map(([, cidade]) => cidade)
  const complemento = pick(COMPLEMENTOS)
  const logradouro = `${pick(TIPOS_LOGRADOURO)} ${pick(NOMES_RUAS)}, ${between(1, 9999)}`
  return {
    endereco: complemento ? `${logradouro}, ${complemento}` : logradouro,
    bairro: pick(BAIRROS),
    // AC e AP não têm cidades na lista original (o Bash devolvia "Cidade Não Encontrada"): usa a capital.
    cidade: cidades.length ? pick(cidades) : info.capital,
    estado: info.uf,
    estado_nome: info.nome,
    cep: cep(info.uf),
  }
}

// ── Empresa ──
const TIPOS_EMPRESA = ['LTDA', 'SA', 'EIRELI', 'MEI', 'SS', 'SCP']
type Porte = 'MEI' | 'ME' | 'EPP' | 'MEDIO' | 'GRANDE'
const PORTE_DESC: Record<Porte, string> = {
  MEI: 'Até 81.000', ME: 'Até 360.000', EPP: '360.001 a 4.800.000', MEDIO: '4.800.001 a 300.000.000', GRANDE: 'Acima de 300.000.000',
}
const CAPITAL: Record<Exclude<Porte, 'MEI'>, [number, number]> = {
  ME: [1000, 50000], EPP: [50000, 500000], MEDIO: [500000, 5000000], GRANDE: [5000000, 50000000],
}

const fantasia = () => {
  const base = pick(NOMES_EMPRESAS)
  const atividade = pick(ATIVIDADES_EMPRESARIAIS)
  return pick([base, `${base} ${atividade}`, `${atividade} ${base}`, `${base} ${pick(SUFIXOS_EMPRESAS)}`])
}

function razaoSocial(tipo: string) {
  const base = pick([
    () => `${primeiro(pick<Genero>(['M', 'F']))} ${pick(SOBRENOMES)}`,
    () => `${pick(SOBRENOMES)} & Cia`,
    fantasia,
    () => `${pick(NOMES_EMPRESAS)} ${pick(SUFIXOS_EMPRESAS)}`,
  ])()
  return `${base} ${tipo}`
}

function regime(porte: Porte) {
  if (porte === 'GRANDE') return 'Lucro Real'
  if (porte === 'MEDIO') return between(1, 100) <= 60 ? 'Lucro Presumido' : 'Lucro Real'
  return between(1, 100) <= 80 ? 'Simples Nacional' : 'Lucro Presumido'
}

function empresa(o: Options) {
  // Pesos dos comentários do Bash; lá o sorteio usava a ordem do array associativo e não os respeitava.
  const porte = weighted<Porte>([['MEI', 30], ['ME', 35], ['EPP', 25], ['MEDIO', 8], ['GRANDE', 2]])
  const situacao = weighted([['Ativa', 85], ['Suspensa', 5], ['Inapta', 5], ['Baixada', 4], ['Nula', 1]])
  const ano = new Date().getFullYear()
  const capital = porte === 'MEI' ? 1000 : between(...CAPITAL[porte])
  const [cnae_codigo, cnae_descricao] = pick(CNAES)
  const doc = cnpj(o.alfanumerico)
  const end = endereco(o.estado)
  return {
    razao_social: razaoSocial(pick(TIPOS_EMPRESA)),
    nome_fantasia: fantasia(),
    cnpj: doc.raw,
    cnpj_formatado: doc.formatted,
    porte: `${porte} (${PORTE_DESC[porte]})`,
    regime_tributario: regime(porte),
    situacao,
    data_abertura: `${pad(between(1, 28), 2)}/${pad(between(1, 12), 2)}/${between(ano - 50, ano - 1)}`,
    capital_social: `${capital.toLocaleString('pt-BR')},00`,
    cnae_codigo,
    cnae_descricao,
    endereco: end.endereco,
    bairro: end.bairro,
    cidade: end.cidade,
    estado: end.estado,
    cep: end.cep,
  }
}

function build(kind: Kind, o: Options): Result {
  switch (kind) {
    case 'cpf': {
      const doc = cpf(o.estado)
      return { cpf: doc.raw, cpf_formatado: doc.formatted, estado: doc.estado }
    }
    case 'cnpj': {
      const doc = cnpj(o.alfanumerico)
      const [cnae_codigo, cnae_descricao] = pick(CNAES)
      return { cnpj: doc.raw, cnpj_formatado: doc.formatted, tipo: 'MATRIZ', cnae_codigo, cnae_descricao }
    }
    case 'nome':
      return nomeVariado()
    case 'endereco':
      return endereco(o.estado)
    case 'empresa':
      return empresa(o)
    case 'pessoa': {
      const doc = cpf(o.estado)
      const { endereco: rua, cidade, estado, cep: codigo } = endereco(o.estado)
      return {
        ...nomeVariado(),
        idade: String(between(18, 80)),
        cpf: doc.raw,
        cpf_formatado: doc.formatted,
        estado_cpf: doc.estado,
        endereco: rua,
        cidade,
        estado,
        cep: codigo,
      }
    }
  }
}

export const generate = (kind: Kind, o: Options): Result => build(kind, o)
