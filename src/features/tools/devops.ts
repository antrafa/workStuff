// Pure client-side helpers for backend/SRE daily work:
// 1. SQL parameter binding & formatting (Hibernate 5/6, Spring/JDBC, P6Spy/MyBatis)
// 2. JVM memory vs. Kubernetes container limit calculator (OOMKilled prevention)
// 3. X.509 PEM certificate decoder (ASN.1 DER in browser & Node, zero external deps)
// Relative, not '@/': scripts/check-text.ts imports this file in Node
import { tx } from '../../lib/i18n.ts'

export type SqlBindResult = {
  sql: string
  boundCount: number
  unboundCount: number
}

type SqlParam = { raw: string; type?: string }

const NUMERIC_SQL_TYPES = new Set([
  'INTEGER', 'INT', 'BIGINT', 'LONG', 'SMALLINT', 'SHORT', 'TINYINT', 'BYTE',
  'DECIMAL', 'NUMERIC', 'DOUBLE', 'FLOAT', 'REAL', 'NUMBER', 'BIGDECIMAL', 'BIGINTEGER',
])

const BOOLEAN_SQL_TYPES = new Set(['BOOLEAN', 'BOOL', 'BIT'])

// The value is classified trimmed but quoted as logged: spaces inside a string change which rows match.
function formatSqlValue(param: SqlParam): string {
  const val = param.raw.trim()
  const upperType = param.type?.trim().toUpperCase() ?? ''
  if (/^(null|<null>)$/i.test(val)) return 'NULL'
  if (BOOLEAN_SQL_TYPES.has(upperType) && /^(true|false|0|1)$/i.test(val)) {
    return val === '1' ? 'TRUE' : val === '0' ? 'FALSE' : val.toUpperCase()
  }
  if (NUMERIC_SQL_TYPES.has(upperType) && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(val)) {
    return val
  }
  if (!upperType) {
    if (/^(true|false)$/i.test(val)) return val.toUpperCase()
    if (/^-?\d+(\.\d+)?$/.test(val)) return val
  }
  return `'${param.raw.replace(/'/g, "''")}'`
}

type SqlSegment = { kind: 'code' | 'string' | 'comment'; text: string }

// Splits SQL into code, quoted literals and comments, so binding and formatting only ever touch code:
// a ? inside 'texto ?' or after -- is not a parameter.
function sqlSegments(sql: string): SqlSegment[] {
  const out: SqlSegment[] = []
  let code = ''
  const flush = () => {
    if (code) out.push({ kind: 'code', text: code })
    code = ''
  }
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'" || ch === '"') {
      let j = i + 1
      while (j < sql.length) {
        // ponytail: \' is read as an escape (MySQL); a Postgres literal ending in a backslash then runs on
        // to the end, which only loses the formatting of what follows, never a binding.
        if (sql[j] === '\\') j += 2
        else if (sql[j] === ch && sql[j + 1] === ch) j += 2
        else if (sql[j] === ch) break
        else j++
      }
      flush()
      out.push({ kind: 'string', text: sql.slice(i, j + 1) })
      i = j + 1
      continue
    }
    if (sql.startsWith('--', i) || sql.startsWith('/*', i)) {
      const line = sql.startsWith('--', i)
      const close = line ? sql.indexOf('\n', i) : sql.indexOf('*/', i + 2)
      const end = close < 0 ? sql.length : line ? close : close + 2
      flush()
      out.push({ kind: 'comment', text: sql.slice(i, end) })
      i = end
      continue
    }
    code += ch
    i++
  }
  flush()
  return out
}

const SQL_CLAUSES = [
  'SELECT', 'FROM', 'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
  'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'CROSS JOIN', 'JOIN',
  'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'VALUES', 'SET',
].map(kw => ({ kw, re: new RegExp(`^${kw}\\b`, 'i') }))
const SQL_CONNECTIVES = ['AND', 'OR'].map(kw => ({ kw, re: new RegExp(`^${kw}\\b`, 'i') }))

