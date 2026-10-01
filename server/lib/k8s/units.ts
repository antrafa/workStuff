// Unidades do Kubernetes. Autoteste: node server/lib/k8s/units.ts --selfcheck
import assert from 'node:assert/strict'

// CPU em millicores: "250m", "2", "1500000n" (nanocores, como vem das métricas).
export function cpuMillis(v: string | undefined | null): number {
  if (!v) return 0
  if (v.endsWith('n')) return Number(v.slice(0, -1)) / 1e6
  if (v.endsWith('u')) return Number(v.slice(0, -1)) / 1e3
  if (v.endsWith('m')) return Number(v.slice(0, -1))
  return Number(v) * 1000
}

const BIN: Record<string, number> = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 }
const DEC: Record<string, number> = { k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 }

// Memória em bytes: "512Mi", "1Gi", "1000000k", "134217728".
export function memBytes(v: string | undefined | null): number {
  if (!v) return 0
  const m = v.match(/^([\d.]+)([A-Za-z]*)$/)
  if (!m) return 0
  const [, n, unit] = m
  return Number(n) * (BIN[unit] ?? DEC[unit] ?? 1)
}

export const toMi = (bytes: number) => Math.round(bytes / 1024 ** 2)
export const toGi = (bytes: number) => Math.round((bytes / 1024 ** 3) * 10) / 10

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.equal(cpuMillis('250m'), 250)
  assert.equal(cpuMillis('2'), 2000)
  assert.equal(cpuMillis('1500000n'), 1.5)
  assert.equal(memBytes('512Mi'), 512 * 1024 ** 2)
  assert.equal(memBytes('1Gi'), 1024 ** 3)
  assert.equal(memBytes('1000k'), 1e6)
  assert.equal(memBytes('134217728'), 134217728)
  assert.equal(toMi(memBytes('743Mi')), 743)
  console.log('k8s units selfcheck: ok')
}
