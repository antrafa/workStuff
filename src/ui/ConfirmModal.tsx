import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'

type Props = {
  title: string
  confirmLabel: string
  icon: LucideIcon
  onConfirm: () => void
  onClose: () => void
  children: ReactNode
}

// Confirmação de ação destrutiva: o corpo diz a consequência, o botão diz a ação.
export function ConfirmModal({ title, confirmLabel, icon: Icon, onConfirm, onClose, children }: Props) {
  return (
    <Modal
      title={title}
      width={460}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-danger" onClick={() => (onConfirm(), onClose())}>
            <Icon size={14} /> {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  )
}
