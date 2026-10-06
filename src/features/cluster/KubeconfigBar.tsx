import { AlertTriangle, ExternalLink, FileUp, Plug, Repeat, Trash2, Unplug } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Async, ConfirmModal, Empty, EnvStamp, Modal, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import {
  connect, deleteKubeconfig, disconnect, fetchKubeconfigs, refreshSession, setEnvironment, uploadKubeconfig,
  type Environment, type Kubeconfig, type Session,
} from './api'
import { tx } from '@/lib/i18n'

export function KubeconfigBar({ session }: { session: Session | null }) {
  const [picking, setPicking] = useState(false)
  const toast = useToast()

  const run = (p: Promise<unknown>, ok?: string) =>
    p.then(() => (ok && toast(ok), refreshSession())).catch(e => toast(tx({ en: `Failed: ${(e as Error).message}`, pt: `Não deu: ${(e as Error).message}` })))

  if (!session) {
    return (
      <div className="card">
        <Empty
          icon={Plug}
          title={tx({ en: 'No cluster connected', pt: 'Nenhum cluster conectado' })}
          action={<button className="btn btn-primary" onClick={() => setPicking(true)}><Plug size={14} /> {tx({ en: 'Choose kubeconfig', pt: 'Escolher kubeconfig' })}</button>}
        >
          {tx({ en: 'Choose one of the kubeconfigs in ~/.kube (or add one) to see pods, nodes and problems. The panel only reads the cluster; restarting needs confirmation and a DES, ITG or HML environment.', pt: 'Escolha um dos kubeconfigs de ~/.kube (ou adicione um) para ver pods, nodes e problemas. O painel só lê o cluster; reiniciar exige confirmação e ambiente DES, ITG ou HML.' })}
        </Empty>
        {picking && createPortal(<KubeconfigPicker current={null} onClose={() => setPicking(false)} />, document.body)}
      </div>
    )
  }

  const k = session.kubeconfig
  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <div className="card kube-bar">
        <span className="dot dot-ok" title={tx({ en: 'Connected', pt: 'Conectado' })} />
        <div className="stack" style={{ ['--gap' as string]: '2px' }}>
          <span className="eyebrow">{tx({ en: 'Active kubeconfig', pt: 'Kubeconfig ativo' })}</span>
          <div className="row">
            <b className="mono">{k.filename}</b>
            <EnvStamp env={k.environment} />
            {k.environmentSource && <span className="muted" style={{ fontSize: 12 }} title={tx({ en: 'Where the classification came from', pt: 'De onde veio a classificação' })}>{k.environmentSource === 'manual' ? tx({ en: 'classified by you', pt: 'classificado por você' }) : tx({ en: 'by name', pt: 'pelo nome' })}</span>}
          </div>
        </div>
        {k.contexts.length > 1 && (
          <label className="field" style={{ marginLeft: 16 }}>
            <span>{tx({ en: 'Context', pt: 'Contexto' })}</span>
            <select className="select" value={session.context} onChange={e => run(connect(k.id, e.target.value))}>
              {k.contexts.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        )}
        <div className="spacer" />
        {k.rancherUrl && (
          <a className="btn" href={k.rancherUrl} target="_blank" rel="noreferrer" title={k.rancherUrl}>
            <ExternalLink size={14} /> {tx({ en: 'Open in Rancher', pt: 'Abrir no Rancher' })}
          </a>
        )}
        <button className="btn" onClick={() => setPicking(true)} title={tx({ en: 'Lists the kubeconfigs in ~/.kube and lets you add a new one', pt: 'Lista os kubeconfigs de ~/.kube e permite adicionar um novo' })}>
          <Repeat size={14} /> {tx({ en: 'Switch kubeconfig', pt: 'Trocar kubeconfig' })}
        </button>
        <button className="btn btn-ghost" onClick={() => run(disconnect(), tx({ en: 'Disconnected', pt: 'Desconectado' }))} title={tx({ en: 'Forgets the active cluster; nothing changes in the cluster', pt: 'Esquece o cluster ativo; nada muda no cluster' })}>
          <Unplug size={14} /> {tx({ en: 'Disconnect', pt: 'Desconectar' })}
        </button>
      </div>
      {k.execAuth && (
        <div className="callout callout-warn">
          <AlertTriangle size={16} />
          {tx({ en: 'This kubeconfig authenticates through an external command (exec). If the command asks for an interactive login, reads fail until you authenticate in the terminal.', pt: 'Este kubeconfig autentica por um comando externo (exec). Se o comando pedir login interativo, as leituras falham até você autenticar no terminal.' })}
        </div>
      )}
      {picking && createPortal(<KubeconfigPicker current={k.id} onClose={() => setPicking(false)} />, document.body)}
    </div>
  )
}

const GROUPS: (Environment | null)[] = ['DES', 'ITG', 'HML', 'PRO', null]
const ENVS: Environment[] = ['DES', 'ITG', 'HML', 'PRO']

