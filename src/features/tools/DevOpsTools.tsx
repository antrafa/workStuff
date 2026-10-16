import { useState } from 'react'
import { CopyButton, Segmented } from '@/ui'
import { locale, tx } from '@/lib/i18n'
import { Output, attempt } from './Converters'
import { calculateJvmMemory, decodePemCertificate, interpolateSql } from './devops'

const SAMPLE_SQL_LOG = `Hibernate: select p.id, p.placa, p.velocidade, p.data_passagem from tb_passagem p inner join tb_radar r on r.id = p.radar_id where p.uf = ? and p.velocidade >= ? and p.processado = ? and p.lote_erro is ? order by p.data_passagem desc limit ?
TRACE org.hibernate.type.descriptor.sql.BasicBinder - binding parameter [1] as [VARCHAR] - [MG]
TRACE org.hibernate.type.descriptor.sql.BasicBinder - binding parameter [2] as [INTEGER] - [80]
TRACE org.hibernate.type.descriptor.sql.BasicBinder - binding parameter [3] as [BOOLEAN] - [false]
TRACE org.hibernate.type.descriptor.sql.BasicBinder - binding parameter [4] as [VARCHAR] - [null]
TRACE org.hibernate.type.descriptor.sql.BasicBinder - binding parameter [5] as [INTEGER] - [50]`

export function SqlBindTool() {
  const [input, setInput] = useState('')
  const result = attempt(() => (input.trim() ? interpolateSql(input) : null))

  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <textarea
        className="textarea mono"
        rows={5}
        value={input}
        placeholder={tx({
          en: 'Paste the SQL query with ? and the Hibernate / JDBC / MyBatis binding log lines…',
          pt: 'Cole o SQL com ? junto com as linhas de bind do Hibernate / JDBC / MyBatis…',
        })}
        onChange={e => setInput(e.target.value)}
      />
      {!input && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setInput(SAMPLE_SQL_LOG)}
        >
          {tx({ en: 'use an example', pt: 'usar um exemplo' })}
        </button>
      )}
      {result.error && <small className="tool-error">{result.error}</small>}
      {result.value && (
        <>
          <div className="row" style={{ gap: 8 }}>
            <span className="badge badge-ok">
              {tx({
                en: `${result.value.boundCount} bound`,
                pt: `${result.value.boundCount} preenchido(s)`,
              })}
            </span>
            {result.value.unboundCount > 0 && (
              <span className="badge badge-warn">
                {tx({
                  en: `${result.value.unboundCount} missing (?)`,
                  pt: `${result.value.unboundCount} sem valor (?)`,
                })}
              </span>
            )}
          </div>
          <Output value={result.value.sql} error={null} />
        </>
      )}
    </div>
  )
}

