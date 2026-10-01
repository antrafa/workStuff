import { FolderOpen, FolderPlus, Loader2, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Modal, useToast } from '@/ui'
import { createItem, pickFolder, saveRoots, type CatalogRoot, type Kind } from './api'
import { KIND_SINGULAR } from './labels'

type RootsProps = { roots: CatalogRoot[]; onSaved: () => void; onClose: () => void }

export function RootsModal({ roots: initial, onSaved, onClose }: RootsProps) {
  const [roots, setRoots] = useState(initial.map(r => r.path))
  const [input, setInput] = useState('')
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const missing = new Set(initial.filter(r => r.missing).map(r => r.path))

  const add = (path: string) => {
    const p = path.trim()
    if (p && !roots.includes(p)) setRoots(r => [...r, p])
    setInput('')
  }

  const pick = async () => {
    setPicking(true)
    setError(null)
    try {
      const { path } = await pickFolder()
      if (path) add(path)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPicking(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveRoots(roots)
      toast(`Catálogo lendo ${roots.length} pasta(s)`)
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Pastas do catálogo"
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} title="Grava a lista em ~/.workstuff/catalog.json">
            {saving && <Loader2 size={14} className="spin" />} Salvar pastas
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          O catálogo varre estas pastas e junta tudo: skills (pastas com SKILL.md), rules, personas, prompts, templates e notas.
        </p>
        {roots.length === 0 && <div className="callout"><FolderOpen size={16} />Nenhuma pasta ainda. Adicione ao menos uma.</div>}
        {roots.map(r => (
          <div key={r} className="row root-row">
            <span className="mono spacer">{r}</span>
            {missing.has(r) && <span className="badge badge-crit">pasta sumiu</span>}
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setRoots(x => x.filter(y => y !== r))} title={`Tirar ${r} do catálogo (os arquivos continuam na pasta)`}>
              <X size={13} />
            </button>
          </div>
        ))}
        <div className="row">
          <input className="input mono" style={{ flex: 1 }} value={input} placeholder="~/workspace/pessoal/skills" onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add(input)} />
          <button className="btn" onClick={() => add(input)} disabled={!input.trim()}><FolderPlus size={14} /> Adicionar</button>
          <button className="btn" onClick={pick} disabled={picking} title="Abre o seletor de pasta do sistema">
            {picking ? <Loader2 size={14} className="spin" /> : <FolderOpen size={14} />} Selecionar pasta
          </button>
        </div>
        {error && <div className="callout callout-crit">{error}</div>}
      </div>
    </Modal>
  )
}

const CREATABLE: Exclude<Kind, 'nota'>[] = ['skill', 'prompt', 'rule', 'persona', 'template']
const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/
const FILE_OF: Record<(typeof CREATABLE)[number], (slug: string) => string> = {
  skill: s => `${s}/SKILL.md`, prompt: s => `prompt-${s}.md`, rule: s => `rule-${s}.md`, persona: s => `persona-${s}.md`, template: s => `template-${s}.md`,
}

type CreateProps = { roots: CatalogRoot[]; onCreated: () => void; onClose: () => void }

export function CreateModal({ roots, onCreated, onClose }: CreateProps) {
  const available = roots.filter(r => !r.missing)
  const [root, setRoot] = useState(available[0]?.path ?? '')
  const [kind, setKind] = useState<(typeof CREATABLE)[number]>('skill')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const slugOk = SLUG.test(slug)

  const create = async () => {
    setSaving(true)
    setError(null)
    try {
      await createItem({ root, kind, slug, description })
      toast('Criado e aberto no editor')
      onCreated()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Novo item do catálogo"
      onClose={onClose}
      width={540}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!root || !slugOk || !description.trim() || saving} onClick={create}>
            {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Criar e abrir
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span>Pasta</span>
          <select className="select" value={root} onChange={e => setRoot(e.target.value)}>
            {available.map(r => <option key={r.path} value={r.path}>{r.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Tipo</span>
          <select className="select" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
            {CREATABLE.map(k => <option key={k} value={k}>{KIND_SINGULAR[k]}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Nome</span>
          <input className={`input mono ${slug && !slugOk ? 'invalid' : ''}`} value={slug} placeholder="revisar-pr" onChange={e => setSlug(e.target.value)} />
          {slug && !slugOk ? <small className="error">Use letras minúsculas, números e hífen, sem acento.</small> : <small className="mono">{FILE_OF[kind](slug || 'nome')}</small>}
        </label>
        <label className="field">
          <span>Descrição</span>
          <textarea className="textarea" rows={3} value={description} placeholder="Quando o agente deve usar este item" onChange={e => setDescription(e.target.value)} />
          <small>Vai para o frontmatter: é o que o agente lê para decidir se aplica.</small>
        </label>
        {error && <div className="callout callout-crit">{error}</div>}
      </div>
    </Modal>
  )
}
