import { CalendarCheck } from 'lucide-react'
import { useState } from 'react'
import { CopyButton } from '@/ui'
import { api } from '@/lib/api'
import { tx } from '@/lib/i18n'
import type { Watch } from '@/features/pipelines/api'
import { STATE, fetchQueue } from '@/features/review/QueueTab'
import { buildDailyText } from './dailyText'

type Daily = { since: string; repos: { name: string; commits: { subject: string }[] }[]; noIdentity: number }

// Built on click, not on load: it runs git log in every clone and calls each repository server
export function DailyCard({ watches }: { watches: Watch[] }) {
  const [text, setText] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const build = async () => {
    setLoading(true)
    const [daily, queue] = await Promise.allSettled([api.get<Daily>('/repos/workspace/daily'), fetchQueue()])
    const problems: string[] = []
    if (daily.status === 'rejected') problems.push(tx({ en: `commits: ${daily.reason.message}`, pt: `commits: ${daily.reason.message}` }))
    else if (daily.value.noIdentity > 0) problems.push(tx({ en: `${daily.value.noIdentity} clone(s) without git user.email were skipped`, pt: `${daily.value.noIdentity} clone(s) sem user.email do git ficaram de fora` }))
    if (queue.status === 'rejected') problems.push(tx({ en: `MRs: ${queue.reason.message}`, pt: `MRs: ${queue.reason.message}` }))
    else problems.push(...queue.value.errors.map(e => (e.source ? `MRs ${e.source}: ${e.error}` : `MRs: ${e.error}`)))
    setText(buildDailyText({
      since: daily.status === 'fulfilled' ? daily.value.since : new Date(Date.now() - 86_400_000).toISOString(),
      repos: daily.status === 'fulfilled' ? daily.value.repos : [],
      openMrs: queue.status === 'fulfilled'
        ? queue.value.mine.map(m => ({ ref: `${m.fullPath}${m.provider === 'gitlab' ? '!' : '#'}${m.iid}`, title: m.title, state: m.state === 'unknown' ? null : STATE[m.state].label }))
        : [],
      brokenPipelines: watches.filter(w => w.latest?.status === 'failed').map(w => ({ project: w.fullPath, ref: w.latest?.ref ?? '' })),
    }))
    setNotes(problems)
    setLoading(false)
  }

  return (
    <div className="card">
      <div className="card-head" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <CalendarCheck size={16} style={{ color: 'var(--signal)' }} />
          <span className="card-title">{tx({ en: 'For the stand-up', pt: 'Para a daily' })}</span>
          <small className="muted">{tx({ en: 'Your commits since the last working day, your open MRs and the broken pipelines, as text to paste.', pt: 'Seus commits desde o último dia útil, seus MRs abertos e as esteiras quebradas, em texto para colar.' })}</small>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {text && <CopyButton value={text} label={tx({ en: 'Copy', pt: 'Copiar' })} />}
          <button className="btn btn-sm" onClick={build} disabled={loading}>
            {loading ? tx({ en: 'Building…', pt: 'Montando…' }) : text ? tx({ en: 'Build again', pt: 'Montar de novo' }) : tx({ en: 'Build summary', pt: 'Montar resumo' })}
          </button>
        </div>
      </div>
      {text !== null && (
        <div className="card-pad stack" style={{ ['--gap' as string]: '8px' }}>
          {notes.map(n => <div key={n} className="callout callout-warn" style={{ fontSize: 12 }}>{n}</div>)}
          <textarea className="textarea mono" rows={Math.min(16, text.split('\n').length + 1)} value={text} onChange={e => setText(e.target.value)} aria-label={tx({ en: 'Stand-up summary', pt: 'Resumo da daily' })} />
        </div>
      )}
    </div>
  )
}
