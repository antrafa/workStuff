import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

type Props = { title: ReactNode; onClose: () => void; width?: number; footer?: ReactNode; children: ReactNode }

export function Modal({ title, onClose, width, footer, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={{ ['--w' as string]: `${width ?? 560}px` }}>
        <div className="card-head">
          <div className="card-title spacer">{title}</div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} title="Fechar (Esc)">
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