// Major clauses go on their own line at parenthesis depth 0; literals and comments are kept as written.
export function formatSqlQuery(sql: string): string {
  let out = ''
  let depth = 0
  for (const seg of sqlSegments(sql.trim())) {
    if (seg.kind === 'string') {
      out += seg.text
      continue
    }
    if (seg.kind === 'comment') {
      out += seg.text.startsWith('--') ? `${seg.text}\n` : seg.text
      continue
    }
    const code = seg.text.replace(/\s+/g, ' ')
    let i = 0
    while (i < code.length) {
      const ch = code[i]
      if (ch === '(') depth++
      if (ch === ')') depth = Math.max(0, depth - 1)
      if (depth === 0 && (i === 0 || code[i - 1] === ' ')) {
        const rest = code.slice(i)
        const clause = SQL_CLAUSES.find(c => c.re.test(rest))
        const connective = clause ? null : SQL_CONNECTIVES.find(c => c.re.test(rest))
        if (clause || connective) {
          const { kw } = (clause ?? connective)!
          out = out.trimEnd() + (clause ? (out.trim() ? '\n' : '') : '\n  ') + kw
          i += kw.length
          continue
        }
      }
      out += ch
      i++
    }
  }
  return out.trim()
}

// MyBatis "Parameters:" list: `value(Type)` or `null`, separated by ", ". A value may itself hold ", "
// ("Silva, Joao(String)"), so a parameter ends only at its (Type) or at null.
function parseMyBatisParams(list: string): SqlParam[] {
  const params: SqlParam[] = []
  const re = /null(?=, |$)|([\s\S]*?)\(([A-Za-z0-9_.]+)\)(?=, |$)/y
  let pos = 0
  while (pos < list.length) {
    re.lastIndex = pos
    const m = re.exec(list)
    if (!m) {
      params.push({ raw: list.slice(pos) })
      break
    }
    params.push(m[2] ? { raw: m[1], type: m[2] } : { raw: 'null' })
    pos = re.lastIndex + 2
  }
  return params
}

// Result rows and counters that Hibernate and MyBatis log after the statement; none of them is SQL.
const SQL_LOG_NOISE = /extracted value|<==|BasicExtractor/i

export function interpolateSql(input: string): SqlBindResult {
  const lines = input.split(/\r?\n/)
  const sqlLines: string[] = []
  const indexedParams = new Map<number, SqlParam>()
  const sequentialParams: SqlParam[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || SQL_LOG_NOISE.test(line)) continue

    // 1. Hibernate 5: binding parameter [1] as [VARCHAR] - [value]
    const h5 = /binding parameter \[(\d+)\]\s+as\s+\[([^\]]+)\]\s*-\s*\[(.*)\]$/i.exec(line)
    if (h5) {
      indexedParams.set(Number(h5[1]), { raw: h5[3], type: h5[2] })
      continue
    }

    // 2. Hibernate 6: binding parameter (1:VARCHAR) <- [value]
    const h6 = /binding parameter \((\d+)\s*:\s*([^)]+)\)\s*<-\s*\[(.*)\]$/i.exec(line)
    if (h6) {
      indexedParams.set(Number(h6[1]), { raw: h6[3], type: h6[2] })
      continue
    }

    // 3. MyBatis / Spring JDBC / P6Spy, with or without a logback prefix: "==> Parameters: 7(Integer), null"
    const mybatis = /^(?:.*?(?:==>|\s))?Parameters:[ \t]?(.*)$/i.exec(line)
    if (mybatis) {
      if (mybatis[1].trim()) sequentialParams.push(...parseMyBatisParams(mybatis[1]))
      continue
    }

    // 4. Simple numbered binding: "[1] = value" or "$1 = 'value'"; quotes mean a string, so '007' stays text
    const simple = /^(?:\[(\d+)\]|\$(\d+))\s*=\s*(.+)$/.exec(line)
    if (simple) {
      const value = simple[3].trim()
      const quoted = /^'(.*)'$/.exec(value)
      indexedParams.set(Number(simple[1] ?? simple[2]), quoted ? { raw: quoted[1].replace(/''/g, "'"), type: 'VARCHAR' } : { raw: value })
      continue
    }

    // Strip the logger prefix before "Hibernate:", "==>  Preparing:" or the org.hibernate.SQL category
    const cleanedSql = line
      .replace(/^.*?\bHibernate:\s*/i, '')
      .replace(/^.*?==>\s*Preparing:\s*/i, '')
      .replace(/^.*?\b(?:org\.hibernate|o\.h)\.SQL\s*:?\s*/, '')
    sqlLines.push(cleanedSql)
  }

  // Lines stay apart: joined with a space, a -- comment would swallow the line after it
  const rawSql = sqlLines.join('\n').trim()
  if (!rawSql) {
    throw new Error(tx({
      en: 'Paste a SQL statement (with ? placeholders) and optional parameter binding lines.',
      pt: 'Cole um comando SQL (com placeholders ?) e, opcionalmente, as linhas de bind de parâmetros.',
    }))
  }

  let paramIndex = 0
  let boundCount = 0
  let unboundCount = 0
  const interpolated = sqlSegments(rawSql)
    .map(seg => seg.kind !== 'code' ? seg.text : seg.text.replace(/\?|\$(\d+)/g, (placeholder, dollar?: string) => {
      // ? takes the next parameter in order; Postgres $n names its own
      const n = dollar ? Number(dollar) : ++paramIndex
      const param = indexedParams.get(n) ?? sequentialParams[n - 1]
      if (!param) {
        unboundCount++
        return placeholder
      }
      boundCount++
      return formatSqlValue(param)
    }))
    .join('')

  return {
    sql: formatSqlQuery(interpolated),
    boundCount,
    unboundCount,
  }
}

