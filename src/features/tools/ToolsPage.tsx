import './tools.css'
import { Binary, Braces, CalendarClock, Clock, Diff, Fingerprint, Hash, KeyRound, Link, Regex } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Page } from '@/ui'
import { Base64Tool, CronTool, JwtTool, TimestampTool, UrlTool, UuidTool } from './Converters'
import { DiffTool, HashTool, JsonTool, RegexTool } from './TextTools'

type Tool = { icon: LucideIcon; title: string; description: string; body: ReactNode }

const TOOLS: Tool[] = [
  { icon: KeyRound, title: 'JWT', description: 'Decodifica header e payload e mostra se o token expirou.', body: <JwtTool /> },
  { icon: Binary, title: 'Base64', description: 'Codifica e decodifica texto UTF-8, inclusive base64url.', body: <Base64Tool /> },
  { icon: Link, title: 'URL', description: 'Percent-encoding de parâmetros e caminhos.', body: <UrlTool /> },
  { icon: Clock, title: 'Timestamp', description: 'Epoch em segundos ou milissegundos para data legível.', body: <TimestampTool /> },
  { icon: Fingerprint, title: 'UUID', description: 'Gera UUID v4 aleatório, um ou em lote.', body: <UuidTool /> },
  { icon: CalendarClock, title: 'Cron', description: 'Próximas execuções de uma expressão de 5 campos.', body: <CronTool /> },
  { icon: Braces, title: 'JSON', description: 'Formata, compacta, valida com linha e coluna do erro, e converte para YAML.', body: <JsonTool /> },
  { icon: Diff, title: 'Diff', description: 'Diferença linha a linha entre dois textos.', body: <DiffTool /> },
  { icon: Regex, title: 'Regex', description: 'Testa uma expressão regular e mostra cada correspondência e grupo.', body: <RegexTool /> },
  { icon: Hash, title: 'Hash', description: 'SHA-256, SHA-1 e SHA-512 de um texto.', body: <HashTool /> },
]

export default function ToolsPage() {
  return (
    <Page eyebrow="Ferramentas" title="Conversores" hint="Conversões do dia a dia, feitas no navegador: nada do que você cola sai da máquina.">
      <div className="tools-grid">
        {TOOLS.map(({ icon: Icon, title, description, body }) => (
          <section key={title} className="card">
            <div className="card-head">
              <Icon size={16} color="var(--signal)" />
              <div className="stack" style={{ ['--gap' as string]: '0' }}>
                <div className="card-title">{title}</div>
                <small className="muted">{description}</small>
              </div>
            </div>
            <div className="card-pad">{body}</div>
          </section>
        ))}
      </div>
    </Page>
  )
}
