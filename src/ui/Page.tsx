import { CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePageHelp } from './PageHelp'

type Props = { eyebrow: string; title: string; hint: string; actions?: ReactNode; children: ReactNode }

export function Page({ eyebrow, title, hint, actions, children }: Props) {
  const help = usePageHelp()
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>
            {title}
            {help && (
              <button className="page-help-icon" onClick={help.open} title={`${help.purpose}\n\nClique para ver como usar esta tela.`} aria-label="Ajuda desta tela">
                <CircleHelp size={18} />
              </button>
            )}
          </h1>
          <p>
            {hint}
            {help && (
              <>
                {' '}
                <button className="page-help-link" onClick={help.open}>Como usar esta tela</button>
              </>
            )}
          </p>
        </div>
        <div className="spacer" />
        {actions && <div className="row">{actions}</div>}
      </header>
      <div className="stack reveal" style={{ ['--gap' as string]: '16px' }}>
        {children}
      </div>
    </div>
  )
}
