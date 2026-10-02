// Serviços locais: portas em escuta (com o processo dono), containers Docker e projetos compose.
// Iniciar, parar e reiniciar são escrita local: só valem para o que a própria listagem devolveu.
// Autoteste: node server/lib/local/services.ts --selfcheck

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { PLATFORM, type Os } from '../platform.ts'
import { run, which } from '../run.ts'

export type Port = { address: string; port: number; pid: number | null; process: string | null }

// ss -ltnpH: "LISTEN 0 4096 127.0.0.1:39855 0.0.0.0:* users:(("language_server",pid=459956,fd=22))"
export function parseSs(out: string): Port[] {
  return out.split('\n').flatMap(line => {
    const cols = line.trim().split(/\s+/)
    if (cols[0] !== 'LISTEN' || !cols[3]) return []
    const local = cols[3]
    const at = local.lastIndexOf(':')
    const proc = line.match(/users:\(\("([^"]+)",pid=(\d+)/)
    return [{ address: local.slice(0, at).replace(/^\[|\]$/g, '').replace(/%\w+$/, ''), port: Number(local.slice(at + 1)), pid: proc ? Number(proc[2]) : null, process: proc?.[1] ?? null }]
  })
}

// lsof -nP -iTCP -sTCP:LISTEN: "node 1234 eu 23u IPv4 0x... 0t0 TCP 127.0.0.1:3000 (LISTEN)"
export function parseLsof(out: string): Port[] {
  return out.split('\n').slice(1).flatMap(line => {
    const m = line.match(/^(\S+)\s+(\d+)\s.*TCP (\S+):(\d+) \(LISTEN\)/)
    return m ? [{ address: m[3].replace(/^\[|\]$/g, ''), port: Number(m[4]), pid: Number(m[2]), process: m[1] }] : []
  })
}

// netstat -ano -p tcp (Windows): "  TCP    0.0.0.0:135    0.0.0.0:0    LISTENING    1052"
export function parseNetstat(out: string): Port[] {
  return out.split('\n').flatMap(line => {
    const m = line.trim().match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i)
    return m ? [{ address: m[1].replace(/^\[|\]$/g, ''), port: Number(m[2]), pid: Number(m[3]), process: null }] : []
  })
}

// O mesmo serviço em IPv4 e IPv6 aparece duas vezes: uma linha por porta e processo.
const unique = (ports: Port[]) => [...new Map(ports.map(p => [`${p.port}|${p.pid}|${p.address}`, p])).values()].sort((a, b) => a.port - b.port)

// O ss mostra o nome da thread (o Node aparece como "MainThread"). A linha de comando diz o que é,
// mas pode trazer senha em argumento: fica só o executável e o primeiro argumento que não é opção.
export function describeCmdline(raw: string): string | null {
  let args = raw.split('\0').filter(Boolean)
  // Electron e afins reescrevem o cmdline como um texto só, separado por espaço.
  if (args.length === 1 && args[0].includes(' ')) args = args[0].split(' ').filter(Boolean)
  if (!args.length) return null
  const first = args.slice(1).find(a => !a.startsWith('-'))
  return [basename(args[0]).slice(0, 40), first && first.length <= 60 && !/[=@]/.test(first) ? first : null].filter(Boolean).join(' ')
}

function linuxCommand(pid: number): string | null {
  try {
    return describeCmdline(readFileSync(`/proc/${pid}/cmdline`, 'utf-8'))
  } catch {
    return null // processo de outro usuário ou que já terminou
  }
}

export async function listPorts(os: Os = PLATFORM.os): Promise<Port[]> {
  if (os === 'win32') return unique(parseNetstat(await run('netstat', ['-ano', '-p', 'tcp'], 15_000)))
  if (os === 'darwin') return unique(parseLsof(await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], 15_000).catch(() => '')))
  return unique(parseSs(await run('ss', ['-ltnpH'], 15_000)).map(p => (p.pid ? { ...p, process: linuxCommand(p.pid) ?? p.process } : p)))
}

export type Container = { id: string; name: string; image: string; state: string; status: string; ports: string; project: string | null }

type DockerPs = { ID: string; Names: string; Image: string; State: string; Status: string; Ports: string; Labels: string }

export function parseDockerPs(out: string): Container[] {
  return out.split('\n').filter(Boolean).map(l => {
    const c = JSON.parse(l) as DockerPs
    const project = c.Labels?.split(',').find(x => x.startsWith('com.docker.compose.project='))?.split('=')[1] ?? null
    return { id: c.ID, name: c.Names, image: c.Image, state: c.State, status: c.Status, ports: c.Ports, project }
  })
}

export type ComposeProject = { name: string; status: string; configFiles: string }

export async function dockerAvailable() {
  if (!(await which('docker'))) return false
  return Boolean(await run('docker', ['info', '--format', '{{.ServerVersion}}'], 10_000).catch(() => ''))
}

