import { ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Async, CopyButton, Modal, SkeletonRows, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { AgentChips } from './AgentChips'
import { ReviewPanel } from './ReviewPanel'
import { fetchContent, openItem, saveMeta, type AgentId, type AgentState, type CatalogItem, type Status } from './api'
import { KIND_SINGULAR, STATUS } from './labels'
import { tx } from '@/lib/i18n'

// onPatch gets only what changed: the page merges it with the current state, never overwriting with a stale copy.
type Props = { item: CatalogItem; onPatch: (patch: Partial<CatalogItem>) => void; onClose: () => void }
type Tab = 'conteudo' | 'acompanhamento' | 'revisao'

export function DetailModal({ item, onPatch, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('conteudo')
  const toast = useToast()

  const open = () => openItem(item.id).then(() => toast(tx({ en: 'Opened in the editor', pt: 'Aberto no editor' }))).catch((e: Error) => toast(tx({ en: `Not opened: ${e.message}`, pt: `Não abriu: ${e.message}` })))
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
          <CopyButton value={tx({ en: `Read ${item.mainFile} and apply it to what we are about to do.`, pt: `Leia ${item.mainFile} e aplique ao que vamos fazer.` })} label={tx({ en: 'Copy prompt', pt: 'Copiar prompt' })} />
          <button className="btn" onClick={open} title={tx({ en: `Opens ${item.pathLabel} in the editor`, pt: `Abre ${item.pathLabel} no editor` })}>
            <ExternalLink size={14} /> {tx({ en: 'Open in editor', pt: 'Abrir no editor' })}
          </button>
        </>
      }
    >
      <div className="stack">
        <span className="mono muted" style={{ fontSize: 12 }}>{item.pathLabel}</span>
        {item.description && <p style={{ margin: 0 }}>{item.description}</p>}
        <AgentChips item={item} onChange={setAgentState} />
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'conteudo'} onClick={() => setTab('conteudo')}>{tx({ en: 'Content', pt: 'Conteúdo' })}</button>
          <button role="tab" aria-selected={tab === 'acompanhamento'} onClick={() => setTab('acompanhamento')}>{tx({ en: 'Tracking', pt: 'Acompanhamento' })}</button>
          <button role="tab" aria-selected={tab === 'revisao'} onClick={() => setTab('revisao')}>{tx({ en: 'AI review', pt: 'Revisão com IA' })}</button>
        </div>
        {tab === 'conteudo' && <Content id={item.id} />}
        {tab === 'acompanhamento' && <Tracking item={item} onPatch={onPatch} />}
        {/* Always mounted: switching tabs does not interrupt a running review. */}
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
            <CopyButton value={c.content} label={tx({ en: 'Copy content', pt: 'Copiar conteúdo' })} />
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

  // Saves 800 ms after the last keystroke.
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
          toast(tx({ en: `Notes not saved: ${e.message}`, pt: `Notas não salvas: ${e.message}` }))
        })
    }, 800)
    return () => clearTimeout(t)
  }, [notes])

  const setStatus = (status: Status) =>
    saveMeta(item.id, { status })
      .then(() => onPatch({ status }))
      .catch((e: Error) => toast(tx({ en: `Status not saved: ${e.message}`, pt: `Status não salvo: ${e.message}` })))

  return (
    <div className="stack">
      <div className="field">
        <span>Status</span>
        <div className="row" style={{ ['--gap' as string]: '6px' }}>
          {(Object.keys(STATUS) as Status[]).map(s => (
            <button key={s} className="chip" aria-pressed={item.status === s} onClick={() => setStatus(s)} title={tx({ en: `Mark as ${STATUS[s].label}`, pt: `Marcar como ${STATUS[s].label}` })}>
              {STATUS[s].label}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>
          {tx({ en: 'Notes', pt: 'Notas' })}{' '}
          <small className={saving === 'error' ? 'error' : 'muted'}>
            {saving === 'saving' ? tx({ en: 'saving…', pt: 'salvando…' }) : saving === 'saved' ? tx({ en: 'saved', pt: 'salvo' }) : saving === 'error' ? tx({ en: 'not saved', pt: 'não salvo' }) : ''}
          </small>
        </span>
        <textarea className="textarea" rows={5} value={notes} placeholder={tx({ en: 'What is missing, what to test, where the idea came from…', pt: 'O que falta, o que testar, de onde veio a ideia…' })} onChange={e => setNotes(e.target.value)} />
        <small>{tx({ en: 'Kept in ~/.workstuff, never in the item\'s file.', pt: 'Ficam em ~/.workstuff, nunca no arquivo do item.' })}</small>
      </label>
    </div>
  )
}
