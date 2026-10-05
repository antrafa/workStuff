import './markdown.css'
import './code.css'
import { CopyButton } from './CopyButton'
import { useEffect, useId, useState, type ReactElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

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

const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
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
          <span>{lang ?? 'código'}</span>
          <span className="spacer" />
          <CopyButton value={text} />
        </div>
        <pre><code>{text}</code></pre>
      </div>
    )
  },
  code: ({ children }) => <code className="inline">{children}</code>,
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
