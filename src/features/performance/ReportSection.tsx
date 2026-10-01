import { FileText, Sparkles, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Async, ConfirmModal, Markdown, Modal, SkeletonRows, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { deleteReport, fetchReport, fetchReports, generateReport, type Observation, type ReportMeta } from './api'

// datetime-local trabalha em horário local, sem fuso; o servidor compara ISO em UTC.
const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocalInput = (v: string) => new Date(v).toISOString()

export function ReportSection({ observation }: { observation: Observation }) {
  const reports = useAsync(fetchReports)
  const [from, setFrom] = useState(toLocalInput(observation.startedAt))
  const [to, setTo] = useState(toLocalInput(observation.stoppedAt ?? new Date().toISOString()))
  const [historyHours, setHistoryHours] = useState(0)
  const [running, setRunning] = useState<{ status: string; text: string } | null>(null)
  const [open, setOpen] = useState<ReportMeta | null>(null)
  const [deleting, setDeleting] = useState<ReportMeta | null>(null)
  const abort = useRef<AbortController | null>(null)
  const toast = useToast()
  useEffect(() => () => abort.current?.abort(), [])

  const generate = async () => {
    abort.current = new AbortController()
    setRunning({ status: 'preparando os dados…', text: '' })
    let done: ReportMeta | null = null
    try {
      await generateReport(observation.id, { from: fromLocalInput(from), to: fromLocalInput(to), historyHours }, e => {
        if (e.type === 'status') setRunning(r => r && { ...r, status: e.message })
        if (e.type === 'text') setRunning(r => r && { status: 'escrevendo o relatório…', text: r.text + e.text })
        if (e.type === 'error') toast(`Relatório não gerado: ${e.message}`)
        if (e.type === 'done') done = e.report
      }, abort.current.signal)
    } catch (e) {
      toast((e as Error).message)
    }
    setRunning(null)
    reports.reload()
    if (done) setOpen(done)
  }

  const mine = reports.data?.filter(r => r.observationId === observation.id) ?? []

  return (
    <section className="card">
      <div className="card-head"><div className="card-title">Relatório com IA</div></div>
      <div className="card-pad stack">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field"><span>De</span><input className="input" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="field"><span>Até</span><input className="input" type="datetime-local" value={to} onChange={e => setTo(e.target.value)} /></label>
          <label className="field">
            <span>Histórico do Prometheus</span>
            <select className="select" value={historyHours} onChange={e => setHistoryHours(Number(e.target.value))} title="Inclui horas anteriores reconstruídas do Prometheus, se o cluster permitir">
              {[0, 6, 24, 72].map(h => <option key={h} value={h}>{h === 0 ? 'não incluir' : `incluir ${h}h`}</option>)}
            </select>
          </label>
          {running ? (
            <button className="btn" onClick={() => abort.current?.abort()} title="Interrompe a geração"><Square size={13} /> Parar</button>
          ) : (
            <button className="btn btn-primary" onClick={generate} title="Envia os pontos agregados ao provedor de IA de Configurações e salva o relatório">
              <Sparkles size={14} /> Gerar relatório
            </button>
          )}
        </div>
        {running && (
          <div className="stack" style={{ ['--gap' as string]: '6px' }}>
            <span className="muted" style={{ fontSize: 12.5 }}><Sparkles size={12} className="spin" /> {running.status}</span>
            {running.text && <div className="perf-report"><Markdown>{running.text}</Markdown></div>}
          </div>
        )}
        <span className="eyebrow">Relatórios desta observação</span>
        <Async state={reports} isEmpty={() => mine.length === 0} skeleton={<SkeletonRows rows={2} height={36} />} empty={<span className="muted">Nenhum relatório gerado para esta observação.</span>}>
          {() => (
            <div className="stack" style={{ ['--gap' as string]: '6px' }}>
              {mine.map(r => (
                <div key={r.id} className="row report-row">
                  <FileText size={14} className="muted" />
                  <span className="spacer">{new Date(r.from).toLocaleString('pt-BR')} → {new Date(r.to).toLocaleString('pt-BR')}{r.historyHours ? ` · +${r.historyHours}h de histórico` : ''}</span>
                  <span className="muted mono" style={{ fontSize: 11.5 }}>{r.provider}/{r.model} · {relTime(r.generatedAt)}</span>
                  <button className="btn btn-sm" onClick={() => setOpen(r)}>Abrir</button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setDeleting(r)} title="Apagar relatório"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </Async>
      </div>
      {open && <ReportModal meta={open} onClose={() => setOpen(null)} />}
      {deleting && (
        <ConfirmModal
          title="Apagar o relatório?"
          confirmLabel="Apagar"
          icon={Trash2}
          onClose={() => setDeleting(null)}
          onConfirm={() => void deleteReport(deleting.id).then(() => (toast('Relatório apagado'), reports.reload()), e => toast((e as Error).message))}
        >
          O relatório de {new Date(deleting.generatedAt).toLocaleString('pt-BR')} é apagado. A observação e os pontos coletados continuam.
        </ConfirmModal>
      )}
    </section>
  )
}

function ReportModal({ meta, onClose }: { meta: ReportMeta; onClose: () => void }) {
  const report = useAsync(() => fetchReport(meta.id), [meta.id])
  return (
    <Modal title={`Relatório · ${meta.namespace}`} onClose={onClose} width={760}>
      <Async state={report} skeleton={<SkeletonRows rows={5} height={18} />}>
        {r => <div className="perf-report"><Markdown>{r.report}</Markdown></div>}
      </Async>
    </Modal>
  )
}
