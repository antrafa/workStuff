import { CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePageHelp } from './PageHelp'
import { tx } from '@/lib/i18n'

type Props = { title: string; hint: string; actions?: ReactNode; children: ReactNode }

export function Page({ title, hint, actions, children }: Props) {
  const help = usePageHelp()
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>
            {title}
            {help && (
              <button className="page-help-icon" onClick={help.open} title={tx({ en: 'Click to see how to use this screen, step by step.', pt: 'Clique para ver como usar esta tela, passo a passo.' })} aria-label={tx({ en: 'Help for this screen', pt: 'Ajuda desta tela' })}>
                <CircleHelp size={18} />
              </button>
            )}
          </h1>
          <p>
            {hint}
            {help && (
              <>
                {' '}
                <button className="page-help-link" onClick={help.open}>{tx({ en: 'How to use this screen', pt: 'Como usar esta tela' })}</button>
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
