import { FileSearch, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Async, ConfirmModal, Empty, Modal, Search, SkeletonRows, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { deleteReport, fetchReports, type SavedReport } from './api'

type Props = { onClose: () => void; onOpen: (path: string) => void }

export function ReportsModal({ onClose, onOpen }: Props) {
  const state = useAsync(fetchReports)
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<SavedReport | null>(null)
  const toast = useToast()

  const remove = async (r: SavedReport) => {
    try {
      await deleteReport(r.projectPath)
      state.setData((state.data ?? []).filter(x => x.projectPath !== r.projectPath))
      toast(`Análise de ${r.name} removida`)
    } catch (e) {
      toast(`Não removeu: ${(e as Error).message}`)
    }
  }

  return (
    <Modal title="Análises geradas" onClose={onClose} width={700}>
      <div className="stack">
        {(state.data?.length ?? 0) > 5 && <Search value={query} onChange={setQuery} placeholder="Filtrar por projeto…" width={260} />}
        <Async
          state={state}
          isEmpty={d => d.length === 0}
          skeleton={<SkeletonRows rows={3} height={56} />}
          empty={<Empty icon={FileSearch} title="Nenhuma análise ainda">Escolha uma pasta e clique em “Gerar relatório”.</Empty>}
        >
          {list =>
            list
              .filter(r => r.pathLabel.toLowerCase().includes(query.trim().toLowerCase()))
              .map(r => (
                <div
                  key={r.projectPath}
                  className={`card report-item ${r.exists ? 'interactive' : ''}`}
                  onClick={() => r.exists && onOpen(r.projectPath)}
                  title={r.exists ? 'Abrir este relatório' : 'A pasta do projeto não existe mais'}
                >
                  <div className="stack" style={{ ['--gap' as string]: '2px', flex: 1, minWidth: 0 }}>
                    <div className="row"><b>{r.name}</b><Freshness r={r} /></div>
                    <span className="mono muted" style={{ fontSize: 11.5 }}>
                      {r.pathLabel} · {r.gitCommit?.slice(0, 7) ?? 'sem git'} · {r.provider} · {relTime(r.generatedAt)}
                    </span>
                  </div>
                  <button className="btn btn-ghost btn-sm btn-icon" title={`Remover a análise de ${r.name}`} onClick={e => (e.stopPropagation(), setRemoving(r))}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
          }
        </Async>
      </div>
      {removing && (
        <ConfirmModal title={`Remover a análise de ${removing.name}?`} confirmLabel="Remover" icon={Trash2} onClose={() => setRemoving(null)} onConfirm={() => remove(removing)}>
          O relatório sai do histórico do painel. O arquivo gravado em docs/arquitetura/ do projeto, se houver, continua lá.
        </ConfirmModal>
      )}
    </Modal>
  )
}

function Freshness({ r }: { r: SavedReport }) {
  return (
    <>
      {!r.exists ? <span className="badge badge-crit" title="A pasta do projeto não existe mais">pasta ausente</span>
        : r.stale ? <span className="badge badge-warn" title="O projeto recebeu commits depois da análise">{r.behind ? `${r.behind} commits atrás` : 'desatualizado'}</span>
        : <span className="badge badge-ok">atualizado</span>}
      {r.reportFile && <span className="badge badge-info" title={r.reportFile}>versionado</span>}
      {r.hasGraph && <span className="badge" title="graphify-out/graph.html existe no projeto">grafo</span>}
    </>
  )
}
