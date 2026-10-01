import { spawn } from 'node:child_process'
import { run, which } from './run.ts'

// Abre arquivo ou pasta no editor. spawn de binário inexistente não lança: emite 'error' depois,
// e sem listener esse evento derruba o servidor.
export function openInEditor(path: string) {
  const editor = process.env.WORKSTUFF_EDITOR ?? 'code'
  const fallback = process.platform === 'darwin' ? 'open' : 'xdg-open'
  const launch = (bin: string, onFail?: () => void) => {
    const proc = spawn(bin, [path], { detached: true, stdio: 'ignore' })
    proc.on('error', e => {
      console.error(`[desktop] não abriu ${path} com ${bin}: ${e.message}`)
      onFail?.()
    })
    proc.unref()
  }
  launch(editor, () => launch(fallback))
}

// Seletor de pasta nativo. null = usuário cancelou.
export async function pickFolder(title: string): Promise<string | null> {
  const attempts: [string, string[]][] = process.platform === 'darwin'
    ? [['osascript', ['-e', `POSIX path of (choose folder with prompt "${title.replace(/"/g, '')}")`]]]
    : [['zenity', ['--file-selection', '--directory', `--title=${title}`]], ['kdialog', ['--getexistingdirectory', '.', '--title', title]]]

  for (const [bin, args] of attempts) {
    if (process.platform !== 'darwin' && !(await which(bin))) continue
    try {
      return (await run(bin, args, 10 * 60_000)).trim().replace(/\/$/, '') || null
    } catch (e) {
      // zenity/kdialog saem com código 1 quando o usuário cancela
      if ((e as { code?: number }).code === 1) return null
      throw e
    }
  }
  throw new Error('nenhum seletor de pasta disponível; instale zenity ou digite o caminho')
}
