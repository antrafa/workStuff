import assert from 'node:assert/strict'

export type Frontmatter = Record<string, string>

// Lê o frontmatter YAML do jeito que as skills usam: chave: valor em uma linha, ou texto em várias
// linhas com `>`/`|` (e variantes `>-`, `|-`) ou continuação recuada. Mapas aninhados viram texto.
export function parseFrontmatter(content: string): Frontmatter {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const fm: Frontmatter = {}
  const lines = m[1].split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([a-zA-Z_-]+):\s*(.*)$/)
    if (!kv) continue
    const [, key, raw] = kv
    const block = raw.match(/^([>|])[-+]?$/)
    const continuation: string[] = []
    while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || (block && lines[i + 1].trim() === ''))) {
      continuation.push(lines[++i].trim())
    }
    const value = block
      ? continuation.join(block[1] === '|' ? '\n' : ' ').trim()
      : [raw, ...continuation].join(' ').trim()
    fm[key] = value.replace(/^(["'])([\s\S]*)\1$/, '$2')
  }
  return fm
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const fm = (yaml: string) => parseFrontmatter(`---\n${yaml}\n---\n# corpo`)
  assert.equal(fm('description: Uma linha').description, 'Uma linha')
  assert.equal(fm('description: >-\n  Primeira parte\n  segunda parte\nname: x').description, 'Primeira parte segunda parte')
  assert.equal(fm('description: |\n  linha 1\n  linha 2').description, 'linha 1\nlinha 2')
  assert.equal(fm("description: 'Entre aspas\n  continua aqui'").description, 'Entre aspas continua aqui')
  assert.equal(fm('name: x\nmetadata:\n  author: A\ndescription: D').description, 'D')
  assert.deepEqual(parseFrontmatter('# sem frontmatter'), {})
  console.log('frontmatter selfcheck: ok')
}
