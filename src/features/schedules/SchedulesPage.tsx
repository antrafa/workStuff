import { BellRing, Pause, Play, Plus, RotateCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Async, ConfirmModal, Empty, Modal, Page, SkeletonRows, useToast } from '@/ui'
import { api } from '@/lib/api'
import { relTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { tx } from '@/lib/i18n'
import { fetchKubeconfigs } from '@/features/cluster/api'
import { usePolling } from '@/features/cluster/usePolling'
import { fetchWatches } from '@/features/pipelines/api'

type Kind = 'pipeline' | 'certificado' | 'pods' | 'vulnerabilidades'
type Schedule = { id: string; kind: Kind; label: string; intervalMin: number; enabled: boolean; lastRun: string | null; lastState: 'ok' | 'problema' | 'erro' | null; lastSummary: string }
type Alert = { at: string; label: string; state: 'problema' | 'recuperado'; summary: string; notified: boolean }
type Data = { schedules: Schedule[]; alerts: Alert[]; platform: string }

const KIND_LABEL: Record<Kind, string> = tx({
  en: { pipeline: 'Broken pipeline', certificado: 'Certificate expiring', pods: 'Pods with problems', vulnerabilidades: 'Critical flaw in the dependencies' },
  pt: { pipeline: 'Pipeline quebrada', certificado: 'Certificado vencendo', pods: 'Pods com problema', vulnerabilidades: 'Falha crítica nas dependências' },
})
const STATE_BADGE = { ok: 'badge-ok', problema: 'badge-crit', erro: 'badge-warn' }
// The stored states are Portuguese ids; only their labels follow the language
const STATE_LABEL: Record<string, string> = tx({
  en: { ok: 'ok', problema: 'problem', erro: 'error', recuperado: 'recovered' },
  pt: { ok: 'ok', problema: 'problema', erro: 'erro', recuperado: 'recuperado' },
})

export default function SchedulesPage() {
  const state = useAsync(() => api.get<Data>('/schedules'))
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<Schedule | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const toast = useToast()
  usePolling(state.reload, !creating)

  const call = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id)
    try {
      await fn()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
      state.reload()
    }
  }

  return (
    <Page
      title={tx({ en: 'Scheduled checks', pt: 'Verificações agendadas' })}
      hint={tx({ en: 'The panel checks what you register every so often and sends a system notification when something changes state. It only runs while the server is up.', pt: 'O painel confere de tempos em tempos o que você cadastrar e avisa por notificação do sistema quando algo muda de estado. Só roda enquanto o servidor está no ar.' })}
      actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={14} /> {tx({ en: 'New check', pt: 'Nova verificação' })}</button>}
    >
      <Async state={state} skeleton={<SkeletonRows rows={3} height={48} />}>
        {d => (
          <>
            {d.platform === 'win32' && <div className="callout callout-info" style={{ fontSize: 12.5 }}>{tx({ en: 'On Windows the alert stays only in the history below: there is no native notification without an extra module.', pt: 'No Windows o aviso fica só no histórico abaixo: não há notificação nativa sem módulo extra.' })}</div>}
            <section className="card">
              {d.schedules.length === 0 ? (
                <Empty icon={BellRing} title={tx({ en: 'No check', pt: 'Nenhuma verificação' })} action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={14} /> {tx({ en: 'New check', pt: 'Nova verificação' })}</button>}>
                  {tx({ en: "E.g. alert when a project's pipeline breaks or a certificate is 30 days from expiring.", pt: 'Ex.: avisar quando a pipeline de um projeto quebrar ou um certificado estiver a 30 dias de vencer.' })}
                </Empty>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{tx({ en: 'Check', pt: 'Verificação' })}</th><th>{tx({ en: 'State', pt: 'Estado' })}</th><th>{tx({ en: 'Last', pt: 'Última' })}</th><th className="num">{tx({ en: 'Every', pt: 'A cada' })}</th><th /></tr></thead>
                    <tbody>
                      {d.schedules.map(s => (
                        <tr key={s.id} style={{ opacity: s.enabled ? 1 : 0.55 }}>
                          <td><div>{s.label}</div><div className="muted" style={{ fontSize: 11.5 }}>{KIND_LABEL[s.kind]}</div></td>
                          <td>
                            {s.lastState ? <span className={`badge ${STATE_BADGE[s.lastState]}`}>{STATE_LABEL[s.lastState]}</span> : <span className="muted">{tx({ en: 'not run yet', pt: 'ainda não rodou' })}</span>}
                            {s.lastSummary && <div className="muted" style={{ fontSize: 12 }}>{s.lastSummary}</div>}
                          </td>
                          <td className="muted">{s.lastRun ? relTime(s.lastRun) : '—'}</td>
                          <td className="num mono">{s.intervalMin} min</td>
                          <td className="num">
                            <div className="row" style={{ ['--gap' as string]: '4px', justifyContent: 'flex-end' }}>
                              <button className="btn btn-ghost btn-sm btn-icon" disabled={busy === s.id} title={tx({ en: 'Run now', pt: 'Rodar agora' })} onClick={() => call(s.id, () => api.post(`/schedules/${s.id}/run`))}><RotateCw size={13} className={busy === s.id ? 'spin' : ''} /></button>
                              <button className="btn btn-ghost btn-sm btn-icon" title={s.enabled ? tx({ en: 'Pause', pt: 'Pausar' }) : tx({ en: 'Resume', pt: 'Retomar' })} onClick={() => call(s.id, () => api.patch(`/schedules/${s.id}`, { enabled: !s.enabled }))}>{s.enabled ? <Pause size={13} /> : <Play size={13} />}</button>
                              <button className="btn btn-ghost btn-sm btn-icon" title={tx({ en: 'Delete', pt: 'Apagar' })} onClick={() => setRemoving(s)}><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            {d.alerts.length > 0 && (
              <section className="card">
                <div className="card-head"><div className="card-title spacer">{tx({ en: 'Recent alerts', pt: 'Avisos recentes' })}</div></div>
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      {d.alerts.map((a, i) => (
                        <tr key={i}>
                          <td className="muted" style={{ whiteSpace: 'nowrap' }}>{relTime(a.at)}</td>
                          <td><span className={`badge ${a.state === 'problema' ? 'badge-crit' : 'badge-ok'}`}>{STATE_LABEL[a.state]}</span></td>
                          <td>{a.label}<div className="muted" style={{ fontSize: 12 }}>{a.summary}</div></td>
                          <td className="muted" style={{ fontSize: 12 }}>{a.notified ? tx({ en: 'notified', pt: 'notificado' }) : tx({ en: 'history only', pt: 'só no histórico' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </Async>
      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={() => (setCreating(false), state.reload())} />}
      {removing && (
        <ConfirmModal title={tx({ en: 'Delete check', pt: 'Apagar verificação' })} confirmLabel={tx({ en: 'Delete', pt: 'Apagar' })} icon={Trash2} onConfirm={() => call(removing.id, () => api.delete(`/schedules/${removing.id}`))} onClose={() => setRemoving(null)}>
          <p>{tx({ en: `${removing.label} is no longer checked. The alert history stays.`, pt: `${removing.label} deixa de ser conferida. O histórico de avisos continua.` })}</p>
        </ConfirmModal>
      )}
    </Page>
  )
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [kind, setKind] = useState<Kind>('pipeline')
  const [intervalMin, setIntervalMin] = useState('15')
  const [params, setParams] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const watches = useAsync(fetchWatches)
  const kubeconfigs = useAsync(fetchKubeconfigs)
  const set = (k: string, v: string) => setParams(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const created = await api.post<{ id: string }>('/schedules', { kind, intervalMin: Number(intervalMin), params })
      // Runs once right away: the person sees whether the check works without waiting for the first interval.
      await api.post(`/schedules/${created.id}/run`).catch(() => {})
      onCreated()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const kc = kubeconfigs.data?.items.find(k => k.id === params.kubeconfigId)
  return (
    <Modal title={tx({ en: 'New check', pt: 'Nova verificação' })} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{tx({ en: 'Cancel', pt: 'Cancelar' })}</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? tx({ en: 'Creating…', pt: 'Criando…' }) : tx({ en: 'Create and run now', pt: 'Criar e rodar agora' })}</button></>}>
      <div className="stack">
        <label className="field">
          <span>{tx({ en: 'What to check', pt: 'O que conferir' })}</span>
          <select className="select" value={kind} onChange={e => (setKind(e.target.value as Kind), setParams({}))}>
            {(Object.keys(KIND_LABEL) as Kind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        {kind === 'pipeline' && (
          <label className="field">
            <span>{tx({ en: 'Project', pt: 'Projeto' })}</span>
            <select className="select" value={params.watchId ?? ''} onChange={e => set('watchId', e.target.value)}>
              <option value="">{tx({ en: 'choose a project followed on the Pipelines screen', pt: 'escolha um projeto acompanhado na tela Pipelines' })}</option>
              {(watches.data ?? []).map(w => <option key={w.id} value={w.id}>{w.fullPath}</option>)}
            </select>
          </label>
        )}
        {kind === 'certificado' && (
          <label className="field">
            <span>Host</span>
            <input className="input mono" value={params.host ?? ''} onChange={e => set('host', e.target.value.trim())} placeholder="app.exemplo.com" />
            <small>{tx({ en: 'Alerts when 30 days or less are left, or if it already expired.', pt: 'Avisa quando faltarem 30 dias ou menos, ou se já venceu.' })}</small>
          </label>
        )}
        {kind === 'pods' && (
          <>
            <label className="field">
              <span>Kubeconfig</span>
              <select className="select" value={params.kubeconfigId ?? ''} onChange={e => setParams({ kubeconfigId: e.target.value, namespace: params.namespace ?? '' })}>
                <option value="">{tx({ en: 'choose', pt: 'escolha' })}</option>
                {(kubeconfigs.data?.items ?? []).map(k => <option key={k.id} value={k.id}>{k.id}{k.environment ? ` (${k.environment})` : ''}</option>)}
              </select>
            </label>
            {kc && kc.contexts.length > 1 && (
              <select className="select" value={params.context ?? kc.currentContext} onChange={e => set('context', e.target.value)}>
                {kc.contexts.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <label className="field">
              <span>Namespace</span>
              <input className="input mono" value={params.namespace ?? ''} onChange={e => set('namespace', e.target.value.trim())} placeholder="namespace" />
              <small>{tx({ en: 'Alerts when a pod is in a critical state (CrashLoop, image failure, 3+ restarts).', pt: 'Avisa quando algum pod estiver em estado crítico (CrashLoop, falha de imagem, 3+ restarts).' })}</small>
            </label>
          </>
        )}
        {kind === 'vulnerabilidades' && (
          <label className="field">
            <span>{tx({ en: 'Project folder', pt: 'Pasta do projeto' })}</span>
            <input className="input mono" value={params.path ?? ''} onChange={e => set('path', e.target.value)} placeholder={tx({ en: '~/workspace/project', pt: '~/workspace/projeto' })} />
            <small>{tx({ en: 'Alerts when a critical or high flaw shows up in the dependencies (OSV database).', pt: 'Avisa quando aparecer falha crítica ou alta nas dependências (base OSV).' })}</small>
          </label>
        )}
        <label className="field">
          <span>{tx({ en: 'Every', pt: 'A cada' })}</span>
          <select className="select" value={intervalMin} onChange={e => setIntervalMin(e.target.value)}>
            {['5', '15', '30', '60', '360', '1440'].map(m => <option key={m} value={m}>{Number(m) < 60 ? `${m} min` : `${Number(m) / 60} h`}</option>)}
          </select>
        </label>
        {error && <div className="callout callout-crit" style={{ fontSize: 12.5 }}>{error}</div>}
      </div>
    </Modal>
  )
}
