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

// Literais preservados: espaços dentro de string e o valor como foi logado
const sqlSpaces = interpolateSql("select * from t where a = '  x  y ' and b = ?\nbinding parameter [1] as [VARCHAR] - [  pad  ]")
assert.ok(sqlSpaces.sql.includes("'  x  y '"), 'não comprime espaços dentro de literal')
assert.ok(sqlSpaces.sql.includes("b = '  pad  '"), 'não apara o valor do parâmetro')

// Linha de Parameters com prefixo do logback (Spring Boot) e lista vazia
const sqlLogback = interpolateSql([
  '2024-05-01 10:00:00.123 DEBUG 1 --- [main] c.e.UserMapper.find : ==>  Preparing: select * from users where id = ?',
  '2024-05-01 10:00:00.124 DEBUG 1 --- [main] c.e.UserMapper.find : ==> Parameters: 7(Integer)',
  '2024-05-01 10:00:00.130 DEBUG 1 --- [main] c.e.UserMapper.find : <==      Total: 1',
].join('\n'))
assert.equal(sqlLogback.boundCount, 1)
assert.equal(sqlLogback.sql, 'SELECT *\nFROM users\nWHERE id = 7')
assert.equal(interpolateSql('==>  Preparing: select 1\n==> Parameters: ').sql, 'SELECT 1')

// MyBatis: vírgula dentro do valor e BigDecimal como número
const sqlComma = interpolateSql("==>  Preparing: insert into p (nome, id, preco) values (?, ?, ?)\n==> Parameters: Silva, Joao(String), 1(Integer), 3.14(BigDecimal)")
assert.equal(sqlComma.boundCount, 3)
assert.ok(sqlComma.sql.includes("('Silva, Joao', 1, 3.14)"))
assert.deepEqual(interpolateSql('select ?, ?\n==> Parameters: null, 2(Long)').sql, 'SELECT NULL, 2')

// Postgres $n, e aspas mantêm o texto: '007' não vira número
const sqlDollar = interpolateSql("select * from t where a = $2 and b = $1\n$1 = '007'\n$2 = 5")
assert.equal(sqlDollar.boundCount, 2)
assert.ok(sqlDollar.sql.includes("a = 5") && sqlDollar.sql.includes("b = '007'"))

// Comentários e escape com barra não consomem parâmetros
const sqlComment = interpolateSql("select * from t -- why?\nwhere a = ? /* b = ? */ and c = 'it\\'s?'\nbinding parameter [1] as [INTEGER] - [9]")
assert.equal(sqlComment.boundCount, 1)
assert.equal(sqlComment.unboundCount, 0)
assert.ok(sqlComment.sql.includes('-- why?\nWHERE a = 9'), 'o comentário de linha termina na quebra de linha')
assert.ok(sqlComment.sql.includes("'it\\'s?'"))

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

const chain = decodePemCertificate(`${samplePem}\n${samplePem}`, Date.parse('2026-10-16T02:00:00Z'))
assert.equal(chain.subject, cert.subject, 'cadeia: o primeiro bloco é lido mesmo com padding "=" no fim dele')
assert.equal(chain.chainLength, 2)
assert.equal(decodePemCertificate(`Certificate:\n    Data: x\n${samplePem}`).subject, cert.subject, 'texto do openssl em volta do bloco')
assert.equal(decodePemCertificate(samplePem, Date.parse('2036-10-13T02:52:03Z')).daysRemaining, 0, 'sem -0 logo após expirar')

const sanPem = [
  '-----BEGIN CERTIFICATE-----',
  'MIIB3DCCAYGgAwIBAgIUfjuZ7XhPeRMgyK0N3ZZDqQtq/ZcwCgYIKoZIzj0EAwIw',
  'EzERMA8GA1UEAwwIc2FuLnRlc3QwHhcNMjYxMDE2MTY0MzEzWhcNMzYxMDEzMTY0',
  'MzEzWjATMREwDwYDVQQDDAhzYW4udGVzdDBZMBMGByqGSM49AgEGCCqGSM49AwEH',
  'A0IABHHIDOu137OsMYybg8s6qDi95UnfTLoCZ5kBzx5m27o/H5BdfJm/jV2LaCbQ',
  'Hv/S42IUqb/flbnSASVd0BnSl2ijgbIwga8wHQYDVR0OBBYEFH6zVKeBO8HufiFk',
  '1iGf29jp1IbCMB8GA1UdIwQYMBaAFH6zVKeBO8HufiFk1iGf29jp1IbCMA8GA1Ud',
  'EwEB/wQFMAMBAf8wXAYDVR0RBFUwU4IIc2FuLnRlc3SHEAAAAAAAAAAAAAAAAAAA',
  'AAGHECABDbgAAAAAAAAAAAAAAAWBDG9wc0BzYW4udGVzdIYVc3BpZmZlOi8vc2Fu',
  'LnRlc3QvYXBpMAoGCCqGSM49BAMCA0kAMEYCIQCXnyOtRC/XYwBPYtXD2FDr4L4m',
  'LN89GaYZKbv3ne2XgQIhAI/5DNmbI708nydqKwvRy9QjFoWHahLvoLSpQgf0eYwA',
  '-----END CERTIFICATE-----',
].join('\n')
assert.deepEqual(decodePemCertificate(sanPem).sans, ['san.test', '0:0:0:0:0:0:0:1', '2001:db8:0:0:0:0:0:5', 'ops@san.test', 'spiffe://san.test/api'])

// DER com comprimento de 4 bytes e bit alto ligado: antes andava para trás para sempre
const hostile = btoa(String.fromCharCode(0x30, 0x0c, 0x02, 0x01, 0x00, 0x31, 0x84, 0xff, 0xff, 0xff, 0xf7, 0x00, 0x00, 0x00))
assert.throws(() => decodePemCertificate(`-----BEGIN CERTIFICATE-----\n${hostile}\n-----END CERTIFICATE-----`), /X\.509/)

console.log('check-text: ok')
