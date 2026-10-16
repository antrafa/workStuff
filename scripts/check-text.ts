// Autoteste dos conversores de texto: node scripts/check-text.ts
import assert from 'node:assert/strict'
import { digest, formatJson, lineDiff, regexMatches, toYaml, yamlToJson } from '../src/features/tools/text.ts'
import { calculateJvmMemory, decodePemCertificate, interpolateSql } from '../src/features/tools/devops.ts'

assert.equal(formatJson('{"a":1,"b":[true,null]}'), '{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}')
assert.throws(() => formatJson('{\n  "a": 1,\n  "b": }'), /line 3, column 8: found "}"/)
assert.throws(() => formatJson('{"a": [1, 2,]}'), /column 13/)
assert.throws(() => formatJson('{"a": 1'), /ended too early/)
assert.throws(() => formatJson('{"a": 1} x'), /column 10/)

const manifest = {
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { name: 'api', labels: { app: 'api' } },
  spec: {
    replicas: 2,
    template: { spec: { containers: [{ name: 'app', image: 'nginx:1.27', ports: [{ containerPort: 80 }], env: [{ name: 'DEBUG', value: 'true' }, { name: 'PORTA', value: '8080' }] }] } },
  },
  vazio: {},
  lista: [],
  nulo: null,
  texto: 'a: b',
}
assert.equal(toYaml(manifest), [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: api',
  '  labels:',
  '    app: api',
  'spec:',
  '  replicas: 2',
  '  template:',
  '    spec:',
  '      containers:',
  '      - name: app',
  '        image: nginx:1.27',
  '        ports:',
  '        - containerPort: 80',
  '        env:',
  '        - name: DEBUG',
  '          value: "true"',
  '        - name: PORTA',
  '          value: "8080"',
  'vazio: {}',
  'lista: []',
  'nulo: null',
  'texto: "a: b"',
].join('\n'), 'string que parece booleano ou número vai entre aspas')
assert.deepEqual(JSON.parse(yamlToJson(toYaml(manifest))), manifest, 'ida e volta sem perder nada')
assert.deepEqual(JSON.parse(yamlToJson('a: 1\n---\nb: [x, y]\n')), [{ a: 1 }, { b: ['x', 'y'] }], 'vários documentos viram array')
assert.throws(() => yamlToJson('a: [1, 2\nb: 3'), /invalid YAML/)

const diff = lineDiff('a\nb\nc\nd', 'a\nB\nc\nd\ne')
assert.deepEqual(diff.map(d => `${d.kind[0]}${d.text}`), ['ia', 'rb', 'aB', 'ic', 'id', 'ae'])
assert.deepEqual(diff.find(d => d.text === 'c'), { kind: 'igual', text: 'c', a: 3, b: 3 })
assert.ok(lineDiff('x', 'x').every(d => d.kind === 'igual'))

const m = regexMatches('(\\w+)@(\\w+)\\.com', 'i', 'Fulano@Exemplo.com e beltrano@teste.com')
assert.deepEqual(m.map(x => x.groups), [['Fulano', 'Exemplo'], ['beltrano', 'teste']])
assert.throws(() => regexMatches('(', '', 'x'))

assert.equal(await digest('SHA-256', 'abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')

// SQL Bind: Hibernate 5/6 & MyBatis
const sqlH5 = interpolateSql([
  "Hibernate: select p.id from tb_passagem p where p.uf = ? and p.vel >= ? and p.ativo = ? and p.erro is ? and p.obs = 'valor ? fixo'",
  'binding parameter [1] as [VARCHAR] - [MG]',
  'binding parameter (2:INTEGER) <- [80]',
  'binding parameter [3] as [BOOLEAN] - [true]',
  'binding parameter [4] as [VARCHAR] - [null]',
].join('\n'))
assert.equal(sqlH5.boundCount, 4)
assert.equal(sqlH5.unboundCount, 0)
assert.ok(sqlH5.sql.includes("WHERE p.uf = 'MG'"))
assert.ok(sqlH5.sql.includes('AND p.vel >= 80'))
assert.ok(sqlH5.sql.includes('AND p.ativo = TRUE'))
assert.ok(sqlH5.sql.includes('AND p.erro is NULL'))
assert.ok(sqlH5.sql.includes("'valor ? fixo'"), 'não substitui ? dentro de literal string')

const sqlMb = interpolateSql('==>  Preparing: select * from users where nome = ? and id = ?\n==> Parameters: D\'Ávila(String), 42(Long)')
assert.equal(sqlMb.boundCount, 2)
assert.ok(sqlMb.sql.includes("WHERE nome = 'D''Ávila'"))
assert.ok(sqlMb.sql.includes('AND id = 42'))

// JVM & K8s Memory
const jvmOom = calculateJvmMemory({ limitMiB: 1024, heapMode: 'pct', maxRamPct: 80, xmxMiB: 800, metaspaceMiB: 256, directMiB: 64, threads: 200, xssKiB: 1024, codeCacheMiB: 128 })
assert.equal(jvmOom.status, 'crit', '80% heap + 648 MiB non-heap ultrapassa 1024 MiB')
assert.ok(jvmOom.totalMiB > 1024)
const jvmOk = calculateJvmMemory({ limitMiB: 2048, heapMode: 'xmx', maxRamPct: 50, xmxMiB: 1024, metaspaceMiB: 256, directMiB: 64, threads: 150, xssKiB: 1024, codeCacheMiB: 128 })
assert.equal(jvmOk.status, 'ok')
assert.ok(jvmOk.recommendedFlags.includes('-XX:MaxRAMPercentage='))

// X.509 PEM Certificate (DER self-signed certificate with SANs)
const samplePem = [
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
const cert = decodePemCertificate(samplePem, Date.parse('2026-10-16T02:00:00Z'))
assert.equal(cert.subject, 'CN=api.workstuff.local, O=workStuff')
assert.equal(cert.issuer, 'CN=api.workstuff.local, O=workStuff')
assert.equal(cert.expired, false)
assert.deepEqual(cert.sans, ['api.workstuff.local', 'localhost', '127.0.0.1'])

console.log('check-text: ok')
