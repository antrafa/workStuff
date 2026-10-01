import { readFileSync } from 'node:fs'
import { discover } from '../catalog/discover.ts'
import { readConfig } from '../catalog/store.ts'

const PERSONA_SLUG = 'arquiteto-software'

// A persona de arquiteto vem do Catálogo, das pastas que o usuário escolheu. Sem ela, null.
export function readArchitectPersona(): string | null {
  const item = discover(readConfig().roots).items.find(i => i.kind === 'persona' && i.slug === PERSONA_SLUG)
  if (!item) return null
  return readFileSync(item.mainFile, 'utf-8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '').trim()
}
