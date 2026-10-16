import { spawn } from 'node:child_process'
import { readSettings } from '../settingsStore.ts'
import type { ProviderId } from '../aiProviders.ts'
import { buildArgs, type CliSpec, type RunOptions } from './args.ts'
import { createParser, type AiEvent } from './events.ts'
import { prepareReadJail } from './jail.ts'
import { say } from '../i18n.ts'

export type RunRequest = Omit<RunOptions, 'model' | 'effort'> & {
  signal?: AbortSignal
  onEvent: (e: AiEvent) => void
  timeoutMs?: number
  // Sem nenhuma saída por esse tempo, o processo é encerrado e a resposta parcial é preservada.
  stallMs?: number
  // The prompt carries text written by someone else (a remote MR): without the read jail it does not run
  thirdPartyText?: boolean
}

export type RunResult = { text: string; provider: ProviderId; model: string; durationMs: number; stopped: boolean; sessionId: string | null; usage: { inputTokens?: number; outputTokens?: number; costUsd?: number } | null }

// Roda o CLI escolhido em Configurações (provedor, modelo e esforço), sempre em modo leitura e, onde
// há bwrap, preso no jail de leitura (jail.ts): o agente só vê as pastas desta execução.
export async function runAi(req: RunRequest): Promise<RunResult> {
  const { provider, model, effort } = readSettings()
  const prepared = await prepareReadJail(provider, [req.cwd, ...(req.addDirs ?? [])].filter((d): d is string => Boolean(d)))
  if (!prepared && req.thirdPartyText) throw new Error(say({ en: 'reviewing text written by someone else needs bwrap (bubblewrap), which confines what the AI can read; install it to use this review', pt: 'revisar texto escrito por outra pessoa exige o bwrap (bubblewrap), que limita o que a IA pode ler; instale-o para usar esta revisão' }))
  try {
    return await spawnCli(provider, model, buildArgs(provider, { ...req, model, effort, jail: prepared?.jail }), req)
  } finally {
    prepared?.cleanup()
  }
}

// Exportado para modos com argumentos próprios (Cluster Doctor); o chamador responde pelas travas deles.
export function spawnCli(provider: ProviderId, model: string, { bin, args, stdin }: CliSpec, req: RunRequest & { env?: Record<string, string> }): Promise<RunResult> {
  const parser = createParser(provider)
  const t0 = Date.now()
  const timeoutMs = req.timeoutMs ?? 10 * 60_000
  const stallMs = req.stallMs ?? 3 * 60_000

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: req.cwd, env: req.env ? { ...process.env, ...req.env } : process.env, stdio: ['pipe', 'pipe', 'pipe'], shell: false })
    let buffer = ''
    let stderr = ''
    let lastOutput = Date.now()
    let stopped = false
    let failure: Error | null = null
    let result: AiEvent | null = null
    // A CLI that exits before reading its prompt raises EPIPE here; the exit itself is reported by 'close'.
    child.stdin.on('error', e => (stderr += `\nstdin: ${e.message}`))
    // Without a prompt on stdin it closes empty at once, which a CLI reads like /dev/null
    child.stdin.end(stdin ?? '')

    const kill = (reason: Error | null) => {
      failure ??= reason
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 2000).unref()
    }
    const watchdog = setInterval(() => {
      const quiet = Date.now() - lastOutput
      if (quiet > stallMs) kill(new Error(say({ en: `${bin} was silent for ${Math.round(quiet / 1000)}s and was stopped`, pt: `${bin} ficou ${Math.round(quiet / 1000)}s sem responder e foi encerrado` })))
      if (Date.now() - t0 > timeoutMs) kill(new Error(say({ en: `${bin} went past the ${Math.round(timeoutMs / 60_000)} min limit and was stopped`, pt: `${bin} passou do limite de ${Math.round(timeoutMs / 60_000)} min e foi encerrado` })))
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
      reject(new Error(notFound ? say({ en: `the "${bin}" CLI is not installed or not on PATH`, pt: `o CLI "${bin}" não está instalado ou não está no PATH` }) : say({ en: `failed to start ${bin}: ${err.message}`, pt: `falha ao iniciar ${bin}: ${err.message}` })))
    })

    child.on('close', code => {
      clearInterval(watchdog)
      req.signal?.removeEventListener('abort', onAbort)
      emit(parser.line(buffer))
      const text = (result?.type === 'result' && result.text) || parser.text()
      if (failure) return reject(failure)

      const isFailedResult = result?.type === 'result' && !result.ok
      const isErrorCode = !stopped && code !== 0

      if (isFailedResult || isErrorCode) {
        const errorDetail = (result?.type === 'result' && !result.ok ? result.text : '') || stderr.trim().split('\n').slice(-3).join(' ') || text || say({ en: `exited with code ${code}`, pt: `saiu com código ${code}` })
        const isAuth = /authenticate|oauth|expired|unauthorized|401|api_key/i.test(errorDetail)
        const loginCommand = provider === 'claude' ? 'claude login' : provider === 'codex' ? 'codex login' : 'agy'
        const hint = isAuth
          ? say({
            en: ` Authentication failed for provider "${provider}". Run "${loginCommand}" in the terminal to renew access, or switch providers in Settings.`,
            pt: ` Falha de autenticação do provedor "${provider}". Execute "${loginCommand}" no terminal para renovar o acesso ou troque de provedor em Configurações.`,
          })
          : ''
        return reject(new Error(say({ en: `${bin} failed: ${errorDetail}.${hint}`, pt: `${bin} falhou: ${errorDetail}.${hint}` })))
      }

      resolve({ text, provider, model, durationMs: Date.now() - t0, stopped, sessionId: parser.sessionId(), usage: parser.usage() })
    })
  })
}
