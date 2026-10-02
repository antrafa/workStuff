import { Container, HardDrive, Layers, Play, RotateCw, Square, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ConfirmModal, Empty, Search, Segmented, useToast } from '@/ui'
import { imageRef, remove, runAction, type Action, type Services } from './api'

type Tab = 'containers' | 'images' | 'volumes' | 'compose'
type Pending =
  | { kind: 'action'; on: 'containers' | 'compose'; target: string; label: string; action: Action }
  | { kind: 'remove'; on: 'containers' | 'images' | 'volumes'; target: string; label: string }

const ACTION_LABEL: Record<Action, string> = { start: 'Iniciar', stop: 'Parar', restart: 'Reiniciar' }

function commandOf(p: Pending) {
  if (p.kind === 'remove') return p.on === 'containers' ? `docker rm ${p.label}` : p.on === 'images' ? `docker image rm ${p.label}` : `docker volume rm ${p.label}`
  return p.on === 'containers' ? `docker ${p.action} ${p.label}` : `docker compose -p ${p.label} ${p.action === 'start' ? 'up -d' : p.action}`
}

// O que se perde em cada remoção, dito antes do clique.
const CONSEQUENCE: Record<'containers' | 'images' | 'volumes', string> = {
  containers: 'O container parado é apagado com a camada de escrita dele (arquivos criados dentro do container). Volumes e a imagem continuam.',
  images: 'A imagem sai do disco. Se precisar dela de novo, o Docker baixa ou reconstrói. Imagem usada por algum container é recusada pelo próprio Docker.',
  volumes: 'Os dados do volume são apagados para sempre (banco local, uploads, cache). Não há como desfazer. Volume montado em algum container é recusado pelo próprio Docker.',
}

