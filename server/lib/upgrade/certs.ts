// Vencimento de certificados: o TLS servido por cada host de ingress (pela conexão, sem ler Secret)
// e o certificado de cliente de cada kubeconfig. Só a data sai daqui; o conteúdo nunca.
// Autoteste: node server/lib/upgrade/certs.ts --selfcheck

import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { connect } from 'node:tls'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export type CertState = 'ok' | 'vence-logo' | 'vencido' | 'inacessível' | 'sem-certificado'
// trusted: cadeia validada pelo Node (só TLS); null quando não se aplica.
export type CertInfo = { validTo: string | null; daysLeft: number | null; state: CertState; detail: string; trusted?: boolean | null }

const SOON_DAYS = 30
const DAY = 86_400_000

export function classify(validTo: Date, now = new Date()): Pick<CertInfo, 'daysLeft' | 'state'> {
  const daysLeft = Math.floor((validTo.getTime() - now.getTime()) / DAY)
  return { daysLeft, state: daysLeft < 0 ? 'vencido' : daysLeft <= SOON_DAYS ? 'vence-logo' : 'ok' }
}

// Host de ingress: abre a conexão e lê o certificado apresentado. rejectUnauthorized=false porque o
// objetivo é ver a data até de certificado inválido; a validade da cadeia vai no detalhe.
export function tlsCertificate(host: string, port = 443, timeoutMs = 8000): Promise<CertInfo> {
  return new Promise(resolve => {
    const socket = connect({ host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs })
    const done = (info: CertInfo) => (socket.destroy(), resolve(info))
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate()
      if (!cert?.valid_to) return done({ validTo: null, daysLeft: null, state: 'sem-certificado', detail: 'o host não apresentou certificado' })
      const validTo = new Date(cert.valid_to)
      const chain = socket.authorized ? 'cadeia válida' : `cadeia não confiável (${socket.authorizationError})`
      done({ validTo: validTo.toISOString(), ...classify(validTo), trusted: socket.authorized, detail: `${chain} · emitido por ${cert.issuer?.O ?? cert.issuer?.CN ?? '?'}` })
    })
    socket.once('timeout', () => done({ validTo: null, daysLeft: null, state: 'inacessível', detail: `sem resposta em ${timeoutMs / 1000}s (rede interna ou VPN?)` }))
    socket.once('error', e => done({ validTo: null, daysLeft: null, state: 'inacessível', detail: e.message.slice(0, 160) }))
  })
}

type RawUser = { name: string; user: { 'client-certificate-data'?: string; 'client-certificate'?: string; token?: string; exec?: unknown; 'auth-provider'?: unknown } }

// Certificado de cliente de cada usuário do kubeconfig. Token, exec e auth-provider não têm data
// conhecida aqui: aparecem como "sem certificado" com o tipo de credencial.
export function userCertificates(users: RawUser[], readCert: (u: RawUser['user']) => string | null): { user: string; info: CertInfo }[] {
  return users.map(({ name, user }) => {
    const pem = readCert(user)
    if (!pem) {
      const kind = user.exec ? 'login por exec (OIDC, cloud)' : user['auth-provider'] ? 'auth-provider' : user.token ? 'token' : 'credencial desconhecida'
      return { user: name, info: { validTo: null, daysLeft: null, state: 'sem-certificado' as const, detail: `${kind}: validade não informada no kubeconfig` } }
    }
    try {
      const validTo = new Date(new X509Certificate(pem).validTo)
      return { user: name, info: { validTo: validTo.toISOString(), ...classify(validTo), detail: 'certificado de cliente' } }
    } catch (e) {
      return { user: name, info: { validTo: null, daysLeft: null, state: 'sem-certificado' as const, detail: `certificado ilegível: ${(e as Error).message.slice(0, 80)}` } }
    }
  })
}

// --raw é necessário para ler o certificado embutido; ele fica só nesta função, que devolve a data.
export async function kubeconfigCertificates(file: string) {
  const { stdout } = await exec('kubectl', ['config', 'view', '--raw', '--kubeconfig', file, '-o', 'json'], { timeout: 10_000, maxBuffer: 10 * 1024 * 1024 })
  const users = (JSON.parse(stdout) as { users?: RawUser[] }).users ?? []
  return userCertificates(users, u => {
    if (u['client-certificate-data']) return Buffer.from(u['client-certificate-data'], 'base64').toString('utf-8')
    if (u['client-certificate']) {
      try {
        return readFileSync(u['client-certificate'], 'utf-8')
      } catch {
        return null
      }
    }
    return null
  })
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const now = new Date('2026-10-01T00:00:00Z')
  assert.deepEqual(classify(new Date('2027-01-01T00:00:00Z'), now), { daysLeft: 92, state: 'ok' })
  assert.deepEqual(classify(new Date('2026-10-20T00:00:00Z'), now), { daysLeft: 19, state: 'vence-logo' })
  assert.equal(classify(new Date('2026-09-30T00:00:00Z'), now).state, 'vencido')

  const users = userCertificates(
    [{ name: 'oidc', user: { exec: {} } }, { name: 'tk', user: { token: 'x' } }, { name: 'quebrado', user: { 'client-certificate-data': 'x' } }],
    u => (u['client-certificate-data'] ? 'não é PEM' : null),
  )
  assert.deepEqual(users.map(u => u.info.state), ['sem-certificado', 'sem-certificado', 'sem-certificado'])
  assert.match(users[0].info.detail, /exec/)
  assert.match(users[1].info.detail, /token/)
  assert.match(users[2].info.detail, /ilegível/)
  for (const u of users) assert.ok(!JSON.stringify(u).includes('"x"'), 'credencial nunca volta')
  console.log('upgrade certs selfcheck: ok')
}
