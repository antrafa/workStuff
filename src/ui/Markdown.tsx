import './markdown.css'
import './code.css'
import { CopyButton } from './CopyButton'
import { Children, isValidElement, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { tx } from '@/lib/i18n'

// Markdown de resposta de IA: GFM (tabelas, listas de tarefa) e blocos ```mermaid como diagrama.
// HTML cru no texto não é interpretado (react-markdown ignora sem rehype-raw): o conteúdo vem do modelo.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

// Anchor of a heading, shared with whoever lists the headings (the manual's "On this page")
export const headingId = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const textOf = (node: ReactNode): string =>
  Children.toArray(node).map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : '')).join('')

const COMPONENTS: Components = {
  // A path inside the panel navigates in place; anything else opens outside it
  a: ({ href, children }) =>
    href?.startsWith('/') ? (
      <Link to={href}>{children}</Link>
    ) : href?.startsWith('#') ? (
      <a href={href}>{children}</a>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  h2: ({ children }) => <h2 id={headingId(textOf(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={headingId(textOf(children))}>{children}</h3>,
  // Bloco de código: o <pre> recebe o <code> do react-markdown e desenha ele mesmo o conteúdo,
  // então o override de `code` abaixo só é usado para código inline.
  pre: ({ children }) => {
    const child = children as ReactElement<{ className?: string; children?: ReactNode }>
    const lang = /language-(\w+)/.exec(child?.props?.className ?? '')?.[1]
    const text = String(child?.props?.children ?? '').replace(/\n$/, '')
    if (lang === 'mermaid') return <Mermaid chart={text} />
    return (
      <div className="code-block">
        <div className="code-block-head">
          <span>{lang ?? tx({ en: 'code', pt: 'código' })}</span>
          <span className="spacer" />
          <CopyButton value={text} />
        </div>
        <pre><code>{text}</code></pre>
      </div>
    )
  },
  code: ({ children }) => <code className="inline">{children}</code>,
  // An image would load on its own: text read from a third-party MR could tell the model to put a file's
  // contents in an image URL, and the browser would send it out. The address shows, never loads.
  img: ({ src, alt }) => (
    <span className="muted" title={tx({ en: 'Image not loaded', pt: 'Imagem não carregada' })}>
      [{alt || tx({ en: 'image', pt: 'imagem' })}: <code className="inline">{String(src ?? '')}</code>]
    </span>
  ),
  table: ({ children }) => (
    <div className="table-wrap">
      <table className="table">{children}</table>
    </div>
  ),
}

// Cores do diagrama vêm dos tokens do tema, para seguir claro/escuro e a cor de destaque.
function themeVariables() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    background: v('--surface'),
    primaryColor: v('--surface-2'),
    primaryBorderColor: v('--signal'),
    primaryTextColor: v('--ink'),
    lineColor: v('--muted'),
    textColor: v('--ink'),
    secondaryColor: v('--surface-3'),
    tertiaryColor: v('--surface'),
    fontFamily: v('--font-sans'),
  }
}

// O mermaid não aguenta dois render ao mesmo tempo (o segundo sai vazio): a fila serializa.
let queue: Promise<unknown> = Promise.resolve()

function renderMermaid(id: string, chart: string) {
  const job = queue.then(async () => {
    const { default: mermaid } = await import('mermaid')
    // strict: o mermaid sanitiza rótulos e não executa script nem clique dentro do SVG.
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: themeVariables() })
    return (await mermaid.render(id, chart)).svg
  })
  queue = job.catch(() => undefined)
  return job
}

function Mermaid({ chart }: { chart: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    renderMermaid(id, chart)
      .then(svg => !cancelled && setSvg(svg))
      .catch(e => !cancelled && setError((e as Error).message))
    return () => {
      cancelled = true
    }
  }, [chart, id])

  if (error) {
    return (
      <figure className="md-diagram is-error">
        <figcaption>Diagrama inválido: {error.split('\n')[0]}</figcaption>
        <pre className="code">{chart}</pre>
      </figure>
    )
  }
  return svg ? <figure className="md-diagram" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="skeleton" style={{ height: 160 }} />
}
