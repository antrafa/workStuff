import './tools.css'
import { Binary, Braces, CalendarClock, Clock, Diff, Fingerprint, Hash, KeyRound, Link, Regex } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Page } from '@/ui'
import { Base64Tool, CronTool, JwtTool, TimestampTool, UrlTool, UuidTool } from './Converters'
import { DiffTool, HashTool, JsonTool, RegexTool } from './TextTools'
import { tx } from '@/lib/i18n'

type Tool = { icon: LucideIcon; title: string; description: string; body: ReactNode }

const TOOLS: Tool[] = [
  { icon: KeyRound, title: 'JWT', description: tx({ en: 'Decodes header and payload and shows whether the token expired.', pt: 'Decodifica header e payload e mostra se o token expirou.' }), body: <JwtTool /> },
  { icon: Binary, title: 'Base64', description: tx({ en: 'Encodes and decodes UTF-8 text, base64url included.', pt: 'Codifica e decodifica texto UTF-8, inclusive base64url.' }), body: <Base64Tool /> },
  { icon: Link, title: 'URL', description: tx({ en: 'Percent-encoding of parameters and paths.', pt: 'Percent-encoding de parâmetros e caminhos.' }), body: <UrlTool /> },
  { icon: Clock, title: 'Timestamp', description: tx({ en: 'Epoch in seconds or milliseconds to a readable date.', pt: 'Epoch em segundos ou milissegundos para data legível.' }), body: <TimestampTool /> },
  { icon: Fingerprint, title: 'UUID', description: tx({ en: 'Generates random UUID v4, one or in bulk.', pt: 'Gera UUID v4 aleatório, um ou em lote.' }), body: <UuidTool /> },
  { icon: CalendarClock, title: 'Cron', description: tx({ en: 'Next runs of a 5-field expression.', pt: 'Próximas execuções de uma expressão de 5 campos.' }), body: <CronTool /> },
  { icon: Braces, title: 'JSON', description: tx({ en: 'Formats, minifies, validates with the error line and column, and converts to and from YAML.', pt: 'Formata, compacta, valida com linha e coluna do erro, e converte de e para YAML.' }), body: <JsonTool /> },
  { icon: Diff, title: 'Diff', description: tx({ en: 'Line-by-line difference between two texts.', pt: 'Diferença linha a linha entre dois textos.' }), body: <DiffTool /> },
  { icon: Regex, title: 'Regex', description: tx({ en: 'Tests a regular expression and shows every match and group.', pt: 'Testa uma expressão regular e mostra cada correspondência e grupo.' }), body: <RegexTool /> },
  { icon: Hash, title: 'Hash', description: tx({ en: 'SHA-256, SHA-1 and SHA-512 of a text.', pt: 'SHA-256, SHA-1 e SHA-512 de um texto.' }), body: <HashTool /> },
]

export default function ToolsPage() {
  return (
    <Page title={tx({ en: 'Converters', pt: 'Conversores' })} hint={tx({ en: 'Everyday conversions, done in the browser: nothing you paste leaves the machine.', pt: 'Conversões do dia a dia, feitas no navegador: nada do que você cola sai da máquina.' })}>
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
