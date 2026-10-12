import { Save } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/ui'
import { saveApp, type App } from './api'
import { tx } from '@/lib/i18n'

// One argument per line: an argument with spaces stays whole, with no shell quoting to get wrong.
const lines = (text: string) => text.split('\n').map(l => l.trim()).filter(Boolean)

function parseEnv(text: string): Record<string, string> {
  return Object.fromEntries(lines(text).map(l => {
    const at = l.indexOf('=')
    if (at < 1) throw new Error(tx({ en: `invalid variable "${l}": use NAME=value`, pt: `variável inválida "${l}": use NOME=valor` }))
    return [l.slice(0, at).trim(), l.slice(at + 1)]
  }))
}

export function AppForm({ app, onSaved, onClose }: { app: App | null; onSaved: () => void; onClose: () => void }) {
  const [name, setName] = useState(app?.name ?? '')
  const [cwd, setCwd] = useState(app?.cwd ?? '')
  const [cmd, setCmd] = useState(app?.cmd ?? '')
  const [args, setArgs] = useState(app?.args.join('\n') ?? '')
  const [port, setPort] = useState(app?.port ? String(app.port) : '')
  const [url, setUrl] = useState(app?.url ?? '')
  const [env, setEnv] = useState(Object.entries(app?.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveApp({ name, cwd, cmd, args: lines(args), env: parseEnv(env), port: port ? Number(port) : null, url: url || null }, app?.id)
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={app ? tx({ en: `Edit ${app.name}`, pt: `Editar ${app.name}` }) : tx({ en: 'New application', pt: 'Nova aplicação' })}
      width={620}
      onClose={onClose}
      footer={
        <>
          {error && <span className="field"><small className="error">{error}</small></span>}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{tx({ en: 'Cancel', pt: 'Cancelar' })}</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}><Save size={14} /> {tx({ en: 'Save', pt: 'Salvar' })}</button>
        </>
      }
    >
      <div className="stack" style={{ ['--gap' as string]: '12px' }}>
        <label className="field"><span>{tx({ en: 'Name', pt: 'Nome' })}</span><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></label>
        <label className="field">
          <span>{tx({ en: 'Folder', pt: 'Pasta' })}</span>
          <input className="input mono" value={cwd} onChange={e => setCwd(e.target.value)} placeholder="~/workspace/meu-projeto" spellCheck={false} />
        </label>
        <label className="field">
          <span>{tx({ en: 'Command', pt: 'Comando' })}</span>
          <input className="input mono" value={cmd} onChange={e => setCmd(e.target.value)} placeholder="npm" spellCheck={false} />
          <small>{tx({ en: 'Runs without a shell: to chain commands (&&, |), point to a script such as ./run.sh.', pt: 'Roda sem shell: para encadear comandos (&&, |), aponte para um script como ./run.sh.' })}</small>
        </label>
        <label className="field">
          <span>{tx({ en: 'Arguments, one per line', pt: 'Argumentos, um por linha' })}</span>
          <textarea className="textarea mono" rows={3} value={args} onChange={e => setArgs(e.target.value)} placeholder={'run\ndev'} spellCheck={false} />
        </label>
        <div className="row" style={{ ['--gap' as string]: '12px', alignItems: 'flex-start' }}>
          <label className="field" style={{ width: 120 }}>
            <span>{tx({ en: 'Port', pt: 'Porta' })}</span>
            <input className="input mono" type="number" min={1} max={65535} value={port} onChange={e => setPort(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>URL</span>
            <input className="input mono" value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:4000" spellCheck={false} />
          </label>
        </div>
        <label className="field">
          <span>{tx({ en: 'Environment variables, NAME=value per line', pt: 'Variáveis de ambiente, NOME=valor por linha' })}</span>
          <textarea className="textarea mono" rows={2} value={env} onChange={e => setEnv(e.target.value)} placeholder="NODE_ENV=development" spellCheck={false} />
        </label>
      </div>
    </Modal>
  )
}
