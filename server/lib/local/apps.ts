// Aplicações locais cadastradas: pasta + comando que o painel sobe, para e acompanha pelo log.
// Cada aplicação roda sem shell, como líder do próprio grupo de processos: parar encerra o grupo inteiro,
// então o filho que o `npm run dev` cria morre junto e o PID salvo nunca fica órfão.
// Autoteste: node server/lib/local/apps.ts --selfcheck

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readJson, writeJson } from '../jsonFile.ts'
import { dataFile, expandHome } from '../paths.ts'
import { PLATFORM } from '../platform.ts'
import { run } from '../run.ts'
import { say } from '../i18n.ts'

export type App = {
  id: string
  name: string
  cwd: string
  cmd: string
  args: string[]
  env: Record<string, string>
  port: number | null
  url: string | null
}
export type AppInput = Omit<App, 'id'>

const isRecordOfStrings = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every(x => typeof x === 'string')

// O corpo vem da tela: confere cada campo antes de virar comando que roda na máquina.
export function checkInput(body: unknown): AppInput {
  const b = (body ?? {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const name = text(b.name)
  const cwd = text(b.cwd)
  const cmd = text(b.cmd)
  if (!name) throw new Error(say({ en: 'name is required', pt: 'o nome é obrigatório' }))
  if (!cwd) throw new Error(say({ en: 'folder is required', pt: 'a pasta é obrigatória' }))
  if (!cmd) throw new Error(say({ en: 'command is required', pt: 'o comando é obrigatório' }))
  if (!Array.isArray(b.args) || !b.args.every(a => typeof a === 'string')) throw new Error(say({ en: 'arguments must be a list of texts', pt: 'os argumentos precisam ser uma lista de textos' }))
  const env = b.env ?? {}
  if (!isRecordOfStrings(env)) throw new Error(say({ en: 'environment variables must be NAME=value texts', pt: 'as variáveis de ambiente precisam ser textos NOME=valor' }))
  const port = b.port === null || b.port === undefined || b.port === '' ? null : Number(b.port)
  if (port !== null && !(Number.isInteger(port) && port > 0 && port < 65536)) throw new Error(say({ en: 'port must be a number from 1 to 65535', pt: 'a porta precisa ser um número de 1 a 65535' }))
  const url = text(b.url) || null
  if (url && !/^https?:\/\//.test(url)) throw new Error(say({ en: 'URL must start with http:// or https://', pt: 'a URL precisa começar com http:// ou https://' }))
  return { name, cwd, cmd, args: b.args as string[], env, port, url }
}

const slug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const LOG_TAIL_BYTES = 256 * 1024

export function createAppsStore(dir: string = dataFile('apps')) {
  const file = join(dir, 'apps.json')
  const runDir = (id: string) => join(dir, id)
  const pidFile = (id: string) => join(runDir(id), 'pid')
  const logFile = (id: string) => join(runDir(id), 'out.log')

  const list = () => readJson<App[]>(file, [])
  const save = (apps: App[]) => (mkdirSync(dir, { recursive: true }), writeJson(file, apps))

  function find(id: string) {
    const app = list().find(a => a.id === id)
    if (!app) throw new Error(say({ en: `application ${id} not found`, pt: `aplicação ${id} não encontrada` }))
    return app
  }

  // PID gravado no start que ainda está vivo; o arquivo de um processo morto é só lixo.
  function pidOf(id: string): number | null {
    try {
      const pid = Number(readFileSync(pidFile(id), 'utf-8').trim())
      return pid > 1 && alive(pid) ? pid : null
    } catch {
      return null
    }
  }

  function create(input: AppInput) {
    const apps = list()
    const base = slug(input.name)
    let id = base
    for (let i = 2; apps.some(a => a.id === id); i++) id = `${base}-${i}`
    const app = { ...input, id }
    save([...apps, app])
    return app
  }

  // Vale no próximo start: o processo que já roda continua com a configuração antiga.
  function update(id: string, input: AppInput) {
    const apps = list()
    if (!apps.some(a => a.id === id)) find(id)
    const app = { ...input, id }
    save(apps.map(a => (a.id === id ? app : a)))
    return app
  }

  function remove(id: string) {
    find(id)
    if (pidOf(id)) throw new Error(say({ en: 'the application is running; stop it before deleting', pt: 'a aplicação está rodando; pare antes de excluir' }))
    save(list().filter(a => a.id !== id))
    rmSync(runDir(id), { recursive: true, force: true })
  }

  async function start(id: string) {
    const app = find(id)
    if (pidOf(id)) throw new Error(say({ en: 'already running', pt: 'já está rodando' }))
    const cwd = expandHome(app.cwd)
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error(say({ en: `folder not found: ${app.cwd}`, pt: `pasta não encontrada: ${app.cwd}` }))
    mkdirSync(runDir(id), { recursive: true })
    // ponytail: o log recomeça a cada start (não cresce sem fim); guardar o anterior se fizer falta.
    const fd = openSync(logFile(id), 'w')
    try {
      // ponytail: no Windows, npm/npx são .cmd e o Node recusa .cmd sem shell; cadastre o node + script.
      const child = spawn(expandHome(app.cmd), app.args, {
        cwd,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', fd, fd],
        env: { ...process.env, ...app.env, FORCE_COLOR: '0' },
      })
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })
      writeFileSync(pidFile(id), String(child.pid))
      child.unref()
      console.log(`[apps] start ${id} (pid ${child.pid}): ${[app.cmd, ...app.args].join(' ')}`)
      return child.pid!
    } catch (e) {
      throw new Error(say({ en: `could not start ${app.cmd}: ${(e as Error).message}`, pt: `não foi possível iniciar ${app.cmd}: ${(e as Error).message}` }))
    } finally {
      closeSync(fd)
    }
  }

  // TERM no grupo inteiro (o PID negativo); force manda KILL. Windows: taskkill /T leva a árvore.
  async function stop(id: string, force = false) {
    find(id)
    const pid = pidOf(id)
    if (!pid) throw new Error(say({ en: 'not running', pt: 'não está rodando' }))
    if (PLATFORM.os === 'win32') await run('taskkill', ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])], 15_000)
    else {
      try {
        process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM')
      } catch {
        process.kill(pid, force ? 'SIGKILL' : 'SIGTERM') // não é líder de grupo (iniciado fora do painel)
      }
    }
    for (let i = 0; i < 20 && alive(pid); i++) await sleep(250)
    const stillAlive = alive(pid)
    if (!stillAlive) unlinkSync(pidFile(id))
    console.log(`[apps] stop ${id} (pid ${pid}${force ? ', force' : ''}) → ${stillAlive ? 'ainda vivo' : 'encerrado'}`)
    return { stillAlive }
  }

  async function restart(id: string) {
    if (pidOf(id) && (await stop(id)).stillAlive) throw new Error(say({ en: 'the process did not stop; use Stop with Force', pt: 'o processo não parou; use Parar com Forçar' }))
    return start(id)
  }

  // Lê o log a partir de um deslocamento. Sem deslocamento, devolve só o fim do arquivo.
  function readLog(id: string, from?: number) {
    let size: number
    try {
      size = statSync(logFile(id)).size
    } catch {
      return { text: '', offset: 0, reset: from !== undefined && from > 0 }
    }
    // Arquivo menor que o já lido: foi recriado por um novo start.
    const reset = from !== undefined && size < from
    const begin = from === undefined || reset ? Math.max(0, size - LOG_TAIL_BYTES) : from
    if (size === begin) return { text: '', offset: size, reset }
    const buf = Buffer.alloc(size - begin)
    const fd = openSync(logFile(id), 'r')
    try {
      readSync(fd, buf, 0, buf.length, begin)
    } finally {
      closeSync(fd)
    }
    // O corte no meio do arquivo pega meia linha: descarta até a primeira quebra.
    const text = buf.toString('utf-8')
    return { text: begin > 0 && from === undefined ? text.slice(text.indexOf('\n') + 1) : text, offset: size, reset }
  }

  return { list, find, pidOf, create, update, remove, start, stop, restart, readLog }
}

