import { Download, RefreshCw, Save } from 'lucide-react'
import { useState } from 'react'
import { CopyButton, Markdown, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { saveToProject, type ReportEntry } from './api'
import { locale, tx } from '@/lib/i18n'

type Props = { projectPath: string; entry: ReportEntry; onRegenerate: () => void }

const fileName = (projectPath: string) => `${projectPath.split('/').filter(Boolean).at(-1) ?? 'projeto'}-arquitetura.md`

export function ReportView({ projectPath, entry, onRegenerate }: Props) {
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const download = () => {
    const url = URL.createObjectURL(new Blob([entry.report], { type: 'text/markdown' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName(projectPath) })
    a.click()
    URL.revokeObjectURL(url)
  }

  const save = async () => {
    setSaving(true)
    try {
      const { relativePath } = await saveToProject(projectPath)
      toast(tx({ en: `Saved to ${relativePath}`, pt: `Gravado em ${relativePath}` }))
    } catch (e) {
      toast(tx({ en: `Not saved: ${(e as Error).message}`, pt: `Não gravou: ${(e as Error).message}` }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <div className="row report-meta">
        <span title={new Date(entry.generatedAt).toLocaleString(locale())}>{tx({ en: `generated ${relTime(entry.generatedAt)}`, pt: `gerado ${relTime(entry.generatedAt)}` })}</span>
        <span>·</span>
        {entry.gitCommit ? <span>commit <code className="inline">{entry.gitCommit.slice(0, 7)}</code></span> : <span>{tx({ en: 'project without git', pt: 'projeto sem git' })}</span>}
        <span>·</span>
        <span className="mono">{entry.provider} · {entry.model || tx({ en: 'default model', pt: 'modelo padrão' })} · {Math.round(entry.durationMs / 1000)}s</span>
        <div className="spacer" />
        <CopyButton value={entry.report} label={tx({ en: 'Copy', pt: 'Copiar' })} />
        <button className="btn btn-sm" onClick={download} title={tx({ en: `Downloads ${fileName(projectPath)}`, pt: `Baixa ${fileName(projectPath)}` })}><Download size={13} /> {tx({ en: 'Download .md', pt: 'Baixar .md' })}</button>
        <button
          className="btn btn-sm"
          onClick={save}
          disabled={saving}
          title={tx({ en: 'Writes docs/arquitetura/arquitetura-YYYY-MM-DD.md inside the project, to version it with the code. A new analysis on the same day overwrites that day\'s file.', pt: 'Grava em docs/arquitetura/arquitetura-AAAA-MM-DD.md dentro do projeto, para versionar junto do código. Reanálise no mesmo dia sobrescreve o arquivo do dia.' })}
        >
          <Save size={13} /> {saving ? tx({ en: 'Saving…', pt: 'Gravando…' }) : tx({ en: 'Save to project', pt: 'Gravar no projeto' })}
        </button>
        <button className="btn btn-sm" onClick={onRegenerate} title={tx({ en: 'Redoes the whole analysis even without new commits', pt: 'Refaz a análise inteira mesmo sem commits novos' })}>
          <RefreshCw size={13} /> {tx({ en: 'Redo', pt: 'Refazer' })}
        </button>
      </div>
      <Markdown>{entry.report}</Markdown>
    </div>
  )
}
