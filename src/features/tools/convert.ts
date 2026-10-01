export type JwtInfo = { header: string; payload: string; exp: Date | null; iat: Date | null }

export function base64Encode(text: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
}

export function base64Decode(b64: string) {
  const normalized = b64.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export function decodeJwt(token: string): JwtInfo {
  const parts = token.trim().split('.')
  if (parts.length < 2) throw new Error('Um JWT tem três partes separadas por ponto (header.payload.assinatura).')
  const header = JSON.parse(base64Decode(parts[0]))
  const payload = JSON.parse(base64Decode(parts[1]))
  const date = (v: unknown) => (typeof v === 'number' ? new Date(v * 1000) : null)
  return { header: JSON.stringify(header, null, 2), payload: JSON.stringify(payload, null, 2), exp: date(payload.exp), iat: date(payload.iat) }
}

export function parseEpoch(input: string) {
  const n = Number(input.trim())
  if (!input.trim() || !Number.isFinite(n)) throw new Error('Informe um número de segundos ou milissegundos desde 1970.')
  // 11+ dígitos só faz sentido como milissegundos (segundos passariam do ano 5000).
  const ms = Math.abs(n) >= 1e11 ? n : n * 1000
  const date = new Date(ms)
  if (isNaN(date.getTime())) throw new Error('Timestamp fora do intervalo de datas válido.')
  return { date, unit: ms === n ? 'milissegundos' : 'segundos' }
}
