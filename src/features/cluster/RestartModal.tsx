import { RotateCcw } from 'lucide-react'
import { ConfirmModal, LockedActionModal, useToast } from '@/ui'
import { canWrite, restartPod, useClusterShared, type Environment, type Pod } from './api'

type Props = { pod: Pod; env: Environment | null; onDone: () => void; onClose: () => void }

// Em ambiente travado o mesmo botão abre a explicação, com o comando para levar à mudança.
export function RestartModal({ pod, env, onDone, onClose }: Props) {
  const toast = useToast()
  const { session } = useClusterShared()
  const workload = pod.workload!
  const command = `kubectl rollout restart ${workload.kind.toLowerCase()}/${workload.name} -n ${pod.namespace}${session ? ` --context ${session.context}` : ''}`

  if (!canWrite(env)) {
    return (
      <LockedActionModal
        title={`Reiniciar está travado em ${env ?? 'ambiente sem classificação'}`}
        env={env}
        reason={env === 'PRO'
          ? `O workStuff não altera produção. Para reiniciar o ${workload.name} em PRO, use o processo de mudança da equipe.`
          : 'Kubeconfig sem ambiente vale como PRO. Classifique-o como DES, ITG ou HML na barra do kubeconfig para liberar.'}
        command={command}
        canDo={['Logs, eventos e descrição do pod', 'Runbooks da equipe, na tela Runbooks']}
        onClose={onClose}
      />
    )
  }

  const confirm = () =>
    restartPod(pod)
      .then(r => (toast(`${r.workload} reiniciado: os pods sobem de novo um a um`), onDone()))
      .catch(e => toast(`Não reiniciou: ${(e as Error).message}`))

  return (
    <ConfirmModal
      title={`Reiniciar ${workload.name}?`}
      action="reiniciar workload"
      env={env}
      command={command}
      effects={[`Todos os pods do ${workload.kind} são recriados, um de cada vez`, 'Conexões abertas em cada pod caem no encerramento']}
      losses={['Logs dos pods atuais: baixe antes pelo painel de logs', 'Nenhum dado persistido: a imagem e a config continuam as mesmas']}
      confirmLabel={`Reiniciar em ${env}`}
      icon={RotateCcw}
      onClose={onClose}
      onConfirm={confirm}
    />
  )
}
