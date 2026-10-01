import { ArrowLeft, ArrowRight, Check, Save } from 'lucide-react'
import { useState } from 'react'
import { Modal, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { createSource, fetchHints, updateSource, type Source, type SourceInput } from './api'
import { ProtocolStep, ProviderStep, TokenStep } from './ConnectSteps'
import { BaseStep, NameStep, WorkspaceStep } from './PlaceSteps'

export type Draft = SourceInput & { keepToken: boolean }

const STEPS = ['Provedor', 'Token', 'Protocolo', 'Grupo base', 'Workspace', 'Revisar']

const fresh = (): Draft => ({ provider: 'gitlab', url: 'https://gitlab.com', protocol: 'ssh', tokenSource: 'env', token: '', basePath: '', workspace: '~/workspace', label: '', keepToken: false })

const fromSource = (s: Source): Draft => ({
  provider: s.provider, url: s.url, protocol: s.protocol, tokenSource: s.tokenSource, token: '', basePath: s.basePath,
  workspace: s.workspaceLabel, label: s.label, keepToken: s.tokenSource === 'stored',
})

// Corpo enviado ao servidor: token digitado só vai quando o usuário trocou; "manter o atual" não manda nada.
export const toInput = (d: Draft): SourceInput => ({
  provider: d.provider, url: d.url, protocol: d.protocol, tokenSource: d.tokenSource, basePath: d.basePath, workspace: d.workspace, label: d.label,
  ...(d.tokenSource === 'stored' && !d.keepToken && d.token ? { token: d.token } : {}),
})

// Cada passo só libera o próximo quando o que ele pede está preenchido.
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
      toast(editing ? 'Conexão atualizada' : 'Conexão criada')
      onSaved(saved)
    } catch (e) {
      toast(`Não salvou: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const last = step === STEPS.length - 1
  return (
    <Modal
      width={720}
      onClose={onClose}
      title={editing ? `Editar conexão · ${editing.label}` : 'Conectar GitLab ou GitHub'}
      footer={
        <>
          <span className="muted spacer" style={{ fontSize: 12 }}>Passo {step + 1} de {STEPS.length}</span>
          {step > 0 && <button className="btn" onClick={() => setStep(s => s - 1)}><ArrowLeft size={14} /> Voltar</button>}
          {last ? (
            <button className="btn btn-primary" disabled={saving} onClick={save}><Save size={14} /> {saving ? 'Salvando…' : 'Salvar conexão'}</button>
          ) : (
            <button className="btn btn-primary" disabled={!stepReady(step, draft)} onClick={() => setStep(s => s + 1)} title={stepReady(step, draft) ? '' : 'Preencha este passo para continuar'}>
              Próximo <ArrowRight size={14} />
            </button>
          )}
        </>
      }
    >
      <ol className="wizard-steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
            <button onClick={() => i < step && setStep(i)} disabled={i > step} title={i < step ? `Voltar para ${label}` : label}>
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
