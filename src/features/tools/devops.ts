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
  'DECIMAL', 'NUMERIC', 'DOUBLE', 'FLOAT', 'REAL', 'NUMBER',
])

const BOOLEAN_SQL_TYPES = new Set(['BOOLEAN', 'BOOL', 'BIT'])

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
  return `'${val.replace(/'/g, "''")}'`
}

// Formats major SQL clauses onto new lines outside single/double-quoted literals
export function formatSqlQuery(sql: string): string {
  const compact = sql.trim().replace(/\s+/g, ' ')
  if (!compact) return ''
  const clauses = [
    'SELECT', 'FROM', 'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
    'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'CROSS JOIN', 'JOIN',
    'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'VALUES', 'SET',
  ]
  const indentClauses = new Set(['AND', 'OR'])
  let out = ''
  let i = 0
  let quote: string | null = null
  let depth = 0

  while (i < compact.length) {
    const ch = compact[i]
    if (quote) {
      out += ch
      if (ch === quote) {
        if (compact[i + 1] === quote) {
          out += compact[++i]
        } else {
          quote = null
        }
      }
      i++
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      out += ch
      i++
      continue
    }
    if (ch === '(') {
      depth++
      out += ch
      i++
      continue
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1)
      out += ch
      i++
      continue
    }

    if (depth === 0 && (i === 0 || compact[i - 1] === ' ')) {
      const rest = compact.slice(i)
      let matched = false
      for (const kw of clauses) {
        const re = new RegExp(`^${kw}\\b`, 'i')
        const m = re.exec(rest)
        if (m) {
          out = out.trimEnd() + (out.trim() ? '\n' : '') + kw
          i += m[0].length
          matched = true
          break
        }
      }
      if (matched) continue

      for (const kw of indentClauses) {
        const re = new RegExp(`^${kw}\\b`, 'i')
        const m = re.exec(rest)
        if (m) {
          out = out.trimEnd() + '\n  ' + kw
          i += m[0].length
          matched = true
          break
        }
      }
      if (matched) continue
    }

    out += ch
    i++
  }

  return out.trim()
}

export function interpolateSql(input: string): SqlBindResult {
  const lines = input.split(/\r?\n/)
  const sqlLines: string[] = []
  const indexedParams = new Map<number, SqlParam>()
  const sequentialParams: SqlParam[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

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

    // 3. MyBatis / Spring JDBC / P6Spy: "Parameters: val1(String), 42(Long), null"
    const mybatis = /^(?:==>|\d{2}:\d{2}:\d{2}\.\d+.*)?\s*Parameters:\s*(.+)$/i.exec(line)
    if (mybatis) {
      const parts = mybatis[1].split(/,\s*(?![^()]*\))/)
      for (const part of parts) {
        const p = part.trim()
        if (/^null$/i.test(p)) {
          sequentialParams.push({ raw: 'null' })
        } else {
          const typed = /^(.*)\(([A-Za-z0-9_]+)\)$/.exec(p)
          if (typed) sequentialParams.push({ raw: typed[1], type: typed[2] })
          else sequentialParams.push({ raw: p })
        }
      }
      continue
    }

    // 4. Simple numbered binding: "[1] = value" or "$1 = 'value'"
    const simple = /^(?:\[(\d+)\]|\$(\d+))\s*=\s*(.+)$/.exec(line)
    if (simple) {
      const idx = Number(simple[1] ?? simple[2])
      const cleaned = simple[3].trim().replace(/^'(.*)'$/, '$1')
      indexedParams.set(idx, { raw: cleaned })
      continue
    }

    // Strip logger prefix before "Hibernate:" or "==>  Preparing:"
    const cleanedSql = line
      .replace(/^.*?\bHibernate:\s*/i, '')
      .replace(/^.*?==>\s*Preparing:\s*/i, '')
    sqlLines.push(cleanedSql)
  }

  const rawSql = sqlLines.join(' ').trim()
  if (!rawSql) {
    throw new Error(tx({
      en: 'Paste a SQL statement (with ? placeholders) and optional parameter binding lines.',
      pt: 'Cole um comando SQL (com placeholders ?) e, opcionalmente, as linhas de bind de parâmetros.',
    }))
  }

  let paramIndex = 0
  let boundCount = 0
  let unboundCount = 0
  let interpolated = ''
  let quote: string | null = null

  for (let i = 0; i < rawSql.length; i++) {
    const ch = rawSql[i]
    if (quote) {
      interpolated += ch
      if (ch === quote) {
        if (rawSql[i + 1] === quote) interpolated += rawSql[++i]
        else quote = null
      }
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      interpolated += ch
      continue
    }
    if (ch === '?') {
      paramIndex++
      const param = indexedParams.get(paramIndex) ?? sequentialParams[paramIndex - 1]
      if (param) {
        interpolated += formatSqlValue(param)
        boundCount++
      } else {
        interpolated += '?'
        unboundCount++
      }
      continue
    }
    interpolated += ch
  }

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
  recommendedFlags: string
}

