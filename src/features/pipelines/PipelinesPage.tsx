import './pipelines.css'
import { ExternalLink, Plus, RotateCw, Trash2, Workflow } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Async, ConfirmModal, Empty, Modal, Page, SkeletonRows, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { usePolling } from '@/features/cluster/usePolling'
import { fetchSources, type Source } from '@/features/repos/api'
import { PipelineDetail } from './PipelineDetail'
import { STATUS, addWatch, duration, fetchWatches, removeWatch, type Watch } from './api'

export default function PipelinesPage() {
  const watches = useAsync(fetchWatches)
  const sources = useAsync(fetchSources)
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Watch | null>(null)
  const toast = useToast()
  usePolling(watches.reload, !adding)

  const list = watches.data ?? []
  const current = list.find(w => w.id === selected) ?? null
  const noSources = sources.data?.length === 0

  const remove = async (w: Watch) => {
    try {
      await removeWatch(w.id)
      if (selected === w.id) setSelected(null)
      toast(`${w.fullPath} não é mais acompanhado`)
      watches.reload()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Page
      title="Pipelines"
      hint="Status das esteiras dos projetos que você acompanha no GitLab CI e no GitHub Actions. No job que falhou, a IA lê o log e explica a causa."
      actions={
        <>
          <button className="btn" onClick={watches.reload} title="Atualiza agora; a tela também atualiza sozinha a cada 30s">
            <RotateCw size={14} className={watches.loading ? 'spin' : ''} /> Atualizar
          </button>
          {!noSources && <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={14} /> Acompanhar projeto</button>}
        </>
      }
    >
      {noSources ? (
        <div className="card">
          <Empty icon={Workflow} title="Nenhuma conexão com GitLab ou GitHub" action={<Link className="btn btn-primary" to="/repositorios">Criar conexão</Link>}>
            As pipelines usam as conexões e os tokens da tela Repositórios.
          </Empty>
        </div>
      ) : (
        <Async
          state={watches}
          isEmpty={d => d.length === 0}
          skeleton={<SkeletonRows rows={3} height={48} />}
          empty={
            <div className="card">
              <Empty icon={Workflow} title="Nenhum projeto acompanhado" action={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={14} /> Acompanhar projeto</button>}>
                Escolha os projetos cuja esteira você quer ver aqui.
              </Empty>
            </div>
          }
        >
          {data => (
            <section className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Projeto</th>
                      <th>Última pipeline</th>
                      <th>Branch</th>
                      <th>Quando</th>
                      <th className="num">Duração</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.map(w => (
                      <WatchRow key={w.id} watch={w} selected={w.id === selected} onSelect={() => setSelected(w.id === selected ? null : w.id)} onRemove={() => setRemoving(w)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </Async>
      )}

      {current && !current.error && <PipelineDetail key={current.id} watch={current} />}
      {adding && <AddModal sources={sources.data ?? []} onClose={() => setAdding(false)} onAdded={() => (setAdding(false), watches.reload())} />}
      {removing && (
        <ConfirmModal title="Parar de acompanhar" confirmLabel="Parar de acompanhar" icon={Trash2} onConfirm={() => remove(removing)} onClose={() => setRemoving(null)}>
          <p>{removing.fullPath} sai desta lista. Nada muda no {removing.provider === 'github' ? 'GitHub' : 'GitLab'}.</p>
        </ConfirmModal>
      )}
    </Page>
  )
}

type RowProps = { watch: Watch; selected: boolean; onSelect: () => void; onRemove: () => void }

function WatchRow({ watch: w, selected, onSelect, onRemove }: RowProps) {
  const p = w.latest
  return (
    <tr className={`pl-row${selected ? ' pl-selected' : ''}`} onClick={w.error ? undefined : onSelect}>
      <td>
        <div className="mono">{w.fullPath}</div>
        <div className="muted" style={{ fontSize: 12 }}>{w.sourceLabel ?? 'conexão removida'}</div>
      </td>
      {w.error ? (
        <td colSpan={4}><span className="badge badge-crit">erro</span> <span className="muted" style={{ fontSize: 12.5 }}>{w.error}</span></td>
      ) : p ? (
        <>
          <td><span className={`badge ${STATUS[p.status].badge}`}>{STATUS[p.status].label}</span></td>
          <td className="mono">{p.ref}</td>
          <td className="muted">{relTime(p.createdAt)}</td>
          <td className="num mono">{duration(p.durationSec)}</td>
        </>
      ) : (
        <td colSpan={4} className="muted">nenhuma pipeline ainda</td>
      )}
      <td className="num" onClick={e => e.stopPropagation()}>
        <div className="row" style={{ ['--gap' as string]: '4px', justifyContent: 'flex-end' }}>
          {p && <a className="btn btn-ghost btn-sm btn-icon" href={p.webUrl} target="_blank" rel="noreferrer" title="Abrir a pipeline no navegador"><ExternalLink size={14} /></a>}
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onRemove} title="Parar de acompanhar"><Trash2 size={14} /></button>
        </div>
      </td>
    </tr>
  )
}

type AddProps = { sources: Source[]; onClose: () => void; onAdded: () => void }

function AddModal({ sources, onClose, onAdded }: AddProps) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '')
  const [fullPath, setFullPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const source = sources.find(s => s.id === sourceId)
  const example = source?.provider === 'github' ? 'dono/repositorio' : `${source?.basePath || 'grupo'}/projeto`

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await addWatch(sourceId, fullPath.trim())
      onAdded()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Acompanhar projeto"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!sourceId || !fullPath.trim() || saving} onClick={save}>
            {saving ? 'Conferindo…' : 'Acompanhar'}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span>Conexão</span>
          <select className="select" value={sourceId} onChange={e => setSourceId(e.target.value)}>
            {sources.map(s => <option key={s.id} value={s.id}>{s.label} ({s.url})</option>)}
          </select>
        </label>
        <label className="field">
          <span>Projeto</span>
          <input className="input mono" value={fullPath} onChange={e => setFullPath(e.target.value)} onKeyDown={e => e.key === 'Enter' && fullPath.trim() && save()} placeholder={example} autoFocus />
          <small>Caminho completo, como aparece na URL do projeto. O painel confere que ele existe antes de salvar.</small>
        </label>
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
      </div>
    </Modal>
  )
}
