import { RotateCw } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Async, Page, SkeletonRows } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { AppsTab } from './AppsTab'
import { DockerSection } from './DockerSection'
import { PortsCard } from './PortsCard'
import { fetchServices } from './api'
import { tx } from '@/lib/i18n'

type Tab = 'maquina' | 'aplicacoes'

export default function LocalPage() {
  // The tab lives in the URL so a reload or a link opens the same one.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('aba') === 'aplicacoes' ? 'aplicacoes' : 'maquina'
  return (
    <Page
      title={tx({ en: 'Local services', pt: 'Serviços locais' })}
      hint={tx({ en: "What is running on this machine: listening ports with their owner process, Docker's containers, images, volumes and compose projects, and the applications you register to start from here.", pt: 'O que está rodando nesta máquina: portas em escuta com o processo dono, containers, imagens, volumes e projetos compose do Docker, e as aplicações que você cadastra para subir daqui.' })}
    >
      <div className="tabs" role="tablist">
        {([['maquina', tx({ en: 'Ports and Docker', pt: 'Portas e Docker' })], ['aplicacoes', tx({ en: 'Applications', pt: 'Aplicações' })]] as [Tab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setSearchParams(id === 'maquina' ? {} : { aba: id })}>{label}</button>
        ))}
      </div>
      {tab === 'maquina' ? <MachineTab /> : <AppsTab />}
    </Page>
  )
}

function MachineTab() {
  const state = useAsync(fetchServices)
  return (
    <>
      <div className="row">
        <div className="spacer" />
        <button className="btn" onClick={state.reload}><RotateCw size={14} className={state.loading ? 'spin' : ''} /> {tx({ en: 'Refresh', pt: 'Atualizar' })}</button>
      </div>
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
    </>
  )
}
