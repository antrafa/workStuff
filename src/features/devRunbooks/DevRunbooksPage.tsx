import './devRunbooks.css'
import { BookOpen, FolderOpen, RotateCcw, Terminal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Async, Empty, Modal, Page, SkeletonRows } from '@/ui'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { DevRunbookDoc } from './DevRunbookDoc'

type DevRunbookItem = { file: string; title: string }
type DevRunbooksResponse = {
  root: string | null
  isDefault?: boolean
  defaultRoot?: string
  runbooks: DevRunbookItem[]
}

export default function DevRunbooksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedFile = searchParams.get('file')
  const list = useAsync(() => api.get<DevRunbooksResponse>('/dev-runbooks'))
  const [file, setFile] = useState<string | null>(requestedFile)
  const [rootInput, setRootInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (requestedFile && list.data?.runbooks.some(r => r.file === requestedFile)) {
      setFile(requestedFile)
    } else if (!file && list.data?.runbooks && list.data.runbooks.length > 0) {
      const defaultItem = list.data.runbooks.find(r => r.file.startsWith('factory/')) ?? list.data.runbooks[0]
      setFile(defaultItem.file)
    }
  }, [list.data, requestedFile])

  const handleSelectFile = (selected: string) => {
    setFile(selected)
    setSearchParams(prev => {
      const p = new URLSearchParams(prev)
      p.set('file', selected)
      return p
    }, { replace: true })
  }

  const setRoot = async (root: string) => {
    setError(null)
    try {
      await api.put('/dev-runbooks/root', { root })
      setFile(null)
      setModalOpen(false)
      list.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const grouped = useMemo(() => {
    if (!list.data?.runbooks) return []
    const map = new Map<string, DevRunbookItem[]>()
    for (const r of list.data.runbooks) {
      const slash = r.file.indexOf('/')
      const section = slash > 0 ? r.file.slice(0, slash) : 'outros'
      const arr = map.get(section) ?? []
      arr.push(r)
      map.set(section, arr)
    }
    const order = ['factory', 'git', 'containers', 'ambiente', 'outros']
    const keys = [...map.keys()].sort((a, b) => {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.localeCompare(b)
    })
    const labels: Record<string, string> = {
      factory: 'Fábrica de Software',
      git: 'Git & Branches',
      containers: 'Containers & Docker',
      ambiente: 'Ambiente Local',
      outros: 'Outros Procedimentos',
    }
    return keys.map(k => ({
      key: k,
      label: labels[k] ?? k,
      items: map.get(k)!,
      isFactory: k === 'factory',
    }))
  }, [list.data?.runbooks])

  const pick = async () => {
    const { path } = await api.post<{ path: string | null }>('/dev-runbooks/pick-folder').catch(e => (setError((e as Error).message), { path: null }))
    if (path) await setRoot(path)
  }

  return (
    <Page
      title="Runbooks de Dev"
      hint="Comandos e rotinas locais de desenvolvimento para o dia a dia (Git, Docker, npm/pnpm). Leitura roda direto; comandos com modificação exibem o comando exato e pedem confirmação."
    >
      <Async state={list} skeleton={<SkeletonRows rows={2} height={40} />}>
        {d => !d.root ? (
          <div className="card card-pad stack">
            <Empty icon={Terminal} title="Escolha a pasta dos runbooks de dev">
              Cada arquivo .md é um runbook; linhas de comandos bash/sh viram passos executados com segurança na máquina local.
            </Empty>
            <form className="row" onSubmit={e => (e.preventDefault(), setRoot(rootInput))}>
              <input className="input mono spacer" value={rootInput} onChange={e => setRootInput(e.target.value)} placeholder="~/dev-runbooks" />
              <button type="button" className="btn" onClick={pick}><FolderOpen size={14} /> Escolher</button>
              <button className="btn btn-primary" disabled={!rootInput.trim()}>Usar esta pasta</button>
            </form>
            {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
          </div>
        ) : (
          <div className="drb-layout">
            <aside className="card drb-list">
              <div className="card-head">
                <div className="card-title spacer mono" style={{ minWidth: 0 }} title={d.root}>
                  <div className="row" style={{ alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.isDefault ? 'Runbooks do projeto' : d.root}
                    </span>
                    {d.isDefault && <span className="badge badge-info" style={{ fontSize: 10, flexShrink: 0 }}>projeto</span>}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => (setRootInput(d.root ?? ''), setModalOpen(true))}>
                  Trocar
                </button>
              </div>
              {d.runbooks.length === 0 ? (
                <p className="muted card-pad" style={{ fontSize: 12.5 }}>Nenhum .md nesta pasta.</p>
              ) : (
                grouped.map(g => (
                  <div key={g.key}>
                    <div className={`drb-group-header${g.isFactory ? ' drb-group-factory' : ''}`}>
                      <span>{g.label} ({g.items.length})</span>
                      {g.isFactory && <span className="badge badge-info" style={{ fontSize: 9 }}>esteira</span>}
                    </div>
                    {g.items.map(r => (
                      <button
                        key={r.file}
                        type="button"
                        className={`drb-item${r.file === file ? ' drb-active' : ''}`}
                        onClick={() => handleSelectFile(r.file)}
                      >
                        <div>{r.title}</div>
                        <div className="muted mono" style={{ fontSize: 11 }}>{r.file}</div>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </aside>
            {file ? <DevRunbookDoc key={file} file={file} /> : <div className="card"><Empty icon={BookOpen} title="Escolha um runbook de dev" /></div>}
          </div>
        )}
      </Async>

      {modalOpen && list.data && (
        <Modal title="Pasta dos runbooks de dev" onClose={() => setModalOpen(false)} width={520}>
          <div className="stack">
            <p className="muted" style={{ fontSize: 13 }}>
              Você pode carregar runbooks a partir de qualquer pasta no computador ou usar os runbooks de desenvolvimento incluídos no projeto.
            </p>
            <form className="row" onSubmit={e => (e.preventDefault(), setRoot(rootInput))}>
              <input
                className="input mono spacer"
                value={rootInput}
                onChange={e => setRootInput(e.target.value)}
                placeholder="~/dev-runbooks"
              />
              <button type="button" className="btn" onClick={pick}>
                <FolderOpen size={14} /> Escolher…
              </button>
              <button className="btn btn-primary" disabled={!rootInput.trim() || rootInput === list.data.root}>
                Usar pasta
              </button>
            </form>
            {!list.data.isDefault && (
              <div style={{ paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRoot('default')}>
                  <RotateCcw size={13} /> Voltar para runbooks do projeto
                </button>
              </div>
            )}
            {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
          </div>
        </Modal>
      )}
    </Page>
  )
}
