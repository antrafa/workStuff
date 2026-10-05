// Autoteste do menu: ordem das seções e dos itens, que sidebar, Ctrl K, Configurações e breadcrumb leem de NAV.
// node scripts/check-nav.ts
import assert from 'node:assert/strict'
import { Stethoscope, Users } from 'lucide-react'
import { NAV, findNav } from '../src/app/nav.ts'

const layout = Object.fromEntries(NAV.map(g => [g.label, g.items.map(i => i.path)]))
assert.deepEqual(Object.keys(layout), ['Visão Geral', 'Desenvolvimento', 'Ferramentas', 'Deploy', 'Kubernetes', 'IA'])
assert.deepEqual(layout, {
  'Visão Geral': ['/'],
  'Desenvolvimento': ['/fabrica', '/dev-runbooks'],
  'Ferramentas': ['/maquina', '/perfil', '/conversores', '/servicos', '/agenda', '/gerador'],
  'Deploy': ['/repositorios', '/pipelines', '/revisao', '/vulnerabilidades'],
  'Kubernetes': ['/cluster', '/recursos', '/logs', '/incidente', '/comparar', '/upgrade', '/runbooks', '/performance'],
  'IA': ['/catalogo', '/analise', '/playbooks'],
})

const tools = NAV.find(g => g.label === 'Ferramentas')!.items
assert.deepEqual(tools.map(i => i.label), ['Máquina', 'Perfil de equipe', 'Conversores', 'Serviços locais', 'Verificações agendadas', 'Gerador de dados'])

const paths = NAV.flatMap(g => g.items.map(i => i.path))
assert.equal(new Set(paths).size, paths.length, 'rota repetida no menu')

// Mover o item não pode mudar rótulo, dica, ícone nem o breadcrumb (findNav).
const moved = [
  { path: '/maquina', label: 'Máquina', hint: 'O que falta instalar para trabalhar', icon: Stethoscope },
  { path: '/perfil', label: 'Perfil de equipe', hint: 'Exporta e importa a configuração para outra pessoa', icon: Users },
]
for (const expected of moved) {
  const found = findNav(expected.path)
  assert.ok(found, `${expected.path} fora do menu`)
  assert.equal(found.group.label, 'Ferramentas')
  assert.deepEqual(found.item, expected)
  assert.equal(findNav(`${expected.path}/sub`)?.item.path, expected.path, 'subrota cai no mesmo item')
}

// A CommandPalette monta "Todas as telas" assim; Máquina e Perfil vêm antes do resto de Ferramentas.
const palette = NAV.flatMap(g => g.items.map(item => ({ path: item.path, group: g.label }))).filter(e => e.group === 'Ferramentas')
assert.deepEqual(palette.slice(0, 2).map(e => e.path), ['/maquina', '/perfil'])

console.log(`check-nav: ok (${paths.length} itens)`)
