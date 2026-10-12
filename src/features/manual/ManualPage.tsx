import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react'
import { Link, Navigate, NavLink, useLocation, useParams } from 'react-router'
import { Async, Markdown, Page, Search } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { tx } from '@/lib/i18n'
import { FIRST_PAGE, MANUAL, MANUAL_PAGES, manualPath } from '@/app/manual'
import { loadManualPage, outline } from './content'
import './manual.css'

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function ManualPage() {
  const { slug = FIRST_PAGE } = useParams()
  const { hash } = useLocation()
  const index = MANUAL_PAGES.findIndex(p => p.slug === slug)
  const page = MANUAL_PAGES[index]
  const text = useAsync(() => loadManualPage(slug), [slug])
  const [query, setQuery] = useState('')
  const matches = useSearch(query)

  // A new page starts at its top, or at the heading the link pointed to
  useEffect(() => {
    if (!text.data) return
    const target = hash && document.getElementById(decodeURIComponent(hash.slice(1)))
    if (target) target.scrollIntoView()
    else document.querySelector('main')?.scrollTo(0, 0)
  }, [text.data, hash])

  if (!page) return <Navigate to={manualPath(FIRST_PAGE)} replace />
  const previous = MANUAL_PAGES[index - 1]
  const next = MANUAL_PAGES[index + 1]

  return (
    <Page title={tx({ en: 'Documentation', pt: 'Documentação' })} hint={tx({ en: 'How to use each screen of the panel, step by step, with the terms explained.', pt: 'Como usar cada tela do painel, passo a passo, com os termos explicados.' })}>
      <div className="manual">
        <aside className="manual-nav">
          <Search value={query} onChange={setQuery} placeholder={tx({ en: 'Search the documentation', pt: 'Buscar na documentação' })} width={220} />
          {query && matches?.size === 0 && <p className="muted manual-none">{tx({ en: 'Nothing found. Try another word.', pt: 'Nada encontrado. Tente outra palavra.' })}</p>}
          {MANUAL.map(group => {
            const pages = group.pages.filter(p => !query || !matches || matches.has(p.slug))
            if (pages.length === 0) return null
            return (
              <nav key={group.id} className="manual-group">
                <div className="eyebrow">{group.label}</div>
                {pages.map(p => (
                  <NavLink key={p.slug} to={manualPath(p.slug)} className="manual-link">{p.title}</NavLink>
                ))}
              </nav>
            )
          })}
        </aside>

        <article className="manual-body">
          {page.route && (
            <Link to={page.route} className="btn btn-sm manual-open">
              <ExternalLink size={13} /> {tx({ en: 'Open this screen', pt: 'Abrir esta tela' })}
            </Link>
          )}
          <Async state={text}>{md => <Markdown>{md}</Markdown>}</Async>
          <footer className="manual-pager">
            {previous ? (
              <Link to={manualPath(previous.slug)} className="manual-pager-link">
                <span className="eyebrow"><ArrowLeft size={12} /> {tx({ en: 'Previous', pt: 'Anterior' })}</span>
                {previous.title}
              </Link>
            ) : <span />}
            {next && (
              <Link to={manualPath(next.slug)} className="manual-pager-link is-next">
                <span className="eyebrow">{tx({ en: 'Next', pt: 'Próxima' })} <ArrowRight size={12} /></span>
                {next.title}
              </Link>
            )}
          </footer>
        </article>

        <nav className="manual-toc">
          {text.data && outline(text.data).length > 0 && (
            <>
              <div className="eyebrow">{tx({ en: 'On this page', pt: 'Nesta página' })}</div>
              {outline(text.data).map(h => (
                <a key={h.id} href={`#${h.id}`} className={`manual-toc-link level-${h.level}`}>{h.text}</a>
              ))}
            </>
          )}
        </nav>
      </div>
    </Page>
  )
}

// The slugs whose title or text has the query; null while the pages are still loading
function useSearch(query: string): Set<string> | null {
  const [texts, setTexts] = useState<Map<string, string> | null>(null)
  const wanted = query.trim() !== ''

  useEffect(() => {
    if (!wanted || texts) return
    Promise.all(MANUAL_PAGES.map(p => loadManualPage(p.slug).then(md => [p.slug, md] as const, () => [p.slug, ''] as const)))
      .then(all => setTexts(new Map(all)))
  }, [wanted, texts])

  if (!wanted || !texts) return null
  const q = normalize(query.trim())
  return new Set(MANUAL_PAGES.filter(p => normalize(p.title).includes(q) || normalize(texts.get(p.slug) ?? '').includes(q)).map(p => p.slug))
}