export function JvmMemoryTool() {
  const [limitMiB, setLimitMiB] = useState(1024)
  const [heapMode, setHeapMode] = useState<'pct' | 'xmx'>('pct')
  const [maxRamPct, setMaxRamPct] = useState(75)
  const [xmxMiB, setXmxMiB] = useState(768)
  const [metaspaceMiB, setMetaspaceMiB] = useState(256)
  const [directMiB, setDirectMiB] = useState(64)
  const [threads, setThreads] = useState(200)
  const [xssKiB, setXssKiB] = useState(1024)

  const result = attempt(() =>
    calculateJvmMemory({
      limitMiB,
      heapMode,
      maxRamPct,
      xmxMiB,
      metaspaceMiB,
      directMiB,
      threads,
      xssKiB,
      codeCacheMiB: 128,
    }),
  )

  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <div className="row" style={{ gap: 6 }}>
        {[512, 1024, 2048, 4096].map(mib => (
          <button
            key={mib}
            type="button"
            className="chip"
            aria-pressed={limitMiB === mib}
            onClick={() => setLimitMiB(mib)}
          >
            <span className="mono">{mib >= 1024 ? `${mib / 1024}Gi` : `${mib}Mi`}</span>
          </button>
        ))}
        <div className="spacer" />
        <Segmented<'pct' | 'xmx'>
          value={heapMode}
          onChange={setHeapMode}
          options={[
            { id: 'pct', label: 'MaxRAMPercentage' },
            { id: 'xmx', label: '-Xmx (MiB)' },
          ]}
        />
      </div>

      <div className="tool-two">
        <label className="field">
          <span>{tx({ en: 'Pod limit (MiB)', pt: 'Limite do pod (MiB)' })}</span>
          <input
            type="number"
            className="input mono"
            min={128}
            step={64}
            value={limitMiB}
            onChange={e => setLimitMiB(Number(e.target.value))}
          />
        </label>
        {heapMode === 'pct' ? (
          <label className="field">
            <span>MaxRAMPercentage (%)</span>
            <input
              type="number"
              className="input mono"
              min={10}
              max={95}
              value={maxRamPct}
              onChange={e => setMaxRamPct(Number(e.target.value))}
            />
          </label>
        ) : (
          <label className="field">
            <span>-Xmx (MiB)</span>
            <input
              type="number"
              className="input mono"
              min={64}
              step={64}
              value={xmxMiB}
              onChange={e => setXmxMiB(Number(e.target.value))}
            />
          </label>
        )}
        <label className="field">
          <span>Metaspace (MiB)</span>
          <input
            type="number"
            className="input mono"
            min={64}
            step={32}
            value={metaspaceMiB}
            onChange={e => setMetaspaceMiB(Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Direct / NIO (MiB)</span>
          <input
            type="number"
            className="input mono"
            min={16}
            step={16}
            value={directMiB}
            onChange={e => setDirectMiB(Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>{tx({ en: 'Peak threads', pt: 'Pico de threads' })}</span>
          <input
            type="number"
            className="input mono"
            min={10}
            step={25}
            value={threads}
            onChange={e => setThreads(Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>-Xss (KiB/thread)</span>
          <input
            type="number"
            className="input mono"
            min={256}
            step={256}
            value={xssKiB}
            onChange={e => setXssKiB(Number(e.target.value))}
          />
        </label>
      </div>

      {result.error && <small className="tool-error">{result.error}</small>}
      {result.value && (
        <>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span
              className={`badge ${
                result.value.status === 'crit'
                  ? 'badge-crit'
                  : result.value.status === 'warn'
                    ? 'badge-warn'
                    : 'badge-ok'
              }`}
            >
              {result.value.status === 'crit'
                ? tx({ en: 'OOMKilled risk (137)', pt: 'Risco de OOMKilled (137)' })
                : result.value.status === 'warn'
                  ? tx({ en: 'Tight margin (<10%)', pt: 'Margem curta (<10%)' })
                  : tx({ en: 'Safe headroom', pt: 'Margem segura' })}
            </span>
            <span className="mono" style={{ fontSize: 12 }}>
              {result.value.totalMiB} MiB / {limitMiB} MiB ({result.value.usagePct}%)
            </span>
          </div>
          <div className={`meter ${result.value.status === 'ok' ? '' : result.value.status}`} title={`${result.value.usagePct}%`}>
            <i style={{ width: `${Math.min(result.value.usagePct, 100)}%` }} />
          </div>
          <small className="muted mono">
            Heap {result.value.heapMiB} MiB + Non-Heap {result.value.nonHeapMiB} MiB (Threads {result.value.threadsMiB} MiB)
          </small>
          <span className="eyebrow">
            {tx({
              en: `Suggested JAVA_TOOL_OPTIONS (safe Xmx ≤ ${result.value.safeXmxMiB} MiB)`,
              pt: `JAVA_TOOL_OPTIONS sugerido (Xmx seguro ≤ ${result.value.safeXmxMiB} MiB)`,
            })}
          </span>
          <Output value={result.value.recommendedFlags} error={null} />
        </>
      )}
    </div>
  )
}

const SAMPLE_PEM = [
  '-----BEGIN CERTIFICATE-----',
  'MIIB7DCCAZKgAwIBAgIUOJ7Rj6KG6/Mtsa0G1DPYw4W7JlMwCgYIKoZIzj0EAwIw',
  'MjEcMBoGA1UEAwwTYXBpLndvcmtzdHVmZi5sb2NhbDESMBAGA1UECgwJd29ya1N0',
  'dWZmMB4XDTI2MTAxNjAxNTIwM1oXDTM2MTAxMzAxNTIwM1owMjEcMBoGA1UEAwwT',
  'YXBpLndvcmtzdHVmZi5sb2NhbDESMBAGA1UECgwJd29ya1N0dWZmMFkwEwYHKoZI',
  'zj0CAQYIKoZIzj0DAQcDQgAEyLIQuf+ypLb4RDyBNaiB9tf0z6N5dQaCKoAUGMs8',
  'T6RMI9FWQAkxV7Pg1+WaZbhSUpeWFPAWblpBF1EtcTlkpKOBhTCBgjAdBgNVHQ4E',
  'FgQUTueWhHRnsHbGJddcTnA25rQJysowHwYDVR0jBBgwFoAUTueWhHRnsHbGJddc',
  'TnA25rQJysowDwYDVR0TAQH/BAUwAwEB/zAvBgNVHREEKDAmghNhcGkud29ya3N0',
  'dWZmLmxvY2Fsgglsb2NhbGhvc3SHBH8AAAEwCgYIKoZIzj0EAwIDSAAwRQIhAMFL',
  'NCuM0uDsgHzTmsj1XQsd0AnH08S4I5qFldTKkjb3AiB3Zuq+kCHZ+vTQYBlZxyZa',
  '0HaW11TcIXCgYP+OMfFKdA==',
  '-----END CERTIFICATE-----',
].join('\n')

export function PemCertTool() {
  const [pem, setPem] = useState('')
  const result = attempt(() => (pem.trim() ? decodePemCertificate(pem) : null))

  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <textarea
        className="textarea mono"
        rows={4}
        value={pem}
        placeholder="-----BEGIN CERTIFICATE-----&#10;MIIB...&#10;-----END CERTIFICATE-----"
        onChange={e => setPem(e.target.value)}
      />
      {!pem && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setPem(SAMPLE_PEM)}
        >
          {tx({ en: 'use an example', pt: 'usar um exemplo' })}
        </button>
      )}
      {result.error && <small className="tool-error">{result.error}</small>}
      {result.value && (
        <>
          <div className="row" style={{ gap: 8 }}>
            <span className={`badge ${result.value.expired ? 'badge-crit' : result.value.daysRemaining <= 30 ? 'badge-warn' : 'badge-ok'}`}>
              {result.value.expired
                ? tx({ en: 'expired', pt: 'expirado' })
                : tx({
                    en: `valid (${result.value.daysRemaining}d left)`,
                    pt: `válido (faltam ${result.value.daysRemaining}d)`,
                  })}
            </span>
            {result.value.chainLength > 1 && (
              <span className="badge">
                {tx({
                  en: `first of ${result.value.chainLength} in the chain`,
                  pt: `primeiro de ${result.value.chainLength} da cadeia`,
                })}
              </span>
            )}
            <span className="muted mono" style={{ fontSize: 11, minWidth: 0, overflowWrap: 'anywhere' }}>
              {result.value.serialNumber}
            </span>
          </div>
          <dl className="kv">
            <dt>Subject</dt>
            <dd className="mono">{result.value.subject}</dd>
            <dt>Issuer</dt>
            <dd className="mono">{result.value.issuer}</dd>
            <dt>{tx({ en: 'Valid from', pt: 'Válido de' })}</dt>
            <dd>{result.value.notBefore.toLocaleString(locale())}</dd>
            <dt>{tx({ en: 'Expires at', pt: 'Expira em' })}</dt>
            <dd>{result.value.notAfter.toLocaleString(locale())}</dd>
            {result.value.sans.length > 0 && (
              <>
                <dt>SANs</dt>
                <dd className="row" style={{ ['--gap' as string]: '4px' }}>
                  <span className="mono">{result.value.sans.join(', ')}</span>
                  <CopyButton value={result.value.sans.join('\n')} />
                </dd>
              </>
            )}
          </dl>
        </>
      )}
    </div>
  )
}