export type JvmMemoryInput = {
  limitMiB: number
  heapMode: 'pct' | 'xmx'
  maxRamPct: number
  xmxMiB: number
  metaspaceMiB: number
  directMiB: number
  threads: number
  xssKiB: number
  codeCacheMiB: number
}

export type JvmMemoryResult = {
  heapMiB: number
  threadsMiB: number
  nonHeapMiB: number
  totalMiB: number
  marginMiB: number
  usagePct: number
  status: 'ok' | 'warn' | 'crit'
  safeXmxMiB: number
  safeRamPct: number
  /** False when non-heap alone leaves under 64 MiB of heap: no flag set fits, the limit must grow. */
  heapFits: boolean
  recommendedFlags: string
}

// JVM default ReservedCodeCacheSize with tiered compilation (the default since Java 8)
export const DEFAULT_CODE_CACHE_MIB = 240

export function calculateJvmMemory(input: JvmMemoryInput): JvmMemoryResult {
  const { limitMiB, heapMode, maxRamPct, xmxMiB, metaspaceMiB, directMiB, threads, xssKiB, codeCacheMiB } = input
  if (!Number.isFinite(limitMiB) || limitMiB < 128) {
    throw new Error(tx({
      en: 'Enter a container memory limit of at least 128 MiB.',
      pt: 'Informe um limite de memória do container de pelo menos 128 MiB.',
    }))
  }
  if (![maxRamPct, xmxMiB, metaspaceMiB, directMiB, threads, xssKiB, codeCacheMiB].every(n => Number.isFinite(n) && n >= 0)) {
    throw new Error(tx({
      en: 'Every field needs a number of zero or more.',
      pt: 'Todo campo precisa de um número maior ou igual a zero.',
    }))
  }
  const heapMiB = heapMode === 'xmx'
    ? Math.max(0, Math.round(xmxMiB))
    : Math.max(0, Math.round(limitMiB * (Math.min(100, Math.max(1, maxRamPct)) / 100)))
  const threadsMiB = Math.max(0, Math.round((threads * xssKiB) / 1024))
  const nonHeapMiB = Math.max(0, Math.round(metaspaceMiB + directMiB + threadsMiB + codeCacheMiB))
  const totalMiB = heapMiB + nonHeapMiB
  const marginMiB = limitMiB - totalMiB
  const usagePct = Math.round((totalMiB / limitMiB) * 100)

  const status: 'ok' | 'warn' | 'crit' =
    totalMiB > limitMiB
      ? 'crit'
      : marginMiB < limitMiB * 0.1
        ? 'warn'
        : 'ok'

  // Reserve 10% of container limit for OS/libc native arenas + non-heap footprint
  const roomMiB = Math.floor(limitMiB * 0.9 - nonHeapMiB)
  const heapFits = roomMiB >= 64
  const safeXmxMiB = Math.max(0, roomMiB)
  const safeRamPct = Math.max(1, Math.min(85, Math.floor((safeXmxMiB / limitMiB) * 100)))
  // -Xmx wins over MaxRAMPercentage, so the suggestion follows the mode the user is in
  const heapFlag = heapMode === 'xmx' ? `-Xmx${safeXmxMiB}m` : `-XX:MaxRAMPercentage=${safeRamPct}.0`
  const recommendedFlags = `${heapFlag} -XX:MaxMetaspaceSize=${Math.round(metaspaceMiB)}m -XX:MaxDirectMemorySize=${Math.round(directMiB)}m -XX:ReservedCodeCacheSize=${Math.round(codeCacheMiB)}m -Xss${Math.round(xssKiB)}k -XX:+ExitOnOutOfMemoryError`

  return {
    heapMiB,
    threadsMiB,
    nonHeapMiB,
    totalMiB,
    marginMiB,
    usagePct,
    status,
    safeXmxMiB,
    safeRamPct,
    heapFits,
    recommendedFlags,
  }
}

