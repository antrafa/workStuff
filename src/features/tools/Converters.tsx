import { useEffect, useState } from 'react'
import { CopyButton, Segmented } from '@/ui'
import { base64Decode, base64Encode, decodeJwt, parseEpoch } from './convert'
import { nextCronRuns } from './cron'
import { locale, tx } from '@/lib/i18n'

export function attempt<T>(fn: () => T): { value: T | null; error: string | null } {
  try {
    return { value: fn(), error: null }
  } catch (e) {
    return { value: null, error: (e as Error).message }
  }
}

export function Output({ value, error }: { value: string | null; error: string | null }) {
  if (error) return <small className="tool-error">{error}</small>
  if (!value) return null
  return (
    <div className="tool-output">
      <pre className="code">{value}</pre>
      <CopyButton value={value} />
    </div>
  )
}

const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmdWxhbm8iLCJub21lIjoiRnVsYW5vIGRlIFRhbCIsInJvbGVzIjpbInNncC1hZG1pbiJdLCJpYXQiOjE3NTgxNTM2MDAsImV4cCI6MTc1ODE1NzIwMH0.assinatura'

export function JwtTool() {
  const [token, setToken] = useState('')
  const { value, error } = attempt(() => (token.trim() ? decodeJwt(token) : null))
  const expired = value?.exp ? value.exp.getTime() < Date.now() : null

  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <textarea className="textarea" rows={3} value={token} placeholder={tx({ en: 'paste the JWT…', pt: 'cole o token JWT…' })} onChange={e => setToken(e.target.value)} />
      {!token && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setToken(SAMPLE_JWT)}>{tx({ en: 'use an example', pt: 'usar um exemplo' })}</button>}
      {error && <small className="tool-error">{error}</small>}
      {value && (
        <>
          <div className="row">
            {expired !== null && <span className={`badge ${expired ? 'badge-crit' : 'badge-ok'}`}>{expired ? tx({ en: 'expired', pt: 'expirado' }) : tx({ en: 'valid', pt: 'válido' })}</span>}
            {value.exp && <span className="muted" style={{ fontSize: 12 }}>{tx({ en: 'expires at', pt: 'expira em' })} {value.exp.toLocaleString(locale())}</span>}
            {value.iat && <span className="muted" style={{ fontSize: 12 }}>· {tx({ en: 'issued at', pt: 'emitido em' })} {value.iat.toLocaleString(locale())}</span>}
          </div>
          <span className="eyebrow">Header</span>
          <Output value={value.header} error={null} />
          <span className="eyebrow">Payload</span>
          <Output value={value.payload} error={null} />
          <small className="muted">{tx({ en: 'The signature is not verified: the token is only decoded, in the browser.', pt: 'A assinatura não é verificada: o token só é decodificado, no navegador.' })}</small>
        </>
      )}
    </div>
  )
}

type Direction = 'decode' | 'encode'

export function CodecTool({ encode, decode, placeholder }: { encode: (s: string) => string; decode: (s: string) => string; placeholder: string }) {
  const [direction, setDirection] = useState<Direction>('decode')
  const [input, setInput] = useState('')
  const result = attempt(() => (input ? (direction === 'encode' ? encode(input) : decode(input)) : null))

  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <Segmented value={direction} onChange={setDirection} options={[{ id: 'decode', label: tx({ en: 'Decode', pt: 'Decodificar' }) }, { id: 'encode', label: tx({ en: 'Encode', pt: 'Codificar' }) }]} />
      <textarea className="textarea" rows={3} value={input} placeholder={placeholder} onChange={e => setInput(e.target.value)} />
      <Output value={result.value} error={result.error && (direction === 'decode'
        ? tx({ en: `Invalid input to decode: ${result.error}`, pt: `Entrada inválida para decodificar: ${result.error}` })
        : tx({ en: `Invalid input to encode: ${result.error}`, pt: `Entrada inválida para codificar: ${result.error}` }))} />
    </div>
  )
}

