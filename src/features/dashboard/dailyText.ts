// The stand-up text: commits since the last working day, open MRs and broken pipelines, ready to paste
// in the team chat. "Today" and "Blockers" stay for the person to fill in. Tested by scripts/check-home.ts.
import { locale, tx } from '../../lib/i18n.ts'

export type DailyInput = {
  since: string
  repos: { name: string; commits: { subject: string }[] }[]
  openMrs: { ref: string; title: string; state: string | null }[]
  brokenPipelines: { project: string; ref: string }[]
}

// Subjects keep the type prefix: "fix(login): ..." says more in a stand-up than the bare sentence
export function buildDailyText(input: DailyInput): string {
  const since = new Date(input.since).toLocaleDateString(locale(), { weekday: 'long', day: '2-digit', month: '2-digit' })
  const lines = [tx({ en: `Since ${since}:`, pt: `Desde ${since}:` })]
  if (input.repos.length === 0) lines.push(tx({ en: '- (no commit of yours in the workspace clones)', pt: '- (nenhum commit seu nos clones do workspace)' }))
  for (const repo of input.repos) lines.push(`- ${repo.name}: ${[...new Set(repo.commits.map(c => c.subject))].join('; ')}`)
  if (input.openMrs.length) {
    lines.push('', tx({ en: 'Open MRs:', pt: 'MRs abertos:' }))
    for (const mr of input.openMrs) lines.push(`- ${mr.ref} ${mr.title}${mr.state ? ` (${mr.state})` : ''}`)
  }
  if (input.brokenPipelines.length) {
    lines.push('', tx({ en: 'Broken pipelines:', pt: 'Esteiras quebradas:' }))
    for (const p of input.brokenPipelines) lines.push(`- ${p.project} (${p.ref})`)
  }
  lines.push('', tx({ en: 'Today:', pt: 'Hoje:' }), '- ', '', tx({ en: 'Blockers:', pt: 'Impedimentos:' }), '- ')
  return lines.join('\n')
}