export const apps = createAppsStore()

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const dir = mkdtempSync(join(tmpdir(), 'ws-apps-'))
  const store = createAppsStore(dir)
  const work = join(dir, 'work')
  mkdirSync(work)

  assert.throws(() => checkInput({ name: '', cwd: '/x', cmd: 'node', args: [] }), /name is required/)
  assert.throws(() => checkInput({ name: 'a', cwd: '/x', cmd: 'node', args: 'x' }), /list of texts/)
  assert.throws(() => checkInput({ name: 'a', cwd: '/x', cmd: 'node', args: [], port: 70000 }), /port/)
  assert.throws(() => checkInput({ name: 'a', cwd: '/x', cmd: 'node', args: [], url: 'javascript:alert(1)' }), /URL/)
  assert.throws(() => checkInput({ name: 'a', cwd: '/x', cmd: 'node', args: [], env: { A: 1 } }), /environment/)
  assert.deepEqual(checkInput({ name: ' Minha API ', cwd: '~/x', cmd: 'node', args: ['s.js'], port: '4000' }), { name: 'Minha API', cwd: '~/x', cmd: 'node', args: ['s.js'], env: {}, port: 4000, url: null })

  // Filho que escreve no log, cria um neto e espera: parar precisa levar os dois.
  const script = "require('child_process').spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' }); console.log('pronto'); setInterval(()=>{},1000)"
  const app = store.create({ name: 'Minha Ação', cwd: work, cmd: process.execPath, args: ['-e', script], env: {}, port: null, url: null })
  assert.equal(app.id, 'minha-acao')
  assert.equal(store.create({ ...app, name: 'minha ação' }).id, 'minha-acao-2', 'id repetido ganha sufixo')

  const pid = await store.start(app.id)
  await assert.rejects(store.start(app.id), /already running/)
  assert.throws(() => store.remove(app.id), /stop it before deleting/)
  for (let i = 0; i < 40 && !store.readLog(app.id).text.includes('pronto'); i++) await sleep(100)
  const first = store.readLog(app.id)
  assert.match(first.text, /pronto/)
  assert.equal(store.readLog(app.id, first.offset).text, '', 'nada novo depois do deslocamento')

  const grandchild = PLATFORM.os === 'linux' ? Number(readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf-8').trim().split(' ')[0]) : 0
  if (grandchild) assert.ok(alive(grandchild), 'o neto está vivo antes do stop')
  assert.deepEqual(await store.stop(app.id), { stillAlive: false })
  if (grandchild) {
    for (let i = 0; i < 20 && alive(grandchild); i++) await sleep(100)
    assert.ok(!alive(grandchild), 'parar encerra o grupo inteiro, neto incluído')
  }
  await assert.rejects(store.stop(app.id), /not running/)

  assert.equal(store.readLog(app.id, 10_000_000).reset, true, 'log menor que o lido conta como recomeço')
  await assert.rejects(store.start('nao-existe'), /not found/)
  store.update(app.id, { ...app, cwd: join(dir, 'sumiu') })
  await assert.rejects(store.start(app.id), /folder not found/)
  store.update(app.id, { ...app, cmd: join(dir, 'sem-binario') })
  await assert.rejects(store.start(app.id), /could not start/)

  store.remove(app.id)
  assert.deepEqual(store.list().map(a => a.id), ['minha-acao-2'])
  assert.ok(!existsSync(join(dir, app.id)), 'excluir apaga o log e o pid')
  rmSync(dir, { recursive: true, force: true })
  console.log('apps selfcheck: ok')
}