export const Base64Tool = () => <CodecTool encode={base64Encode} decode={base64Decode} placeholder={tx({ en: 'text or base64 (base64url accepted)…', pt: 'texto ou base64 (aceita base64url)…' })} />
export const UrlTool = () => <CodecTool encode={encodeURIComponent} decode={decodeURIComponent} placeholder={tx({ en: 'https://… or text with %20…', pt: 'https://… ou texto com %20…' })} />

export function TimestampTool() {
  const [input, setInput] = useState('')
  const result = attempt(() => (input.trim() ? parseEpoch(input) : null))

  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input mono spacer" value={input} placeholder={tx({ en: '1758153600 or 1758153600000', pt: '1758153600 ou 1758153600000' })} onChange={e => setInput(e.target.value)} />
        <button className="btn" onClick={() => setInput(String(Math.floor(Date.now() / 1000)))} title={tx({ en: 'Fills in the current instant in seconds', pt: 'Preenche com o instante atual em segundos' })}>{tx({ en: 'Now', pt: 'Agora' })}</button>
      </div>
      {result.error && <small className="tool-error">{result.error}</small>}
      {result.value && (
        <dl className="kv">
          <dt>{tx({ en: 'Unit', pt: 'Unidade' })}</dt><dd>{result.value.unit}</dd>
          <dt>Local ({locale()})</dt><dd>{result.value.date.toLocaleString(locale())}</dd>
          <dt>ISO (UTC)</dt><dd className="row" style={{ ['--gap' as string]: '4px' }}>{result.value.date.toISOString()} <CopyButton value={result.value.date.toISOString()} /></dd>
        </dl>
      )}
    </div>
  )
}

export function UuidTool() {
  const [uuids, setUuids] = useState<string[]>([])
  const generate = (n: number) => setUuids(Array.from({ length: n }, () => crypto.randomUUID()))

  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <div className="row">
        {[1, 5, 20].map(n => <button key={n} className="btn btn-sm" onClick={() => generate(n)}>{tx({ en: `Generate ${n}`, pt: `Gerar ${n}` })}</button>)}
        <div className="spacer" />
        {uuids.length > 1 && <CopyButton value={uuids.join('\n')} label={tx({ en: 'copy all', pt: 'copiar todos' })} />}
      </div>
      {uuids.length > 0 && (
        <div className="uuid-list">
          {uuids.map(u => (
            <div key={u} className="row" style={{ flexWrap: 'nowrap' }}>
              <code className="mono spacer">{u}</code>
              <CopyButton value={u} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const CRON_EXAMPLES = ['*/15 * * * *', '0 3 * * *', '0 8 * * 1-5']

export function CronTool() {
  const [expr, setExpr] = useState('0 8 * * 1-5')
  const [debounced, setDebounced] = useState(expr)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(expr), 350)
    return () => clearTimeout(id)
  }, [expr])
  const result = attempt(() => (debounced.trim() ? nextCronRuns(debounced) : null))

  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <input className="input mono" value={expr} placeholder={tx({ en: 'min hour day month weekday', pt: 'min hora dia mês dia-semana' })} onChange={e => setExpr(e.target.value)} />
      <div className="row" style={{ ['--gap' as string]: '6px' }}>
        {CRON_EXAMPLES.map(e => <button key={e} className="chip" aria-pressed={expr === e} onClick={() => setExpr(e)}><span className="mono">{e}</span></button>)}
      </div>
      {result.error && <small className="tool-error">{result.error}</small>}
      {result.value && (
        <ol className="cron-runs mono">
          {result.value.length === 0 ? <li className="muted">{tx({ en: 'No run in the next year.', pt: 'Nenhuma execução no próximo ano.' })}</li> : result.value.map(d => <li key={d.getTime()}>{d.toLocaleString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</li>)}
        </ol>
      )}
    </div>
  )
}
