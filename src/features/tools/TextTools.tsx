import { useEffect, useMemo, useState } from 'react'
import { Segmented } from '@/ui'
import { Output, attempt } from './Converters'
import { MAX_DIFF_LINES, digest, formatJson, lineDiff, regexMatches, toYaml } from './text'

type JsonMode = 'formatar' | 'compactar' | 'yaml'

export function JsonTool() {
  const [mode, setMode] = useState<JsonMode>('formatar')
  const [input, setInput] = useState('')
  const result = attempt(() => {
    if (!input.trim()) return null
    const pretty = formatJson(input)
    if (mode === 'compactar') return JSON.stringify(JSON.parse(pretty))
    return mode === 'yaml' ? toYaml(JSON.parse(pretty)) : pretty
  })
  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <Segmented<JsonMode> value={mode} onChange={setMode} options={[{ id: 'formatar', label: 'Formatar' }, { id: 'compactar', label: 'Compactar' }, { id: 'yaml', label: 'Para YAML' }]} />
      <textarea className="textarea mono" rows={5} value={input} placeholder='{"cole": "o JSON"}' onChange={e => setInput(e.target.value)} />
      <Output value={result.value} error={result.error} />
    </div>
  )
}

export function DiffTool() {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const result = attempt(() => (left || right ? lineDiff(left, right) : null))
  const changes = result.value?.filter(d => d.kind !== 'igual').length ?? 0
  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <div className="tool-two">
        <textarea className="textarea mono" rows={5} value={left} placeholder="antes" onChange={e => setLeft(e.target.value)} />
        <textarea className="textarea mono" rows={5} value={right} placeholder="depois" onChange={e => setRight(e.target.value)} />
      </div>
      {result.error && <small className="tool-error">{result.error}</small>}
      {result.value && (
        <>
          <small className="muted">{changes ? `${changes} linha(s) diferente(s)` : 'Os dois textos são iguais.'} Até {MAX_DIFF_LINES} linhas de cada lado.</small>
          {changes > 0 && (
            <pre className="code tool-diff">
              {result.value.map((d, i) => (
                <div key={i} className={`diff-${d.kind}`}>{d.kind === 'removida' ? '- ' : d.kind === 'adicionada' ? '+ ' : '  '}{d.text}</div>
              ))}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

export function RegexTool() {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [input, setInput] = useState('')
  const result = attempt(() => (pattern && input ? regexMatches(pattern, flags, input) : null))
  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <span className="mono muted">/</span>
        <input className="input mono spacer" value={pattern} placeholder="(\w+)@(\w+)\.com" onChange={e => setPattern(e.target.value)} />
        <span className="mono muted">/</span>
        <input className="input mono" style={{ width: 70 }} value={flags} onChange={e => setFlags(e.target.value.replace(/[^gimsuy]/g, ''))} title="Flags: g, i, m, s, u, y" />
      </div>
      <textarea className="textarea mono" rows={4} value={input} placeholder="texto para testar" onChange={e => setInput(e.target.value)} />
      {result.error && <small className="tool-error">Expressão inválida: {result.error}</small>}
      {result.value && (
        result.value.length === 0 ? <small className="muted">Nenhuma correspondência.</small> : (
          <div className="uuid-list">
            <small className="muted">{result.value.length} correspondência(s)</small>
            {result.value.map((m, i) => (
              <div key={i} className="mono">
                <span className="muted">@{m.index}</span> <b>{m.text || '(vazio)'}</b>
                {m.groups.length > 0 && <span className="muted"> · {m.groups.map((g, j) => `$${j + 1}=${g}`).join(' · ')}</span>}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

const ALGORITHMS = ['SHA-256', 'SHA-1', 'SHA-512'] as const

export function HashTool() {
  const [input, setInput] = useState('')
  const [hashes, setHashes] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    if (!input) return setHashes({})
    Promise.all(ALGORITHMS.map(async a => [a, await digest(a, input)] as const)).then(r => alive && setHashes(Object.fromEntries(r)))
    return () => {
      alive = false
    }
  }, [input])
  const rows = useMemo(() => ALGORITHMS.filter(a => hashes[a]), [hashes])
  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <textarea className="textarea" rows={3} value={input} placeholder="texto (UTF-8)" onChange={e => setInput(e.target.value)} />
      {rows.map(a => (
        <div key={a} className="stack" style={{ ['--gap' as string]: '2px' }}>
          <span className="eyebrow">{a}</span>
          <Output value={hashes[a]} error={null} />
        </div>
      ))}
      {input && <small className="muted">MD5 não está no Web Crypto do navegador e por isso não aparece.</small>}
    </div>
  )
}
