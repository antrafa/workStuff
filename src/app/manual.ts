// The user manual: its sections and pages, opened at /documentacao and by each screen's help button.
// The text of each page is docs/manual/<lang>/<slug>.md; scripts/check-manual.ts fails when a
// screen of the menu has no page, or a page is missing in one language.
// Relative, not '@/': scripts/check-manual.ts imports this file in Node
import { NAV } from './nav.ts'
import { tx } from '../lib/i18n.ts'

export type ManualPage = { slug: string; title: string; route?: string }
export type ManualGroup = { id: string; label: string; pages: ManualPage[] }

export const MANUAL_ROUTE = '/documentacao'
export const FIRST_PAGE = 'introducao'

const slugOf = (route: string) => route.slice(1) || 'inicio'

// "Getting started" first; then one section per menu group, in the menu's order
export const MANUAL: ManualGroup[] = [
  {
    id: 'start',
    label: tx({ en: 'Getting started', pt: 'Começando' }),
    pages: [
      { slug: FIRST_PAGE, title: tx({ en: 'What workStuff is', pt: 'O que é o workStuff' }) },
      { slug: 'primeiros-passos', title: tx({ en: 'First steps', pt: 'Primeiros passos' }) },
      { slug: 'conceitos', title: tx({ en: 'Concepts and terms', pt: 'Conceitos e termos' }) },
      { slug: 'configuracoes', title: tx({ en: 'Settings', pt: 'Configurações' }), route: '/configuracoes' },
    ],
  },
  ...NAV.map(group => ({
    id: group.id,
    label: group.label,
    pages: group.items.filter(item => item.path !== MANUAL_ROUTE).map(item => ({ slug: slugOf(item.path), title: item.label, route: item.path })),
  })),
]

export const MANUAL_PAGES: ManualPage[] = MANUAL.flatMap(group => group.pages)

// The page of the screen at `pathname`, by the longest route prefix (/cluster/doctor uses /cluster's)
export function manualSlugFor(pathname: string): string | null {
  const page = MANUAL_PAGES
    .filter(p => p.route && (pathname === p.route || (p.route !== '/' && pathname.startsWith(p.route + '/'))))
    .sort((a, b) => b.route!.length - a.route!.length)[0]
  return page?.slug ?? null
}

export const manualPath = (slug: string) => `${MANUAL_ROUTE}/${slug}`
