import { language } from '@/lib/i18n'
import { headingId } from '@/ui'

// Each page is its own chunk: the help button loads one, the manual's search loads them all
const FILES = import.meta.glob<string>('../../../docs/manual/*/*.md', { query: '?raw', import: 'default' })

export function loadManualPage(slug: string): Promise<string> {
  const load = FILES[`../../../docs/manual/${language()}/${slug}.md`]
  return load ? load() : Promise.reject(new Error(slug))
}

export type Heading = { level: 2 | 3; text: string; id: string }

// The "On this page" list, with the same anchors the Markdown component gives the headings
export function outline(markdown: string): Heading[] {
  let inCode = false
  const out: Heading[] = []
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) inCode = !inCode
    const m = !inCode && /^(##|###) (.+)$/.exec(line)
    if (!m) continue
    const text = m[2].replace(/[*_`]/g, '').trim()
    out.push({ level: m[1].length as 2 | 3, text, id: headingId(text) })
  }
  return out
}