// Portal: the page's entry animation creates a layer per block; inside it the modal would sit behind the next blocks.
function KubeconfigPicker({ current, onClose }: { current: string | null; onClose: () => void }) {
  const state = useAsync(fetchKubeconfigs)
  const [deleting, setDeleting] = useState<Kubeconfig | null>(null)
  const [uploading, setUploading] = useState(false)
  const toast = useToast()
  const fail = (e: unknown) => toast(tx({ en: `Failed: ${(e as Error).message}`, pt: `Não deu: ${(e as Error).message}` }))

  const pick = (k: Kubeconfig) =>
    connect(k.id)
      .then(() => refreshSession())
      .then(() => (toast(tx({ en: `Connected to ${k.filename}`, pt: `Conectado em ${k.filename}` })), onClose()))
      .catch(fail)

  const classify = (k: Kubeconfig, value: string) =>
    setEnvironment(k.id, (value || null) as Environment | null)
      .then(() => (state.reload(), refreshSession()))
      .catch(fail)

  const upload = (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    file
      .text()
      .then(content => uploadKubeconfig(file.name, content))
      .then(r => (toast(tx({ en: `Saved to ~/.kube/${r.id}`, pt: `Salvo em ~/.kube/${r.id}` })), state.reload()))
      .catch(fail)
      .finally(() => setUploading(false))
  }

  return (
    <Modal title={tx({ en: 'Kubeconfigs in ~/.kube', pt: 'Kubeconfigs em ~/.kube' })} onClose={onClose} width={680}>
      <div className="stack">
        <Async
          state={state}
          isEmpty={d => d.items.length === 0}
          empty={<Empty icon={Plug} title={tx({ en: 'No kubeconfig in ~/.kube', pt: 'Nenhum kubeconfig em ~/.kube' })}>{tx({ en: 'Add a file below to connect to a cluster.', pt: 'Adicione um arquivo abaixo para conectar em um cluster.' })}</Empty>}
        >
          {({ items, invalid }) => (
            <>
              {GROUPS.map(env => {
                const group = items.filter(k => k.environment === env)
                if (group.length === 0) return null
                return (
                  <div key={env ?? 'none'} className="stack" style={{ ['--gap' as string]: '6px' }}>
                    <div className="row">
                      <EnvStamp env={env} />
                      <span className="muted" style={{ fontSize: 12 }}>{group.length} kubeconfig{group.length > 1 && 's'}</span>
                    </div>
                    {group.map(k => (
                      <div key={k.id} className="card interactive kube-item" onClick={() => pick(k)} title={tx({ en: `Connect to ${k.filename}`, pt: `Conectar em ${k.filename}` })}>
                        <b className="mono">{k.filename}</b>
                        <span className="muted" style={{ fontSize: 12 }}>{k.currentContext}{k.contexts.length > 1 && ` +${k.contexts.length - 1}`}</span>
                        <div className="spacer" />
                        {k.id === current && <span className="badge badge-signal">{tx({ en: 'connected', pt: 'conectado' })}</span>}
                        <select
                          className="select"
                          value={k.environmentSource === 'manual' ? k.environment ?? '' : ''}
                          onClick={e => e.stopPropagation()}
                          onChange={e => classify(k, e.target.value)}
                          title={k.environmentSource === 'nome' ? tx({ en: `By name: ${k.environment}. Choose to classify by hand.`, pt: `Pelo nome: ${k.environment}. Escolha para classificar à mão.` }) : tx({ en: 'Environment classification (decides whether restart is allowed)', pt: 'Classificação do ambiente (define se reiniciar é permitido)' })}
                        >
                          <option value="">{k.environmentSource === 'nome' ? tx({ en: `by name (${k.environment})`, pt: `pelo nome (${k.environment})` }) : tx({ en: 'no environment', pt: 'sem ambiente' })}</option>
                          {ENVS.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                        {k.id !== 'config' && (
                          <button className="btn btn-ghost btn-sm btn-icon" title={tx({ en: `Delete ${k.filename} from ~/.kube`, pt: `Apagar ${k.filename} de ~/.kube` })} onClick={e => (e.stopPropagation(), setDeleting(k))}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
              {invalid.length > 0 && <small className="muted">{tx({ en: 'Skipped for not being a valid kubeconfig: ', pt: 'Ignorados por não serem kubeconfig válido: ' })}{invalid.join(', ')}</small>}
            </>
          )}
        </Async>
        <label className="dropzone" title={tx({ en: 'The file is validated by kubectl before it is saved; it never overwrites an existing one', pt: 'O arquivo é validado pelo kubectl antes de ser salvo; nunca sobrescreve um existente' })}>
          <FileUp size={20} />
          <span>{uploading ? tx({ en: 'Validating and saving…', pt: 'Validando e salvando…' }) : tx({ en: <><b>Add kubeconfig</b>: click to choose the file (saved to ~/.kube)</>, pt: <><b>Adicionar kubeconfig</b>: clique para escolher o arquivo (salvo em ~/.kube)</> })}</span>
          <input type="file" hidden accept=".yaml,.yml,.kubeconfig,*" onChange={e => (upload(e.target.files?.[0]), (e.target.value = ''))} />
        </label>
      </div>
      {deleting && (
        <ConfirmModal
          title={tx({ en: `Delete ${deleting.filename}?`, pt: `Apagar ${deleting.filename}?` })}
          confirmLabel={tx({ en: 'Delete file', pt: 'Apagar arquivo' })}
          icon={Trash2}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleteKubeconfig(deleting.id).then(() => (toast(tx({ en: `${deleting.filename} deleted`, pt: `${deleting.filename} apagado` })), state.reload(), refreshSession())).catch(fail)}
        >
          {tx({
            en: <>The file <code className="inline">~/.kube/{deleting.filename}</code> is deleted from disk. It cannot be undone from the panel: to get it back, add the file again. The cluster is not affected.</>,
            pt: <>O arquivo <code className="inline">~/.kube/{deleting.filename}</code> é apagado do disco. Não dá para desfazer pelo painel: para voltar, adicione o arquivo de novo. O cluster não é afetado.</>,
          })}
        </ConfirmModal>
      )}
    </Modal>
  )
}
