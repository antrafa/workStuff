import { RotateCcw } from 'lucide-react'
import { ConfirmModal, useToast } from '@/ui'
import { EnvBadge } from './KubeconfigBar'
import { restartPod, type Environment, type Pod } from './api'

type Props = { pod: Pod; env: Environment | null; onDone: () => void; onClose: () => void }

export function RestartModal({ pod, env, onDone, onClose }: Props) {
  const toast = useToast()
  const workload = pod.workload!

  const confirm = () =>
    restartPod(pod)
      .then(r => (toast(`${r.workload} reiniciado: os pods sobem de novo um a um`), onDone()))
      .catch(e => toast(`Não reiniciou: ${(e as Error).message}`))

  return (
    <ConfirmModal
      title={`Reiniciar o ${workload.kind}?`}
      confirmLabel={`Reiniciar ${workload.name}`}
      icon={RotateCcw}
      onClose={onClose}
      onConfirm={confirm}
    >
      <div className="stack">
        <p style={{ margin: 0 }}>
          Todos os pods do <b>{workload.kind}</b> <code className="inline">{workload.name}</code> são recriados, um de cada vez
          (<code className="inline">kubectl rollout restart</code>). Durante o rollout o serviço pode responder mais devagar.
        </p>
        <dl className="kv">
          <dt>Namespace</dt>
          <dd>{pod.namespace}</dd>
          <dt>Ambiente</dt>
          <dd><EnvBadge env={env} /></dd>
          <dt>Volta atrás?</dt>
          <dd style={{ fontFamily: 'inherit' }}>Não há o que desfazer: os pods sobem com a mesma imagem e config.</dd>
        </dl>
      </div>
    </ConfirmModal>
  )
}