export function DockerSection({ data, onChanged }: { data: Services; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('containers')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const toast = useToast()
  const match = (text: string) => !query || text.toLowerCase().includes(query.toLowerCase())

  const run = async (p: Pending) => {
    setBusy(p.target)
    try {
      if (p.kind === 'remove') await remove(p.on, p.target)
      else await runAction(p.on, p.target, p.action)
      toast(`${p.kind === 'remove' ? 'Apagado' : ACTION_LABEL[p.action]}: ${p.label}`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
      onChanged()
    }
  }

  const trash = (on: 'containers' | 'images' | 'volumes', target: string, label: string, disabledReason?: string) => (
    <button
      className="btn btn-sm btn-ghost"
      disabled={Boolean(disabledReason) || busy === target}
      onClick={() => setPending({ kind: 'remove', on, target, label })}
      title={disabledReason ?? `Apagar ${label}`}
    >
      <Trash2 size={12} /> Apagar
    </button>
  )

  return (
    <section className="card">
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <div className="card-title">Docker</div>
        <Segmented<Tab>
          value={tab}
          onChange={t => (setTab(t), setQuery(''))}
          options={[
            { id: 'containers', label: `Containers (${data.containers.length})` },
            { id: 'images', label: `Imagens (${data.images.length})` },
            { id: 'volumes', label: `Volumes (${data.volumes.length})` },
            { id: 'compose', label: `Compose (${data.compose.length})` },
          ]}
        />
        <div className="spacer" />
        <Search value={query} onChange={setQuery} placeholder="Filtrar por nome" width={220} />
      </div>

      {tab === 'containers' && (data.containers.length === 0 ? <Empty icon={Container} title="Nenhum container" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Container</th><th>Estado</th><th>Portas</th><th /></tr></thead>
            <tbody>
              {data.containers.filter(c => match(`${c.name} ${c.image}`)).map(c => {
                const running = c.state === 'running'
                const ask = (action: Action) => setPending({ kind: 'action', on: 'containers', target: c.id, label: c.name, action })
                return (
                  <tr key={c.id}>
                    <td><div className="mono">{c.name}</div><div className="muted" style={{ fontSize: 11.5 }}>{c.image}{c.project ? ` · compose ${c.project}` : ''}</div></td>
                    <td><span className={`badge ${running ? 'badge-ok' : c.state === 'exited' ? '' : 'badge-warn'}`}>{c.state}</span> <span className="muted" style={{ fontSize: 12 }}>{c.status}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{c.ports || '—'}</td>
                    <td className="num">
                      <div className="row" style={{ ['--gap' as string]: '4px', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {running
                          ? <><button className="btn btn-sm" disabled={busy === c.id} onClick={() => ask('restart')}><RotateCw size={12} /> Reiniciar</button><button className="btn btn-sm" disabled={busy === c.id} onClick={() => ask('stop')}><Square size={12} /> Parar</button></>
                          : <button className="btn btn-sm" disabled={busy === c.id} onClick={() => ask('start')}><Play size={12} /> Iniciar</button>}
                        {trash('containers', c.id, c.name, running ? 'Pare o container antes de apagar' : undefined)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {tab === 'images' && (data.images.length === 0 ? <Empty icon={Layers} title="Nenhuma imagem" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Imagem</th><th>Criada</th><th className="num">Tamanho</th><th /></tr></thead>
            <tbody>
              {data.images.filter(i => match(`${i.repository} ${i.tag}`)).map(i => (
                <tr key={i.id}>
                  <td>
                    <div className="mono">{i.repository === '<none>' ? <span className="muted">sem nome</span> : i.repository}<span className="muted">{i.tag && i.tag !== '<none>' ? `:${i.tag}` : ''}</span></div>
                    <div className="muted mono" style={{ fontSize: 11.5 }}>{i.id.slice(0, 19)}</div>
                  </td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{i.created}{i.inUse && <span className="badge badge-signal" style={{ marginLeft: 6 }} title="Usada por algum container, rodando ou parado">em uso</span>}</td>
                  <td className="num mono">{i.size}</td>
                  <td className="num">{trash('images', i.id, imageRef(i), i.inUse ? 'Usada por um container: apague o container antes' : undefined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {tab === 'volumes' && (data.volumes.length === 0 ? <Empty icon={HardDrive} title="Nenhum volume" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Volume</th><th>Driver</th><th /></tr></thead>
            <tbody>
              {data.volumes.filter(v => match(v.name)).map(v => (
                <tr key={v.name}>
                  <td className="mono">{v.name}{v.inUse && <span className="badge badge-signal" style={{ marginLeft: 6 }} title="Montado em algum container, rodando ou parado">em uso</span>}</td>
                  <td className="muted">{v.driver}</td>
                  <td className="num">{trash('volumes', v.name, v.name, v.inUse ? 'Montado em um container: apague o container antes' : undefined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {tab === 'compose' && (data.compose.length === 0 ? (
        <Empty icon={Container} title="Nenhum projeto compose">Projetos aparecem aqui depois do primeiro docker compose up.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Projeto</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {data.compose.filter(p => match(p.name)).map(p => {
                const ask = (action: Action) => setPending({ kind: 'action', on: 'compose', target: p.name, label: p.name, action })
                return (
                  <tr key={p.name}>
                    <td><div className="mono">{p.name}</div><div className="muted" style={{ fontSize: 11.5 }}>{p.configFiles}</div></td>
                    <td className="muted">{p.status}</td>
                    <td className="num">
                      <div className="row" style={{ ['--gap' as string]: '4px', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" disabled={busy === p.name} onClick={() => ask('start')}><Play size={12} /> Subir</button>
                        <button className="btn btn-sm" disabled={busy === p.name} onClick={() => ask('stop')}><Square size={12} /> Parar</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {pending && (
        <ConfirmModal
          title={pending.kind === 'remove' ? `Apagar ${pending.on === 'containers' ? 'container' : pending.on === 'images' ? 'imagem' : 'volume'}?` : `${ACTION_LABEL[pending.action]} ${pending.on === 'containers' ? 'container' : 'projeto compose'}`}
          confirmLabel={pending.kind === 'remove' ? 'Apagar' : ACTION_LABEL[pending.action]}
          icon={pending.kind === 'remove' ? Trash2 : pending.action === 'stop' ? Square : pending.action === 'start' ? Play : RotateCw}
          onConfirm={() => run(pending)}
          onClose={() => setPending(null)}
        >
          <p>O painel vai rodar nesta máquina:</p>
          <pre className="code">{commandOf(pending)}</pre>
          <p className="muted" style={{ fontSize: 12.5 }}>
            {pending.kind === 'remove' ? CONSEQUENCE[pending.on] : pending.action !== 'start' ? 'Quem estiver usando o serviço perde a conexão até ele voltar.' : 'O serviço sobe com a configuração atual.'}
          </p>
        </ConfirmModal>
      )}
    </section>
  )
}
