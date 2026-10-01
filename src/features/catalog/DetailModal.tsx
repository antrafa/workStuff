import { ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Async, CopyButton, Modal, SkeletonRows, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { AgentChips } from './AgentChips'
import { ReviewPanel } from './ReviewPanel'
import { fetchContent, openItem, saveMeta, type AgentId, type AgentState, type CatalogItem, type Status } from './api'
import { KIND_SINGULAR, STATUS } from './labels'

// onPatch recebe só o que mudou: a página junta com o estado atual, sem sobrescrever com uma cópia velha.
type Props = { item: CatalogItem; onPatch: (patch: Partial<CatalogItem>) => void; onClose: () => void }
type Tab = 'conteudo' | 'acompanhamento' | 'revisao'

export function DetailModal({ item, onPatch, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('conteudo')
  const toast = useToast()

  const open = () => openItem(item.id).then(() => toast('Aberto no editor')).catch((e: Error) => toast(`Não abriu: ${e.message}`))
  const setAgentState = (agent: AgentId, state: AgentState) => onPatch({ agents: { ...item.agents, [agent]: state } })

  return (
    <Modal
      width={760}
      onClose={onClose}
      title={
        <div className="row">
          <span>{item.title}</span>
          <span className="badge">{KIND_SINGULAR[item.kind]}</span>
        </div>
      }
      footer={
        <>
          <CopyButton value={`Leia ${item.mainFile} e aplique ao que vamos fazer.`} label="Copiar prompt" />
          <button className="btn" onClick={open} title={`Abre ${item.pathLabel} no editor`}>
            <ExternalLink size={14} /> Abrir no editor
          </button>
        </>
      }
    >
      <div className="stack">
        <span className="mono muted" style={{ fontSize: 12 }}>{item.pathLabel}</span>
        {item.description && <p style={{ margin: 0 }}>{item.description}</p>}
        <AgentChips item={item} onChange={setAgentState} />
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'conteudo'} onClick={() => setTab('conteudo')}>Conteúdo</button>
          <button role="tab" aria-selected={tab === 'acompanhamento'} onClick={() => setTab('acompanhamento')}>Acompanhamento</button>
          <button role="tab" aria-selected={tab === 'revisao'} onClick={() => setTab('revisao')}>Revisão com IA</button>
        </div>
        {tab === 'conteudo' && <Content id={item.id} />}
        {tab === 'acompanhamento' && <Tracking item={item} onPatch={onPatch} />}
        {/* Montado sempre: trocar de aba não interrompe uma revisão em andamento. */}
        <div hidden={tab !== 'revisao'}><ReviewPanel item={item} /></div>
      </div>
    </Modal>
  )
}

function Content({ id }: { id: string }) {
  const state = useAsync(() => fetchContent(id), [id])
  return (
    <Async state={state} skeleton={<SkeletonRows rows={5} height={18} />}>
      {c => (
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          <div className="row">
            <span className="mono muted spacer" style={{ fontSize: 11.5 }}>{c.path}</span>
            <CopyButton value={c.content} label="Copiar conteúdo" />
          </div>
          <pre className="code" style={{ whiteSpace: 'pre-wrap', maxHeight: 420 }}>{c.content}</pre>
        </div>
      )}
    </Async>
  )
}

function Tracking({ item, onPatch }: Pick<Props, 'item' | 'onPatch'>) {
  const [notes, setNotes] = useState(item.notes)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const toast = useToast()
  const saved = useRef(item.notes)

  // Grava 800ms depois da última tecla.
  useEffect(() => {
    if (notes === saved.current) return
    setSaving('saving')
    const t = setTimeout(() => {
      saveMeta(item.id, { notes })
        .then(() => {
          saved.current = notes
          setSaving('saved')
          onPatch({ notes })
        })
        .catch((e: Error) => {
          setSaving('error')
          toast(`Notas não salvas: ${e.message}`)
        })
    }, 800)
    return () => clearTimeout(t)
  }, [notes])

  const setStatus = (status: Status) =>
    saveMeta(item.id, { status })
      .then(() => onPatch({ status }))
      .catch((e: Error) => toast(`Status não salvo: ${e.message}`))

  return (
    <div className="stack">
      <div className="field">
        <span>Status</span>
        <div className="row" style={{ ['--gap' as string]: '6px' }}>
          {(Object.keys(STATUS) as Status[]).map(s => (
            <button key={s} className="chip" aria-pressed={item.status === s} onClick={() => setStatus(s)} title={`Marcar como ${STATUS[s].label}`}>
              {STATUS[s].label}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>
          Notas{' '}
          <small className={saving === 'error' ? 'error' : 'muted'}>
            {saving === 'saving' ? 'salvando…' : saving === 'saved' ? 'salvo' : saving === 'error' ? 'não salvo' : ''}
          </small>
        </span>
        <textarea className="textarea" rows={5} value={notes} placeholder="O que falta, o que testar, de onde veio a ideia…" onChange={e => setNotes(e.target.value)} />
        <small>Ficam em ~/.workstuff, nunca no arquivo do item.</small>
      </label>
    </div>
  )
}