export function calculateJvmMemory(input: JvmMemoryInput): JvmMemoryResult {
  const { limitMiB, heapMode, maxRamPct, xmxMiB, metaspaceMiB, directMiB, threads, xssKiB, codeCacheMiB } = input
  if (!Number.isFinite(limitMiB) || limitMiB < 128) {
    throw new Error(tx({
      en: 'Enter a container memory limit of at least 128 MiB.',
      pt: 'Informe um limite de memória do container de pelo menos 128 MiB.',
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
  const safeXmxMiB = Math.max(64, Math.floor(limitMiB * 0.9 - nonHeapMiB))
  const safeRamPct = Math.max(10, Math.min(85, Math.floor((safeXmxMiB / limitMiB) * 100)))
  const recommendedFlags = `-XX:MaxRAMPercentage=${safeRamPct}.0 -XX:MaxMetaspaceSize=${Math.round(metaspaceMiB)}m -XX:MaxDirectMemorySize=${Math.round(directMiB)}m -Xss${Math.round(xssKiB)}k -XX:+ExitOnOutOfMemoryError`

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
    for (let i = 0; i < numBytes; i++) length = (length << 8) | buf[pos++]
  }
  const headerLen = pos - offset
  if (pos + length > buf.length) throw new Error('ASN.1 value exceeds buffer')
  const valueBytes = buf.subarray(pos, pos + length)
  const node: Asn1Node = { tag, headerLen, length, offset, bytes: valueBytes }

  // Constructed tags (SEQUENCE 0x30, SET 0x31, or context-specific constructed 0xa0..0xaf)
  if ((tag & 0x20) !== 0) {
    const children: Asn1Node[] = []
    let childPos = pos
    const end = pos + length
    while (childPos < end) {
      const child = parseAsn1(buf, childPos)
      children.push(child)
      childPos += child.headerLen + child.length
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

export function decodePemCertificate(pem: string, nowMs = Date.now()): PemCertInfo {
  const cleaned = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')
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
          if (gn.tag === 0x82) {
            // dNSName
            sans.push(new TextDecoder('utf-8').decode(gn.bytes))
          } else if (gn.tag === 0x87 && gn.bytes.length === 4) {
            // IPv4
            sans.push([...gn.bytes].join('.'))
          }
        }
      }
    }

    const expired = notAfter.getTime() < nowMs
    const daysRemaining = Math.ceil((notAfter.getTime() - nowMs) / 86_400_000)

    return {
      subject: subject || '(empty)',
      issuer: issuer || '(empty)',
      serialNumber,
      notBefore,
      notAfter,
      daysRemaining,
      expired,
      sans,
    }
  } catch (e) {
    throw new Error(tx({
      en: `Could not parse X.509 certificate: ${(e as Error).message}`,
      pt: `Não foi possível ler o certificado X.509: ${(e as Error).message}`,
    }))
  }
}
