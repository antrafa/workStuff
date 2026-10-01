import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Sem shell: argumentos vão direto para o binário, nada é interpretado.
export async function run(bin: string, args: string[], timeoutMs = 30_000) {
  const { stdout } = await execFileAsync(bin, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 })
  return stdout
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

export async function which(bin: string): Promise<string | null> {
  try {
    return (await run('which', [bin], 5_000)).trim() || null
  } catch {
    return null
  }
}
