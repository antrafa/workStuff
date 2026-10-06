import { Lock, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { CopyButton } from './CopyButton'
import { EnvStamp } from './EnvStamp'
import { Modal } from './Modal'
import { tx } from '@/lib/i18n'

type Props = {
  title: string
  confirmLabel: string
  icon: LucideIcon
  onConfirm: () => void
  onClose: () => void
  /** Ambiente onde a ação roda: vira o carimbo do cabeçalho. */
  env?: string | null
  /** Nome curto da ação, no cabeçalho ("reiniciar workload"). */
  action?: string
  /** Comando exato que vai rodar. */
  command?: string
  effects?: ReactNode[]
  losses?: ReactNode[]
  /** Perda irreversível: o botão só libera depois de digitar este texto. */
  typeToConfirm?: string
  children?: ReactNode
}

// Confirmação de ação destrutiva em três partes: o comando, o que acontece e o que se perde.
// O botão diz a ação; Enter não confirma, só o clique.
export function ConfirmModal({ title, confirmLabel, icon: Icon, onConfirm, onClose, env, action, command, effects, losses, typeToConfirm, children }: Props) {
  const [typed, setTyped] = useState('')
  const blocked = typeToConfirm !== undefined && typed !== typeToConfirm
  return (
    <Modal
      title={<ConfirmHead env={env} action={action ?? tx({ en: 'confirm', pt: 'confirmar' })} />}
      width={560}
      onClose={onClose}
      footer={
        <>
          <span className="muted confirm-keys">{tx({ en: 'Esc cancels · Enter does not confirm', pt: 'Esc cancela · Enter não confirma' })}</span>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{tx({ en: 'Cancel', pt: 'Cancelar' })}</button>
          <button className="btn btn-danger-solid" disabled={blocked} onClick={() => (onConfirm(), onClose())}>
            <Icon size={14} /> {confirmLabel}
          </button>
        </>
      }
    >
      <h2 className="confirm-title display">{title}</h2>
      <dl className="confirm-grid">
        {command && <Section label={tx({ en: 'Command', pt: 'Comando' })}><Command value={command} /></Section>}
        {effects && effects.length > 0 && <Section label={tx({ en: 'Effect', pt: 'Efeito' })}><Bullets items={effects} /></Section>}
        {losses && losses.length > 0 && <Section label={tx({ en: 'You lose', pt: 'Perde' })}><Bullets items={losses} /></Section>}
      </dl>
      {children}
      {typeToConfirm !== undefined && (
        <label className="field confirm-type">
          <span>{tx({ en: <>Type <code className="inline">{typeToConfirm}</code> to confirm</>, pt: <>Digite <code className="inline">{typeToConfirm}</code> para confirmar</> })}</span>
          <input className="input mono" value={typed} onChange={e => setTyped(e.target.value)} autoFocus spellCheck={false} />
        </label>
      )}
    </Modal>
  )
}

type LockedProps = { title: string; env: string | null; reason: string; command?: string; canDo?: ReactNode[]; onClose: () => void }

// A mesma ação num ambiente travado: explica por que não roda e o que dá para fazer daqui.
export function LockedActionModal({ title, env, reason, command, canDo, onClose }: LockedProps) {
  return (
    <Modal
      title={
        <span className="row locked-head">
          <EnvStamp env={env} /> <Lock size={13} /> <b>{tx({ en: 'read-only · nothing will run', pt: 'somente leitura · nada será executado' })}</b>
        </span>
      }
      width={560}
      onClose={onClose}
      footer={
        <>
          {command && <CopyButton value={command} label={tx({ en: 'Copy command', pt: 'Copiar comando' })} />}
          <button className="btn" onClick={onClose}>{tx({ en: 'Close', pt: 'Fechar' })}</button>
        </>
      }
    >
      <div className="locked-band" />
      <h2 className="confirm-title display">{title}</h2>
      <p className="confirm-reason">{reason}</p>
      <dl className="confirm-grid">
        {command && <Section label={tx({ en: 'Would run', pt: 'Seria rodado' })}><pre className="code locked-code">{command}</pre></Section>}
        {canDo && canDo.length > 0 && <Section label={tx({ en: 'You can do here', pt: 'Pode aqui' })}><Bullets items={canDo} /></Section>}
      </dl>
    </Modal>
  )
}

function ConfirmHead({ env, action }: { env?: string | null; action: string }) {
  return (
    <span className="row">
      {env !== undefined && <EnvStamp env={env} />}
      <span className="eyebrow">{action}</span>
    </span>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="eyebrow">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

function Command({ value }: { value: string }) {
  return (
    <div className="confirm-command">
      <pre className="code">{value}</pre>
      <CopyButton value={value} />
    </div>
  )
}

const Bullets = ({ items }: { items: ReactNode[] }) => <ul className="confirm-list">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
