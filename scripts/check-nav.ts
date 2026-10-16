// Autoteste do menu: ordem das seções e dos itens, que sidebar, Ctrl K, Configurações e breadcrumb leem de NAV.
// node scripts/check-nav.ts
import assert from 'node:assert/strict'
import { Stethoscope, Users } from 'lucide-react'
import { NAV, findNav } from '../src/app/nav.ts'

// Groups by their stable id: labels follow the language (English here, the default outside a browser)
const layout = Object.fromEntries(NAV.map(g => [g.id, g.items.map(i => i.path)]))
assert.deepEqual(Object.keys(layout), ['overview', 'tools', 'development', 'deploy', 'kubernetes', 'ai'])
assert.deepEqual(layout, {
  overview: ['/', '/documentacao'],
  tools: ['/maquina', '/servicos', '/perfil', '/conversores', '/requisicoes', '/agenda', '/gerador'],
  development: ['/fabrica', '/dev-runbooks'],
  deploy: ['/repositorios', '/pipelines', '/revisao', '/vulnerabilidades'],
  kubernetes: ['/cluster', '/recursos', '/logs', '/incidente', '/comparar', '/upgrade', '/runbooks', '/performance'],
  ai: ['/catalogo', '/analise', '/playbooks'],
})
assert.deepEqual(NAV.map(g => g.label), ['Overview', 'Tools', 'Development', 'Deploy', 'Kubernetes', 'AI'])

const tools = NAV.find(g => g.id === 'tools')!.items
assert.deepEqual(tools.map(i => i.label), ['Machine', 'Local services', 'Team profile', 'Converters', 'HTTP requests', 'Scheduled checks', 'Data generator'])

const paths = NAV.flatMap(g => g.items.map(i => i.path))
assert.equal(new Set(paths).size, paths.length, 'rota repetida no menu')

// Mover o item não pode mudar rótulo, dica, etiqueta, ícone nem o breadcrumb (findNav).
const moved = [
  { path: '/maquina', label: 'Machine', hint: 'What is missing to get work done', tag: 'setup', icon: Stethoscope },
  { path: '/perfil', label: 'Team profile', hint: 'Exports and imports the setup for someone else', tag: 'team', icon: Users },
]
for (const expected of moved) {
  const found = findNav(expected.path)
  assert.ok(found, `${expected.path} fora do menu`)
  assert.equal(found.group.id, 'tools')
  assert.deepEqual(found.item, expected)
  assert.equal(findNav(`${expected.path}/sub`)?.item.path, expected.path, 'subrota cai no mesmo item')
}

// A CommandPalette monta "Todas as telas" assim; Máquina e Serviços locais vêm antes do resto de Ferramentas.
const palette = NAV.flatMap(g => g.items.map(item => ({ path: item.path, group: g.id }))).filter(e => e.group === 'tools')
assert.deepEqual(palette.slice(0, 2).map(e => e.path), ['/maquina', '/servicos'])

console.log(`check-nav: ok (${paths.length} itens)`)
