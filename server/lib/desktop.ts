import { spawn } from 'node:child_process'
import { run, which } from './run.ts'

// Abre arquivo ou pasta no editor. spawn de binário inexistente não lança: emite 'error' depois,
// e sem listener esse evento derruba o servidor.
export function openInEditor(path: string) {
  const editor = process.env.WORKSTUFF_EDITOR ?? 'code'
  // No Windows o "code" é um .cmd, que o spawn sem shell não acha: cai no Explorer, que abre a pasta.
  const fallback = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open'
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

// O título entra num script (AppleScript, PowerShell): só texto simples, sem aspas.
const safeTitle = (title: string) => title.replace(/["'`$\\]/g, '')

// No Windows o diálogo do .NET devolve o caminho no stdout; cancelar devolve vazio.
const WINDOWS_PICKER = (title: string) => [
  'Add-Type -AssemblyName System.Windows.Forms',
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
  `$d.Description = '${safeTitle(title)}'`,
  "if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }",
].join('; ')

// Seletor de pasta nativo. null = usuário cancelou.
export async function pickFolder(title: string): Promise<string | null> {
  const native = process.platform === 'darwin' || process.platform === 'win32'
  const attempts: [string, string[]][] = process.platform === 'darwin'
    ? [['osascript', ['-e', `POSIX path of (choose folder with prompt "${safeTitle(title)}")`]]]
    : process.platform === 'win32'
      ? [['powershell.exe', ['-NoProfile', '-STA', '-Command', WINDOWS_PICKER(title)]]]
      : [['zenity', ['--file-selection', '--directory', `--title=${title}`]], ['kdialog', ['--getexistingdirectory', '.', '--title', title]]]

  for (const [bin, args] of attempts) {
    if (!native && !(await which(bin))) continue
    try {
      return (await run(bin, args, 10 * 60_000)).trim().replace(/[\\/]$/, '') || null
    } catch (e) {
      // zenity/kdialog saem com código 1 quando o usuário cancela
      if ((e as { code?: number }).code === 1) return null
      throw e
    }
  }
  throw new Error('nenhum seletor de pasta disponível; instale zenity ou digite o caminho')
}
