import type { ReactNode } from 'react'

type Props = { eyebrow: string; title: string; hint: string; actions?: ReactNode; children: ReactNode }

export function Page({ eyebrow, title, hint, actions, children }: Props) {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p>{hint}</p>
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