export const listContainers = async () => parseDockerPs(await run('docker', ['ps', '-a', '--no-trunc=false', '--format', '{{json .}}'], 20_000))

export async function listCompose(): Promise<ComposeProject[]> {
  const raw = await run('docker', ['compose', 'ls', '-a', '--format', 'json'], 20_000).catch(() => '[]')
  return (JSON.parse(raw || '[]') as { Name: string; Status: string; ConfigFiles: string }[]).map(p => ({ name: p.Name, status: p.Status, configFiles: p.ConfigFiles }))
}

export const ACTIONS = ['start', 'stop', 'restart'] as const
export type Action = (typeof ACTIONS)[number]

export function checkAction(a: unknown): Action {
  if (!ACTIONS.includes(a as Action)) throw new Error('ação inválida: use start, stop ou restart')
  return a as Action
}

// O id vem da tela, mas só vale se estiver na listagem atual: nada de nome arbitrário no docker.
export async function containerAction(id: string, action: Action) {
  const found = (await listContainers()).find(c => c.id === id)
  if (!found) throw new Error('container não encontrado na listagem atual; atualize a tela')
  await run('docker', [action, found.id], 120_000)
  return found
}

// Projeto compose: os arquivos de configuração saem do "compose ls", não do pedido.
export async function composeAction(name: string, action: Action) {
  const found = (await listCompose()).find(p => p.name === name)
  if (!found) throw new Error('projeto compose não encontrado na listagem atual; atualize a tela')
  const files = found.configFiles.split(',').filter(Boolean).flatMap(f => ['-f', f])
  const verb = action === 'start' ? ['up', '-d'] : [action]
  await run('docker', ['compose', '-p', found.name, ...files, ...verb], 300_000)
  return found
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const ss = [
    'LISTEN 0      4096       127.0.0.1:39855 0.0.0.0:* users:(("language_server",pid=459956,fd=22))',
    'LISTEN 0      4096   127.0.0.53%lo:53    0.0.0.0:*',
    'LISTEN 0      511            [::]:8080    [::]:*    users:(("java",pid=77,fd=9))',
  ].join('\n')
  assert.deepEqual(parseSs(ss), [
    { address: '127.0.0.1', port: 39855, pid: 459956, process: 'language_server' },
    { address: '127.0.0.53', port: 53, pid: null, process: null },
    { address: '::', port: 8080, pid: 77, process: 'java' },
  ])
  const lsof = 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 1234 eu 23u IPv4 0xabc 0t0 TCP 127.0.0.1:3000 (LISTEN)\nnode 1234 eu 24u IPv6 0xdef 0t0 TCP [::1]:3000 (LISTEN)'
  assert.deepEqual(parseLsof(lsof).map(p => [p.address, p.port, p.pid, p.process]), [['127.0.0.1', 3000, 1234, 'node'], ['::1', 3000, 1234, 'node']])
  const netstat = '\nConexões ativas\n\n  Proto  Endereço local  Endereço externo  Estado  PID\n  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1052\n  TCP    127.0.0.1:5432         0.0.0.0:0              ESTABLISHED     900\n'
  assert.deepEqual(parseNetstat(netstat), [{ address: '0.0.0.0', port: 135, pid: 1052, process: null }])

  const ps = '{"ID":"b56778ea9d2b","Names":"ollama","Image":"ollama/ollama","State":"running","Status":"Up 2 hours","Ports":"0.0.0.0:11434->11434/tcp","Labels":"com.docker.compose.project=ia,x=y"}'
  assert.deepEqual(parseDockerPs(ps)[0], { id: 'b56778ea9d2b', name: 'ollama', image: 'ollama/ollama', state: 'running', status: 'Up 2 hours', ports: '0.0.0.0:11434->11434/tcp', project: 'ia' })
  assert.equal(describeCmdline('/home/u/.nvm/versions/node/v24/bin/node\0--watch\0server/index.ts\0'), 'node server/index.ts')
  assert.equal(describeCmdline('/usr/bin/java\0-jar\0--spring.datasource.password=segredo\0'), 'java', 'argumento com = não aparece')
  assert.equal(describeCmdline('psql\0postgres://u:senha@h/db\0'), 'psql', 'URL com credencial não aparece')
  assert.equal(describeCmdline('/usr/share/code/code --standard-schemes=vscode-webview --enable-sandbox'), 'code', 'cmdline num texto só, separado por espaço')
  assert.equal(describeCmdline(''), null)
  assert.equal(checkAction('stop'), 'stop')
  assert.throws(() => checkAction('rm'), /ação inválida/)
  assert.throws(() => checkAction('--rm'), /ação inválida/)

  const live = await listPorts()
  assert.ok(live.length > 0, 'esta máquina tem alguma porta em escuta')
  console.log(`local services selfcheck: ok (${live.length} portas aqui)`)
}
