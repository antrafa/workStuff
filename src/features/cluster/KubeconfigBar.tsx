import { AlertTriangle, ExternalLink, FileUp, Plug, Repeat, Trash2, Unplug } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Async, ConfirmModal, Empty, Modal, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import {
  connect, deleteKubeconfig, disconnect, fetchKubeconfigs, refreshSession, setEnvironment, uploadKubeconfig,
  type Environment, type Kubeconfig, type Session,
} from './api'

export const ENV_BADGE: Record<Environment, string> = {
  DES: 'badge-info',
  ITG: 'badge-crit',
  HML: 'badge-warn',
  PRO: 'badge-ok',
}

export function EnvBadge({ env }: { env: Environment | null }) {
  if (!env) return <span className="badge" title="Sem classificação vale como PRO: somente leitura">sem ambiente</span>
  return <span className={`badge ${ENV_BADGE[env]}`}>{env}</span>
}

export function KubeconfigBar({ session }: { session: Session | null }) {
  const [picking, setPicking] = useState(false)
  const toast = useToast()

  const run = (p: Promise<unknown>, ok?: string) =>
    p.then(() => (ok && toast(ok), refreshSession())).catch(e => toast(`Não deu: ${(e as Error).message}`))

  if (!session) {
    return (
      <div className="card">
        <Empty
          icon={Plug}
          title="Nenhum cluster conectado"
          action={<button className="btn btn-primary" onClick={() => setPicking(true)}><Plug size={14} /> Escolher kubeconfig</button>}
        >
          Escolha um dos kubeconfigs de ~/.kube (ou adicione um) para ver pods, nodes e problemas. O painel só lê o cluster; reiniciar exige confirmação e ambiente DES, ITG ou HML.
        </Empty>
        {picking && createPortal(<KubeconfigPicker current={null} onClose={() => setPicking(false)} />, document.body)}
      </div>
    )
  }

  const k = session.kubeconfig
  return (
    <div className="stack" style={{ ['--gap' as string]: '8px' }}>
      <div className="card kube-bar">
        <span className="dot dot-ok" title="Conectado" />
        <div className="stack" style={{ ['--gap' as string]: '2px' }}>
          <span className="eyebrow">Kubeconfig ativo</span>
          <div className="row">
            <b className="mono">{k.filename}</b>
            <EnvBadge env={k.environment} />
            {k.environmentSource && <span className="muted" style={{ fontSize: 12 }} title="De onde veio a classificação">{k.environmentSource === 'manual' ? 'classificado por você' : 'pelo nome'}</span>}
          </div>
        </div>
        {k.contexts.length > 1 && (
          <label className="field" style={{ marginLeft: 16 }}>
            <span>Contexto</span>
            <select className="select" value={session.context} onChange={e => run(connect(k.id, e.target.value))}>
              {k.contexts.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        )}
        <div className="spacer" />
        {k.rancherUrl && (
          <a className="btn" href={k.rancherUrl} target="_blank" rel="noreferrer" title={k.rancherUrl}>
            <ExternalLink size={14} /> Abrir no Rancher
          </a>
        )}
        <button className="btn" onClick={() => setPicking(true)} title="Lista os kubeconfigs de ~/.kube e permite adicionar um novo">
          <Repeat size={14} /> Trocar kubeconfig
        </button>
        <button className="btn btn-ghost" onClick={() => run(disconnect(), 'Desconectado')} title="Esquece o cluster ativo; nada muda no cluster">
          <Unplug size={14} /> Desconectar
        </button>
      </div>
      {k.execAuth && (
        <div className="callout callout-warn">
          <AlertTriangle size={16} />
          Este kubeconfig autentica por um comando externo (exec). Se o comando pedir login interativo, as leituras falham até você autenticar no terminal.
        </div>
      )}
      {picking && createPortal(<KubeconfigPicker current={k.id} onClose={() => setPicking(false)} />, document.body)}
    </div>
  )
}

const GROUPS: (Environment | null)[] = ['DES', 'ITG', 'HML', 'PRO', null]
const ENVS: Environment[] = ['DES', 'ITG', 'HML', 'PRO']

// Portal: a animação de entrada da página cria uma camada por bloco; dentro dela o modal ficaria atrás dos blocos seguintes.
function KubeconfigPicker({ current, onClose }: { current: string | null; onClose: () => void }) {
  const state = useAsync(fetchKubeconfigs)
  const [deleting, setDeleting] = useState<Kubeconfig | null>(null)
  const [uploading, setUploading] = useState(false)
  const toast = useToast()
  const fail = (e: unknown) => toast(`Não deu: ${(e as Error).message}`)

  const pick = (k: Kubeconfig) =>
    connect(k.id)
      .then(() => refreshSession())
      .then(() => (toast(`Conectado em ${k.filename}`), onClose()))
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
      .then(r => (toast(`Salvo em ~/.kube/${r.id}`), state.reload()))
      .catch(fail)
      .finally(() => setUploading(false))
  }

  return (
    <Modal title="Kubeconfigs em ~/.kube" onClose={onClose} width={680}>
      <div className="stack">
        <Async
          state={state}
          isEmpty={d => d.items.length === 0}
          empty={<Empty icon={Plug} title="Nenhum kubeconfig em ~/.kube">Adicione um arquivo abaixo para conectar em um cluster.</Empty>}
        >
          {({ items, invalid }) => (
            <>
              {GROUPS.map(env => {
                const group = items.filter(k => k.environment === env)
                if (group.length === 0) return null
                return (
                  <div key={env ?? 'none'} className="stack" style={{ ['--gap' as string]: '6px' }}>
                    <div className="row">
                      <EnvBadge env={env} />
                      <span className="muted" style={{ fontSize: 12 }}>{group.length} kubeconfig{group.length > 1 && 's'}</span>
                    </div>
                    {group.map(k => (
                      <div key={k.id} className="card interactive kube-item" onClick={() => pick(k)} title={`Conectar em ${k.filename}`}>
                        <b className="mono">{k.filename}</b>
                        <span className="muted" style={{ fontSize: 12 }}>{k.currentContext}{k.contexts.length > 1 && ` +${k.contexts.length - 1}`}</span>
                        <div className="spacer" />
                        {k.id === current && <span className="badge badge-signal">conectado</span>}
                        <select
                          className="select"
                          value={k.environmentSource === 'manual' ? k.environment ?? '' : ''}
                          onClick={e => e.stopPropagation()}
                          onChange={e => classify(k, e.target.value)}
                          title={k.environmentSource === 'nome' ? `Pelo nome: ${k.environment}. Escolha para classificar à mão.` : 'Classificação do ambiente (define se reiniciar é permitido)'}
                        >
                          <option value="">{k.environmentSource === 'nome' ? `pelo nome (${k.environment})` : 'sem ambiente'}</option>
                          {ENVS.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                        {k.id !== 'config' && (
                          <button className="btn btn-ghost btn-sm btn-icon" title={`Apagar ${k.filename} de ~/.kube`} onClick={e => (e.stopPropagation(), setDeleting(k))}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
              {invalid.length > 0 && <small className="muted">Ignorados por não serem kubeconfig válido: {invalid.join(', ')}</small>}
            </>
          )}
        </Async>
        <label className="dropzone" title="O arquivo é validado pelo kubectl antes de ser salvo; nunca sobrescreve um existente">
          <FileUp size={20} />
          <span>{uploading ? 'Validando e salvando…' : <><b>Adicionar kubeconfig</b>: clique para escolher o arquivo (salvo em ~/.kube)</>}</span>
          <input type="file" hidden accept=".yaml,.yml,.kubeconfig,*" onChange={e => (upload(e.target.files?.[0]), (e.target.value = ''))} />
        </label>
      </div>
      {deleting && (
        <ConfirmModal
          title={`Apagar ${deleting.filename}?`}
          confirmLabel="Apagar arquivo"
          icon={Trash2}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleteKubeconfig(deleting.id).then(() => (toast(`${deleting.filename} apagado`), state.reload(), refreshSession())).catch(fail)}
        >
          O arquivo <code className="inline">~/.kube/{deleting.filename}</code> é apagado do disco. Não dá para desfazer pelo painel: para voltar,
          adicione o arquivo de novo. O cluster não é afetado.
        </ConfirmModal>
      )}
    </Modal>
  )
}
