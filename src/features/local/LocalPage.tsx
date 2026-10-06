import { RotateCw } from 'lucide-react'
import { Async, Page, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { DockerSection } from './DockerSection'
import { PortsCard } from './PortsCard'
import { fetchServices } from './api'
import { tx } from '@/lib/i18n'

export default function LocalPage() {
  const state = useAsync(fetchServices)
  return (
    <Page
      title={tx({ en: 'Local services', pt: 'Serviços locais' })}
      hint={tx({ en: "What is running on this machine: listening ports with their owner process, and Docker's containers, images, volumes and compose projects.", pt: 'O que está rodando nesta máquina: portas em escuta com o processo dono, e containers, imagens, volumes e projetos compose do Docker.' })}
      actions={<button className="btn" onClick={state.reload}><RotateCw size={14} className={state.loading ? 'spin' : ''} /> {tx({ en: 'Refresh', pt: 'Atualizar' })}</button>}
    >
      <Async state={state} skeleton={<SkeletonRows rows={6} height={36} />}>
        {d => (
          <>
            <PortsCard data={d} onChanged={state.reload} />
            {d.docker
              ? <DockerSection data={d} onChanged={state.reload} />
              : <div className="callout callout-info" style={{ fontSize: 12.5 }}>{tx({ en: 'Docker is not installed or the daemon does not respond; the Machine screen shows what is missing.', pt: 'O Docker não está instalado ou o daemon não responde; a tela Máquina mostra o que falta.' })}</div>}
          </>
        )}
      </Async>
    </Page>
  )
}
