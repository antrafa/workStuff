import { Download, RefreshCw, Save } from 'lucide-react'
import { useState } from 'react'
import { CopyButton, Markdown, useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { saveToProject, type ReportEntry } from './api'

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
      toast(`Gravado em ${relativePath}`)
    } catch (e) {
      toast(`Não gravou: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="stack" style={{ ['--gap' as string]: '16px' }}>
      <div className="row report-meta">
        <span title={new Date(entry.generatedAt).toLocaleString('pt-BR')}>gerado {relTime(entry.generatedAt)}</span>
        <span>·</span>
        {entry.gitCommit ? <span>commit <code className="inline">{entry.gitCommit.slice(0, 7)}</code></span> : <span>projeto sem git</span>}
        <span>·</span>
        <span className="mono">{entry.provider} · {entry.model || 'modelo padrão'} · {Math.round(entry.durationMs / 1000)}s</span>
        <div className="spacer" />
        <CopyButton value={entry.report} label="Copiar" />
        <button className="btn btn-sm" onClick={download} title={`Baixa ${fileName(projectPath)}`}><Download size={13} /> Baixar .md</button>
        <button
          className="btn btn-sm"
          onClick={save}
          disabled={saving}
          title="Grava em docs/arquitetura/arquitetura-AAAA-MM-DD.md dentro do projeto, para versionar junto do código. Reanálise no mesmo dia sobrescreve o arquivo do dia."
        >
          <Save size={13} /> {saving ? 'Gravando…' : 'Gravar no projeto'}
        </button>
        <button className="btn btn-sm" onClick={onRegenerate} title="Refaz a análise inteira mesmo sem commits novos">
          <RefreshCw size={13} /> Refazer
        </button>
      </div>
      <Markdown>{entry.report}</Markdown>
    </div>
  )
}
