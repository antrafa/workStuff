import { ArrowLeft, ArrowRight, Check, Save } from 'lucide-react'
import { useState } from 'react'
import { Modal, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { createSource, fetchHints, updateSource, type Source, type SourceInput } from './api'
import { ProtocolStep, ProviderStep, TokenStep } from './ConnectSteps'
import { BaseStep, NameStep, WorkspaceStep } from './PlaceSteps'
import { tx } from '@/lib/i18n'

export type Draft = SourceInput & { keepToken: boolean }

const STEPS = tx({ en: ['Provider', 'Token', 'Protocol', 'Base group', 'Workspace', 'Review'], pt: ['Provedor', 'Token', 'Protocolo', 'Grupo base', 'Workspace', 'Revisar'] })

const fresh = (): Draft => ({ provider: 'gitlab', url: 'https://gitlab.com', protocol: 'ssh', tokenSource: 'env', token: '', basePath: '', workspace: '~/workspace', label: '', keepToken: false })

const fromSource = (s: Source): Draft => ({
  provider: s.provider, url: s.url, protocol: s.protocol, tokenSource: s.tokenSource, token: '', basePath: s.basePath,
  workspace: s.workspaceLabel, label: s.label, keepToken: s.tokenSource === 'stored',
})

// Body sent to the server: a typed token only goes when the user changed it; "keep the current one" sends nothing.
export const toInput = (d: Draft): SourceInput => ({
  provider: d.provider, url: d.url, protocol: d.protocol, tokenSource: d.tokenSource, basePath: d.basePath, workspace: d.workspace, label: d.label,
  ...(d.tokenSource === 'stored' && !d.keepToken && d.token ? { token: d.token } : {}),
})

// Each step unlocks the next only when what it asks for is filled in.
function stepReady(step: number, d: Draft) {
  if (step === 0) return /^https:\/\/.+/.test(d.url)
  if (step === 1) return d.tokenSource !== 'stored' || d.keepToken || Boolean(d.token?.trim())
  if (step === 4) return /^(~|\/)/.test(d.workspace.trim())
  return true
}

type Props = { editing: Source | null; onClose: () => void; onSaved: (s: Source) => void }

export function SetupWizard({ editing, onClose, onSaved }: Props) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(() => (editing ? fromSource(editing) : fresh()))
  const [saving, setSaving] = useState(false)
  const hints = useAsync(fetchHints)
  const toast = useToast()
  const patch = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }))

  const save = async () => {
    setSaving(true)
    try {
      const body = toInput(draft)
      const saved = editing ? await updateSource(editing.id, body) : await createSource(body)
      toast(editing ? tx({ en: 'Connection updated', pt: 'Conexão atualizada' }) : tx({ en: 'Connection created', pt: 'Conexão criada' }))
      onSaved(saved)
    } catch (e) {
      toast(tx({ en: `Not saved: ${(e as Error).message}`, pt: `Não salvou: ${(e as Error).message}` }))
    } finally {
      setSaving(false)
    }
  }

  const last = step === STEPS.length - 1
  return (
    <Modal
      width={720}
      onClose={onClose}
      title={editing ? tx({ en: `Edit connection · ${editing.label}`, pt: `Editar conexão · ${editing.label}` }) : tx({ en: 'Connect GitLab or GitHub', pt: 'Conectar GitLab ou GitHub' })}
      footer={
        <>
          <span className="muted spacer" style={{ fontSize: 12 }}>{tx({ en: `Step ${step + 1} of ${STEPS.length}`, pt: `Passo ${step + 1} de ${STEPS.length}` })}</span>
          {step > 0 && <button className="btn" onClick={() => setStep(s => s - 1)}><ArrowLeft size={14} /> {tx({ en: 'Back', pt: 'Voltar' })}</button>}
          {last ? (
            <button className="btn btn-primary" disabled={saving} onClick={save}><Save size={14} /> {saving ? tx({ en: 'Saving…', pt: 'Salvando…' }) : tx({ en: 'Save connection', pt: 'Salvar conexão' })}</button>
          ) : (
            <button className="btn btn-primary" disabled={!stepReady(step, draft)} onClick={() => setStep(s => s + 1)} title={stepReady(step, draft) ? '' : tx({ en: 'Fill in this step to continue', pt: 'Preencha este passo para continuar' })}>
              {tx({ en: 'Next', pt: 'Próximo' })} <ArrowRight size={14} />
            </button>
          )}
        </>
      }
    >
      <ol className="wizard-steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
            <button onClick={() => i < step && setStep(i)} disabled={i > step} title={i < step ? tx({ en: `Back to ${label}`, pt: `Voltar para ${label}` }) : label}>
              <span className="wizard-num">{i < step ? <Check size={11} /> : i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <div className="stack" style={{ ['--gap' as string]: '14px' }}>
        {step === 0 && <ProviderStep draft={draft} patch={patch} />}
        {step === 1 && <TokenStep draft={draft} patch={patch} hints={hints.data} editing={editing} />}
        {step === 2 && <ProtocolStep draft={draft} patch={patch} />}
        {step === 3 && <BaseStep draft={draft} patch={patch} />}
        {step === 4 && <WorkspaceStep draft={draft} patch={patch} />}
        {step === 5 && <NameStep draft={draft} patch={patch} editing={editing} />}
      </div>
    </Modal>
  )
}
