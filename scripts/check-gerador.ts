// Autoteste do gerador de dados: node scripts/check-gerador.ts
// Confere os algoritmos com implementações independentes, não com o próprio código.
import assert from 'node:assert/strict'
import { UFS, generate, type Kind } from '../src/features/gerador/generate.ts'

const AMOSTRAS = 200

function dv(values: number[], weights: number[]) {
  const rest = values.reduce((s, v, i) => s + v * weights[i], 0) % 11
  return rest < 2 ? 0 : 11 - rest
}

function cpfValido(cpf: string) {
  if (!/^\d{11}$/.test(cpf)) return false
  const d = [...cpf].map(Number)
  return d[9] === dv(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]) && d[10] === dv(d.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
}

// Valor de cada caractere pela IN RFB 2.229/2024: código ASCII − 48 (A = 17).
function cnpjValido(cnpj: string) {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false
  const v = [...cnpj].map(c => c.charCodeAt(0) - 48)
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  return v[12] === dv(v.slice(0, 12), w1) && v[13] === dv(v.slice(0, 13), [6, ...w1])
}

// Faixas oficiais do prefixo do CEP (com os blocos extras de AM, DF e GO), escritas à parte.
const FAIXA_CEP: Record<string, [number, number][]> = {
  SP: [[1000, 19999]], RJ: [[20000, 28999]], ES: [[29000, 29999]], MG: [[30000, 39999]], BA: [[40000, 48999]],
  SE: [[49000, 49999]], PE: [[50000, 56999]], AL: [[57000, 57999]], PB: [[58000, 58999]], RN: [[59000, 59999]],
  CE: [[60000, 63999]], PI: [[64000, 64999]], MA: [[65000, 65999]], PA: [[66000, 68899]], AP: [[68900, 68999]],
  AM: [[69000, 69299], [69400, 69899]], RR: [[69300, 69399]], AC: [[69900, 69999]], DF: [[70000, 72799], [73000, 73699]],
  GO: [[72800, 72999], [73700, 76799]], TO: [[77000, 77999]], MT: [[78000, 78899]], RO: [[76800, 76999]],
  MS: [[79000, 79999]], PR: [[80000, 87999]], SC: [[88000, 89999]], RS: [[90000, 99999]],
}
const cepNaFaixa = (cep: string, uf: string) =>
  /^\d{5}-\d{3}$/.test(cep) && FAIXA_CEP[uf].some(([min, max]) => Number(cep.slice(0, 5)) >= min && Number(cep.slice(0, 5)) <= max)

const CHAVES: Record<Kind, string[]> = {
  cpf: ['cpf', 'cpf_formatado', 'estado'],
  cnpj: ['cnpj', 'cnpj_formatado', 'tipo', 'cnae_codigo', 'cnae_descricao'],
  nome: ['nome_completo', 'genero'],
  endereco: ['endereco', 'bairro', 'cidade', 'estado', 'estado_nome', 'cep'],
  empresa: ['razao_social', 'nome_fantasia', 'cnpj', 'cnpj_formatado', 'porte', 'regime_tributario', 'situacao', 'data_abertura',
    'capital_social', 'cnae_codigo', 'cnae_descricao', 'endereco', 'bairro', 'cidade', 'estado', 'cep'],
  pessoa: ['nome_completo', 'genero', 'idade', 'cpf', 'cpf_formatado', 'estado_cpf', 'endereco', 'cidade', 'estado', 'cep'],
}

// Exemplo oficial da Receita para o CNPJ alfanumérico.
assert.ok(cnpjValido('12ABC34501DE35'), 'exemplo da Receita 12.ABC.345/01DE-35 deveria validar')

for (let i = 0; i < AMOSTRAS; i++) {
  const semEstado = { estado: null, alfanumerico: false }
  for (const kind of Object.keys(CHAVES) as Kind[]) {
    for (const alfanumerico of [false, true]) {
      const r = generate(kind, { ...semEstado, alfanumerico })
      assert.deepEqual(Object.keys(r).sort(), [...CHAVES[kind]].sort(), `${kind}: chaves diferentes do contrato`)
      for (const [k, v] of Object.entries(r)) assert.ok(v !== '' && v != null, `${kind}.${k} vazio`)
      if (r.cpf) assert.ok(cpfValido(r.cpf), `CPF inválido: ${r.cpf}`)
      if (r.cnpj) assert.ok(cnpjValido(r.cnpj), `CNPJ inválido (${alfanumerico ? 'alfanumérico' : 'numérico'}): ${r.cnpj}`)
      if (r.cep) assert.ok(cepNaFaixa(r.cep, r.estado), `CEP ${r.cep} fora da faixa de ${r.estado}`)
    }
  }
}

// Filtro de estado: cada UF, em todos os tipos que aceitam estado.
for (const uf of UFS) {
  for (const kind of ['endereco', 'empresa', 'pessoa'] as Kind[]) {
    const r = generate(kind, { estado: uf, alfanumerico: false })
    assert.equal(r.estado, uf, `${kind} de ${uf} voltou com estado ${r.estado}`)
    assert.ok(cepNaFaixa(r.cep, uf), `${kind}: CEP ${r.cep} fora da faixa de ${uf}`)
    assert.notEqual(r.cidade, 'Cidade Não Encontrada', `${kind}: ${uf} sem cidade`)
  }
  const doc = generate('cpf', { estado: uf, alfanumerico: false })
  assert.equal(doc.estado, uf, `CPF de ${uf} voltou com estado ${doc.estado}`)
  assert.ok(cpfValido(doc.cpf))
}

console.log(`check-gerador: ok — ${AMOSTRAS}× cada tipo (numérico e alfanumérico), filtro de estado nas 27 UFs`)
