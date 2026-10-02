import { Modal } from '@/ui'
import { helpFor } from './help'

// Propósito e passo a passo da tela atual, aberto pelo "?" e pelo link "Como usar esta tela" do título.
export function HelpModal({ pathname, title, onClose }: { pathname: string; title: string; onClose: () => void }) {
  const help = helpFor(pathname)
  if (!help) return null
  return (
    <Modal title={`Como usar · ${title}`} width={620} onClose={onClose}>
      <div className="stack help">
        <section>
          <div className="eyebrow">Para que serve</div>
          <p>{help.purpose}</p>
        </section>
        <section>
          <div className="eyebrow">Como usar</div>
          <ol>{help.steps.map(s => <li key={s}>{s}</li>)}</ol>
        </section>
        {help.notes.length > 0 && (
          <section>
            <div className="eyebrow">Bom saber</div>
            <ul>{help.notes.map(n => <li key={n}>{n}</li>)}</ul>
          </section>
        )}
      </div>
    </Modal>
  )
}
