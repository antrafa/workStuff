// Autoteste do texto da tela Requisições HTTP: cabeçalhos, variáveis, curl de ida e volta.
// node scripts/check-http.ts
import assert from 'node:assert/strict'
import { applyVars, parseCurl, parseHeaderLines, parseVars, shellWords, toCurl } from '../src/features/http/requestText.ts'

assert.deepEqual(parseHeaderLines('Accept: application/json\n\n# X-Off: 1\nAuthorization: Bearer a:b\nlixo'), [
  { name: 'Accept', value: 'application/json' },
  { name: 'Authorization', value: 'Bearer a:b' },
], 'linha comentada sai; dois-pontos no valor ficam')
assert.deepEqual(parseVars('base = http://x:8080\n# token=velho\ntoken=a=b'), { base: 'http://x:8080', token: 'a=b' })

assert.deepEqual(applyVars('{{base}}/api?t={{ token }}&x={{falta}}', { base: 'http://h', token: '1' }), { text: 'http://h/api?t=1&x={{falta}}', missing: ['falta'] })

assert.deepEqual(shellWords(`curl 'http://a/b c' -H "X-A: \\"1\\"" \\\n  --data-raw '{"a":"it'\\''s"}'`), ['curl', 'http://a/b c', '-H', 'X-A: "1"', '--data-raw', `{"a":"it's"}`])
assert.throws(() => shellWords(`curl 'aberto`), /unclosed/)

// What Chrome's "Copy as cURL (bash)" produces, trimmed
const chrome = parseCurl(`curl 'https://api.exemplo.com/v1/pedidos' \\
  -H 'accept: application/json' \\
  -H 'authorization: Bearer abc' \\
  --data-raw '{"id":1}' \\
  --compressed`)
assert.deepEqual(chrome, { method: 'POST', url: 'https://api.exemplo.com/v1/pedidos', headers: 'accept: application/json\nauthorization: Bearer abc', body: '{"id":1}' }, 'corpo sem -X vira POST')
assert.equal(parseCurl('curl -X delete http://x/1 -s -L').method, 'DELETE')
assert.equal(parseCurl('curl -u ana:senha http://x').headers, `Authorization: Basic ${btoa('ana:senha')}`)
assert.equal(parseCurl('curl --url http://x -o saida.txt -G').url, 'http://x', '-o leva o valor junto, sem virar URL')
assert.equal(parseCurl(`curl --json '{"a":1}' http://x`).headers, 'Content-Type: application/json\nAccept: application/json')
assert.throws(() => parseCurl('wget http://x'), /must start with curl/)
assert.throws(() => parseCurl('curl -H'), /needs a value/)

const back = toCurl({ method: 'POST', url: 'http://x/a', headers: [{ name: 'X-A', value: "it's" }], body: '{"a":1}' })
assert.equal(back, `curl -X POST 'http://x/a' -H 'X-A: it'\\''s' --data-raw '{"a":1}'`)
const again = parseCurl(back)
assert.deepEqual([again.method, again.url, again.headers, again.body], ['POST', 'http://x/a', "X-A: it's", '{"a":1}'], 'ida e volta sem perder nada')
assert.equal(toCurl({ method: 'GET', url: 'http://x', headers: [], body: 'ignorado' }), `curl 'http://x'`)

console.log('check-http: ok')
