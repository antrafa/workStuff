import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { which } from '../run.ts'
import { readSettings } from '../settingsStore.ts'
import type { ProviderId } from '../aiProviders.ts'
import { buildArgs, type RunOptions } from './args.ts'
import { createParser, type AiEvent } from './events.ts'

export type RunRequest = Omit<RunOptions, 'model' | 'effort'> & {
  signal?: AbortSignal
  onEvent: (e: AiEvent) => void
  timeoutMs?: number
  // Sem nenhuma saída por esse tempo, o processo é encerrado e a resposta parcial é preservada.
  stallMs?: number
}

export type RunResult = { text: string; provider: ProviderId; model: string; durationMs: number; stopped: boolean; sessionId: string | null }

// Roda o CLI escolhido em Configurações (provedor, modelo e esforço), sempre em modo leitura.
export async function runAi(req: RunRequest): Promise<RunResult> {
  const { provider, model, effort } = readSettings()
  const tmpDir = provider === 'agy' && (await which('bwrap')) ? mkdtempSync(join(tmpdir(), 'workstuff-agy-')) : null
  const agySandbox = tmpDir ? { stateDir: join(homedir(), '.gemini'), tmpDir } : undefined
  try {
    return await spawnCli(provider, model, buildArgs(provider, { ...req, model, effort, agySandbox }), req)
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  }
}

// Exportado para modos com argumentos próprios (Cluster Doctor); o chamador responde pelas travas deles.
export function spawnCli(provider: ProviderId, model: string, { bin, args }: { bin: string; args: string[] }, req: RunRequest & { env?: Record<string, string> }): Promise<RunResult> {
  const parser = createParser(provider)
  const t0 = Date.now()
  const timeoutMs = req.timeoutMs ?? 10 * 60_000
  const stallMs = req.stallMs ?? 3 * 60_000

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: req.cwd, env: req.env ? { ...process.env, ...req.env } : process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let buffer = ''
    let stderr = ''
    let lastOutput = Date.now()
    let stopped = false
    let failure: Error | null = null
    let result: AiEvent | null = null

    const kill = (reason: Error | null) => {
      failure ??= reason
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 2000).unref()
    }
    const watchdog = setInterval(() => {
      const quiet = Date.now() - lastOutput
      if (quiet > stallMs) kill(new Error(`${bin} ficou ${Math.round(quiet / 1000)}s sem responder e foi encerrado`))
      if (Date.now() - t0 > timeoutMs) kill(new Error(`${bin} passou do limite de ${Math.round(timeoutMs / 60_000)} min e foi encerrado`))
    }, 2000)
    const onAbort = () => ((stopped = true), kill(null))
    req.signal?.addEventListener('abort', onAbort, { once: true })

    const emit = (events: AiEvent[]) => {
      for (const e of events) {
        if (e.type === 'result') result = e
        req.onEvent(e)
      }
    }

    child.stdout.on('data', chunk => {
      lastOutput = Date.now()
      buffer += chunk.toString('utf-8')
      let nl
      while ((nl = buffer.indexOf('\n')) >= 0) {
        emit(parser.line(buffer.slice(0, nl)))
        buffer = buffer.slice(nl + 1)
      }
    })
    child.stderr.on('data', chunk => {
      lastOutput = Date.now()
      stderr += chunk.toString('utf-8')
    })

    child.on('error', err => {
      clearInterval(watchdog)
      const notFound = (err as NodeJS.ErrnoException).code === 'ENOENT'
      reject(new Error(notFound ? `o CLI "${bin}" não está instalado ou não está no PATH` : `falha ao iniciar ${bin}: ${err.message}`))
    })

    child.on('close', code => {
      clearInterval(watchdog)
      req.signal?.removeEventListener('abort', onAbort)
      emit(parser.line(buffer))
      const text = (result?.type === 'result' && result.text) || parser.text()
      if (failure) return reject(failure)
      if (!stopped && code !== 0 && !text) {
        const detail = stderr.trim().split('\n').slice(-3).join(' ') || `saiu com código ${code}`
        return reject(new Error(`${bin} falhou: ${detail}`))
      }
      resolve({ text, provider, model, durationMs: Date.now() - t0, stopped, sessionId: parser.sessionId() })
    })
  })
}
