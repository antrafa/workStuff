import { RotateCw } from 'lucide-react'
import { Async, Page, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { DockerSection } from './DockerSection'
import { PortsCard } from './PortsCard'
import { fetchServices } from './api'

export default function LocalPage() {
  const state = useAsync(fetchServices)
  return (
    <Page
      eyebrow="Ferramentas"
      title="Serviços locais"
      hint="O que está rodando nesta máquina: portas em escuta com o processo dono, e containers, imagens, volumes e projetos compose do Docker."
      actions={<button className="btn" onClick={state.reload}><RotateCw size={14} className={state.loading ? 'spin' : ''} /> Atualizar</button>}
    >
      <Async state={state} skeleton={<SkeletonRows rows={6} height={36} />}>
        {d => (
          <>
            <PortsCard data={d} onChanged={state.reload} />
            {d.docker
              ? <DockerSection data={d} onChanged={state.reload} />
              : <div className="callout callout-info" style={{ fontSize: 12.5 }}>O Docker não está instalado ou o daemon não responde; a tela Máquina mostra o que falta.</div>}
          </>
        )}
      </Async>
    </Page>
  )
}