export type PemCertInfo = {
  subject: string
  issuer: string
  serialNumber: string
  notBefore: Date
  notAfter: Date
  daysRemaining: number
  expired: boolean
  sans: string[]
  /** Certificates in the pasted text (a fullchain.pem has several); only the first is decoded. */
  chainLength: number
}

type Asn1Node = {
  tag: number
  headerLen: number
  length: number
  offset: number
  bytes: Uint8Array
  children?: Asn1Node[]
}

const OID_NAMES: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
}

function parseAsn1(buf: Uint8Array, offset = 0): Asn1Node {
  if (offset >= buf.length) throw new Error('ASN.1 EOF')
  const tag = buf[offset]
  let pos = offset + 1
  if (pos >= buf.length) throw new Error('ASN.1 truncated length')
  let length = buf[pos++]
  if (length & 0x80) {
    const numBytes = length & 0x7f
    if (numBytes === 0 || numBytes > 4 || pos + numBytes > buf.length) throw new Error('ASN.1 invalid length')
    length = 0
    // Multiplication, not <<: with 4 length bytes a bit shift goes negative and the child loop below
    // walks backwards forever, freezing the tab.
    for (let i = 0; i < numBytes; i++) length = length * 256 + buf[pos++]
  }
  const headerLen = pos - offset
  if (length > buf.length - pos) throw new Error('ASN.1 value exceeds buffer')
  const valueBytes = buf.subarray(pos, pos + length)
  const node: Asn1Node = { tag, headerLen, length, offset, bytes: valueBytes }

  // Constructed tags (SEQUENCE 0x30, SET 0x31, or context-specific constructed 0xa0..0xaf)
  if ((tag & 0x20) !== 0) {
    const children: Asn1Node[] = []
    let childPos = pos
    const end = pos + length
    while (childPos < end) {
      const child = parseAsn1(buf, childPos)
      childPos += child.headerLen + child.length
      if (childPos > end) throw new Error('ASN.1 child exceeds its parent')
      children.push(child)
    }
    node.children = children
  }
  return node
}

function decodeOid(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40]
  let val = 0
  for (let i = 1; i < bytes.length; i++) {
    val = (val << 7) | (bytes[i] & 0x7f)
    if ((bytes[i] & 0x80) === 0) {
      parts.push(val)
      val = 0
    }
  }
  return parts.join('.')
}

function decodeAsn1String(node: Asn1Node): string {
  if (node.tag === 0x1e) {
    // BMPString (UTF-16BE)
    let out = ''
    for (let i = 0; i + 1 < node.bytes.length; i += 2) {
      out += String.fromCharCode((node.bytes[i] << 8) | node.bytes[i + 1])
    }
    return out
  }
  return new TextDecoder('utf-8').decode(node.bytes)
}

function decodeName(node: Asn1Node): string {
  const parts: string[] = []
  for (const rdnSet of node.children ?? []) {
    for (const attr of rdnSet.children ?? []) {
      const [oidNode, valNode] = attr.children ?? []
      if (!oidNode || !valNode) continue
      const oid = decodeOid(oidNode.bytes)
      const key = OID_NAMES[oid] ?? oid
      parts.push(`${key}=${decodeAsn1String(valNode)}`)
    }
  }
  return parts.join(', ')
}

