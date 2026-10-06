import { Modal } from '@/ui'
import { tx } from '@/lib/i18n'
import { helpFor } from './help'

// Purpose and walkthrough of the current screen, opened by the "?" and the title's help link.
export function HelpModal({ pathname, title, onClose }: { pathname: string; title: string; onClose: () => void }) {
  const help = helpFor(pathname)
  if (!help) return null
  return (
    <Modal title={tx({ en: `How to use · ${title}`, pt: `Como usar · ${title}` })} width={620} onClose={onClose}>
      <div className="stack help">
        <section>
          <div className="eyebrow">{tx({ en: 'What it is for', pt: 'Para que serve' })}</div>
          <p>{help.purpose}</p>
        </section>
        <section>
          <div className="eyebrow">{tx({ en: 'How to use', pt: 'Como usar' })}</div>
          <ol>{help.steps.map(s => <li key={s}>{s}</li>)}</ol>
        </section>
        {help.notes.length > 0 && (
          <section>
            <div className="eyebrow">{tx({ en: 'Good to know', pt: 'Bom saber' })}</div>
            <ul>{help.notes.map(n => <li key={n}>{n}</li>)}</ul>
          </section>
        )}
      </div>
    </Modal>
  )
}
