import { CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/ui'
import { helpFor } from './help'

// Botão "Ajuda" da barra do topo: abre o propósito e o passo a passo da tela atual.
export function HelpButton({ pathname, title }: { pathname: string; title: string }) {
  const [open, setOpen] = useState(false)
  const help = helpFor(pathname)
  if (!help) return null
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Para que serve esta tela e como usar">
        <CircleHelp size={15} /> Ajuda
      </button>
      {open && (
        <Modal title={`Ajuda · ${title}`} width={620} onClose={() => setOpen(false)}>
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
      )}
    </>
  )
}