function decodeAsn1Time(node: Asn1Node): Date {
  const s = new TextDecoder('ascii').decode(node.bytes).trim()
  if (node.tag === 0x17) {
    // UTCTime: YYMMDDHHMMSSZ
    const yy = Number(s.slice(0, 2))
    const year = yy >= 50 ? 1900 + yy : 2000 + yy
    const iso = `${year}-${s.slice(2, 4)}-${s.slice(4, 6)}T${s.slice(6, 8)}:${s.slice(8, 10)}:${s.slice(10, 12)}Z`
    return new Date(iso)
  }
  // GeneralizedTime: YYYYMMDDHHMMSSZ
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`
  return new Date(iso)
}

function formatIpv6(bytes: Uint8Array): string {
  const groups: string[] = []
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16))
  return groups.join(':')
}

export function decodePemCertificate(pem: string, nowMs = Date.now()): PemCertInfo {
  // Each block is decoded on its own: joining a chain's base64 breaks on the first block's "=" padding,
  // and text such as `openssl x509 -text` output around the block is not base64 at all.
  const blocks = [...pem.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g)].map(m => m[1])
  const chainLength = Math.max(1, blocks.length)
  const cleaned = (blocks[0] ?? pem).replace(/\s+/g, '')
  if (!cleaned) {
    throw new Error(tx({
      en: 'Paste a PEM certificate (-----BEGIN CERTIFICATE-----).',
      pt: 'Cole um certificado PEM (-----BEGIN CERTIFICATE-----).',
    }))
  }

  let der: Uint8Array
  try {
    der = Uint8Array.from(atob(cleaned), c => c.charCodeAt(0))
  } catch {
    throw new Error(tx({
      en: 'Invalid PEM Base64 content.',
      pt: 'Conteúdo Base64 do certificado PEM inválido.',
    }))
  }

  try {
    const root = parseAsn1(der, 0)
    const tbs = root.children?.[0]
    if (!tbs || !tbs.children || tbs.children.length < 6) {
      throw new Error('Missing TBSCertificate fields')
    }
    let idx = 0
    // Optional [0] EXPLICIT version
    if (tbs.children[0].tag === 0xa0) idx = 1

    const serialNode = tbs.children[idx]
    const issuerNode = tbs.children[idx + 2]
    const validityNode = tbs.children[idx + 3]
    const subjectNode = tbs.children[idx + 4]

    const serialBytes = serialNode.bytes[0] === 0 && serialNode.bytes.length > 1
      ? serialNode.bytes.subarray(1)
      : serialNode.bytes
    const serialNumber = [...serialBytes].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':')

    const issuer = decodeName(issuerNode)
    const subject = decodeName(subjectNode)

    const [notBeforeNode, notAfterNode] = validityNode.children ?? []
    if (!notBeforeNode || !notAfterNode) throw new Error('Invalid validity period')
    const notBefore = decodeAsn1Time(notBeforeNode)
    const notAfter = decodeAsn1Time(notAfterNode)

    const sans: string[] = []
    const extExplicit = tbs.children.find(c => c.tag === 0xa3)
    const extSeq = extExplicit?.children?.[0]
    for (const ext of extSeq?.children ?? []) {
      const children = ext.children ?? []
      const oidNode = children[0]
      const octetNode = children.find(c => c.tag === 0x04)
      if (!oidNode || !octetNode) continue
      if (decodeOid(oidNode.bytes) === '2.5.29.17') {
        const sanSeq = parseAsn1(octetNode.bytes, 0)
        for (const gn of sanSeq.children ?? []) {
          // rfc822Name (email), dNSName and uniformResourceIdentifier are IA5 strings
          if (gn.tag === 0x81 || gn.tag === 0x82 || gn.tag === 0x86) {
            sans.push(new TextDecoder('utf-8').decode(gn.bytes))
          } else if (gn.tag === 0x87 && gn.bytes.length === 4) {
            sans.push([...gn.bytes].join('.'))
          } else if (gn.tag === 0x87 && gn.bytes.length === 16) {
            sans.push(formatIpv6(gn.bytes))
          }
        }
      }
    }

    const expired = notAfter.getTime() < nowMs
    // `|| 0` turns the -0 of a certificate that expired less than a day ago into 0
    const daysRemaining = Math.ceil((notAfter.getTime() - nowMs) / 86_400_000) || 0

    return {
      subject: subject || '(empty)',
      issuer: issuer || '(empty)',
      serialNumber,
      notBefore,
      notAfter,
      daysRemaining,
      expired,
      sans,
      chainLength,
    }
  } catch (e) {
    throw new Error(tx({
      en: `Could not parse X.509 certificate: ${(e as Error).message}`,
      pt: `Não foi possível ler o certificado X.509: ${(e as Error).message}`,
    }))
  }
}
