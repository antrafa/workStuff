import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

type Props = { value: string; label?: string }

export function CopyButton({ value, label }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard?.writeText(value).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <button
      className={label ? 'btn btn-sm' : 'btn btn-ghost btn-sm btn-icon'}
      onClick={copy}
      title={`Copiar: ${value.length > 60 ? value.slice(0, 60) + '…' : value}`}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {label && (copied ? 'copiado' : label)}
    </button>
  )
}
