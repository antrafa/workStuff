// Autoteste dos conversores de texto: node scripts/check-text.ts
import assert from 'node:assert/strict'
import { digest, formatJson, lineDiff, regexMatches, toYaml, yamlToJson } from '../src/features/tools/text.ts'

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
console.log('check-text: ok')
