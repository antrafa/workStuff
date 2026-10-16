import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Sem shell: argumentos vão direto para o binário, nada é interpretado.
export async function run(bin: string, args: string[], timeoutMs = 30_000) {
  const { stdout } = await execFileAsync(bin, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 })
  return stdout
}

// Only the first maxBytes of stdout, then the process is stopped: for output that is shown cut anyway
// (a diff), so a huge one neither fills memory nor fails with "maxBuffer length exceeded".
// `okExit` lists the exit codes that are an answer, not a failure (git grep exits 1 when nothing matches).
export function runHead(bin: string, args: string[], maxBytes: number, timeoutMs = 30_000, okExit = [0]): Promise<{ stdout: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs })
    const chunks: Buffer[] = []
    let size = 0
    let truncated = false
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      if (truncated) return
      chunks.push(chunk)
      size += chunk.length
      if (size > maxBytes) {
        truncated = true
        child.kill()
      }
    })
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf-8')))
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (!truncated && !okExit.includes(code ?? -1)) {
        reject(new Error(`${bin} ${args.join(' ')} failed (${signal ?? `exit ${code}`}): ${stderr.trim()}`))
        return
      }
      resolve({ stdout: Buffer.concat(chunks).subarray(0, maxBytes).toString('utf-8'), truncated })
    })
  })
}

// Para --help: alguns CLIs (os em Go, como o agy) imprimem a ajuda no stderr.
export async function runHelp(bin: string) {
  try {
    const { stdout, stderr } = await execFileAsync(bin, ['--help'], { timeout: 15_000 })
    return stdout + stderr
  } catch (e) {
    const { stdout = '', stderr = '' } = e as { stdout?: string; stderr?: string }
    if (stdout || stderr) return stdout + stderr
    throw e
  }
}

// Windows não tem which: o equivalente é o where, que lista todos os achados (vale o primeiro).
export async function which(bin: string): Promise<string | null> {
  try {
    const found = await run(process.platform === 'win32' ? 'where' : 'which', [bin], 5_000)
    return found.split(/\r?\n/)[0].trim() || null
  } catch {
    return null
  }
}
