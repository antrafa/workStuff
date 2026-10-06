import { RotateCcw } from 'lucide-react'
import { ConfirmModal, LockedActionModal, useToast } from '@/ui'
import { canWrite, restartPod, useClusterShared, type Environment, type Pod } from './api'
import { tx } from '@/lib/i18n'

type Props = { pod: Pod; env: Environment | null; onDone: () => void; onClose: () => void }

// In a locked environment the same button opens the explanation, with the command to take to the change.
export function RestartModal({ pod, env, onDone, onClose }: Props) {
  const toast = useToast()
  const { session } = useClusterShared()
  const workload = pod.workload!
  const command = `kubectl rollout restart ${workload.kind.toLowerCase()}/${workload.name} -n ${pod.namespace}${session ? ` --context ${session.context}` : ''}`

  if (!canWrite(env)) {
    return (
      <LockedActionModal
        title={tx({ en: `Restart is locked in ${env ?? 'an unclassified environment'}`, pt: `Reiniciar está travado em ${env ?? 'ambiente sem classificação'}` })}
        env={env}
        reason={env === 'PRO'
          ? tx({ en: `workStuff does not change production. To restart ${workload.name} in PRO, use the team's change process.`, pt: `O workStuff não altera produção. Para reiniciar o ${workload.name} em PRO, use o processo de mudança da equipe.` })
          : tx({ en: 'A kubeconfig with no environment counts as PRO. Classify it as DES, ITG or HML in the kubeconfig bar to unlock.', pt: 'Kubeconfig sem ambiente vale como PRO. Classifique-o como DES, ITG ou HML na barra do kubeconfig para liberar.' })}
        command={command}
        canDo={tx({ en: ['Pod logs, events and description', 'Team runbooks, on the Runbooks screen'], pt: ['Logs, eventos e descrição do pod', 'Runbooks da equipe, na tela Runbooks'] })}
        onClose={onClose}
      />
    )
  }

  const confirm = () =>
    restartPod(pod)
      .then(r => (toast(tx({ en: `${r.workload} restarted: the pods come back up one by one`, pt: `${r.workload} reiniciado: os pods sobem de novo um a um` })), onDone()))
      .catch(e => toast(tx({ en: `Not restarted: ${(e as Error).message}`, pt: `Não reiniciou: ${(e as Error).message}` })))

  return (
    <ConfirmModal
      title={tx({ en: `Restart ${workload.name}?`, pt: `Reiniciar ${workload.name}?` })}
      action={tx({ en: 'restart workload', pt: 'reiniciar workload' })}
      env={env}
      command={command}
      effects={tx({
        en: [`Every pod of the ${workload.kind} is recreated, one at a time`, 'Open connections on each pod drop when it shuts down'],
        pt: [`Todos os pods do ${workload.kind} são recriados, um de cada vez`, 'Conexões abertas em cada pod caem no encerramento'],
      })}
      losses={tx({
        en: ['Logs of the current pods: download them first from the logs panel', 'No persisted data: the image and config stay the same'],
        pt: ['Logs dos pods atuais: baixe antes pelo painel de logs', 'Nenhum dado persistido: a imagem e a config continuam as mesmas'],
      })}
      confirmLabel={tx({ en: `Restart in ${env}`, pt: `Reiniciar em ${env}` })}
      icon={RotateCcw}
      onClose={onClose}
      onConfirm={confirm}
    />
  )
}
