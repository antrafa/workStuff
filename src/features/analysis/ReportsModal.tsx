import { FileSearch, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Async, ConfirmModal, Empty, Modal, Search, SkeletonRows, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { deleteReport, fetchReports, type SavedReport } from './api'
import { tx } from '@/lib/i18n'

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
      toast(tx({ en: `Analysis of ${r.name} removed`, pt: `Análise de ${r.name} removida` }))
    } catch (e) {
      toast(tx({ en: `Not removed: ${(e as Error).message}`, pt: `Não removeu: ${(e as Error).message}` }))
    }
  }

  return (
    <Modal title={tx({ en: 'Generated analyses', pt: 'Análises geradas' })} onClose={onClose} width={700}>
      <div className="stack">
        {(state.data?.length ?? 0) > 5 && <Search value={query} onChange={setQuery} placeholder={tx({ en: 'Filter by project…', pt: 'Filtrar por projeto…' })} width={260} />}
        <Async
          state={state}
          isEmpty={d => d.length === 0}
          skeleton={<SkeletonRows rows={3} height={56} />}
          empty={<Empty icon={FileSearch} title={tx({ en: 'No analysis yet', pt: 'Nenhuma análise ainda' })}>{tx({ en: 'Choose a folder and click “Generate report”.', pt: 'Escolha uma pasta e clique em “Gerar relatório”.' })}</Empty>}
        >
          {list =>
            list
              .filter(r => r.pathLabel.toLowerCase().includes(query.trim().toLowerCase()))
              .map(r => (
                <div
                  key={r.projectPath}
                  className={`card report-item ${r.exists ? 'interactive' : ''}`}
                  onClick={() => r.exists && onOpen(r.projectPath)}
                  title={r.exists ? tx({ en: 'Open this report', pt: 'Abrir este relatório' }) : tx({ en: 'The project folder no longer exists', pt: 'A pasta do projeto não existe mais' })}
                >
                  <div className="stack" style={{ ['--gap' as string]: '2px', flex: 1, minWidth: 0 }}>
                    <div className="row"><b>{r.name}</b><Freshness r={r} /></div>
                    <span className="mono muted" style={{ fontSize: 11.5 }}>
                      {r.pathLabel} · {r.gitCommit?.slice(0, 7) ?? tx({ en: 'no git', pt: 'sem git' })} · {r.provider} · {relTime(r.generatedAt)}
                    </span>
                  </div>
                  <button className="btn btn-ghost btn-sm btn-icon" title={tx({ en: `Remove the analysis of ${r.name}`, pt: `Remover a análise de ${r.name}` })} onClick={e => (e.stopPropagation(), setRemoving(r))}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
          }
        </Async>
      </div>
      {removing && (
        <ConfirmModal title={tx({ en: `Remove the analysis of ${removing.name}?`, pt: `Remover a análise de ${removing.name}?` })} confirmLabel={tx({ en: 'Remove', pt: 'Remover' })} icon={Trash2} onClose={() => setRemoving(null)} onConfirm={() => remove(removing)}>
          {tx({ en: 'The report leaves the panel history. The file saved in the project\'s docs/arquitetura/, if any, stays there.', pt: 'O relatório sai do histórico do painel. O arquivo gravado em docs/arquitetura/ do projeto, se houver, continua lá.' })}
        </ConfirmModal>
      )}
    </Modal>
  )
}

function Freshness({ r }: { r: SavedReport }) {
  return (
    <>
      {!r.exists ? <span className="badge badge-crit" title={tx({ en: 'The project folder no longer exists', pt: 'A pasta do projeto não existe mais' })}>{tx({ en: 'folder missing', pt: 'pasta ausente' })}</span>
        : r.stale ? <span className="badge badge-warn" title={tx({ en: 'The project got commits after the analysis', pt: 'O projeto recebeu commits depois da análise' })}>{r.behind ? tx({ en: `${r.behind} commits behind`, pt: `${r.behind} commits atrás` }) : tx({ en: 'outdated', pt: 'desatualizado' })}</span>
        : <span className="badge badge-ok">{tx({ en: 'up to date', pt: 'atualizado' })}</span>}
      {r.reportFile && <span className="badge badge-info" title={r.reportFile}>{tx({ en: 'versioned', pt: 'versionado' })}</span>}
      {r.hasGraph && <span className="badge" title={tx({ en: 'graphify-out/graph.html exists in the project', pt: 'graphify-out/graph.html existe no projeto' })}>{tx({ en: 'graph', pt: 'grafo' })}</span>}
    </>
  )
}
