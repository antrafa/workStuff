import { Container, HardDrive, Layers, Play, RotateCw, Square, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ConfirmModal, Empty, Search, Segmented, useToast } from '@/ui'
import { imageRef, remove, runAction, type Action, type Services } from './api'
import { tx } from '@/lib/i18n'

type Tab = 'containers' | 'images' | 'volumes' | 'compose'
type Pending =
  | { kind: 'action'; on: 'containers' | 'compose'; target: string; label: string; action: Action }
  | { kind: 'remove'; on: 'containers' | 'images' | 'volumes'; target: string; label: string }

const ACTION_LABEL: Record<Action, string> = tx({
  en: { start: 'Start', stop: 'Stop', restart: 'Restart' },
  pt: { start: 'Iniciar', stop: 'Parar', restart: 'Reiniciar' },
})

function commandOf(p: Pending) {
  if (p.kind === 'remove') return p.on === 'containers' ? `docker rm ${p.label}` : p.on === 'images' ? `docker image rm ${p.label}` : `docker volume rm ${p.label}`
  return p.on === 'containers' ? `docker ${p.action} ${p.label}` : `docker compose -p ${p.label} ${p.action === 'start' ? 'up -d' : p.action}`
}

// What each removal loses, said before the click.
const CONSEQUENCE: Record<'containers' | 'images' | 'volumes', string> = tx({
  en: {
    containers: "The stopped container is deleted with its write layer (files created inside the container). Volumes and the image stay.",
    images: 'The image leaves the disk. If you need it again, Docker pulls or rebuilds it. An image used by a container is refused by Docker itself.',
    volumes: "The volume's data is deleted for good (local database, uploads, cache). There is no undo. A volume mounted in a container is refused by Docker itself.",
  },
  pt: {
    containers: 'O container parado é apagado com a camada de escrita dele (arquivos criados dentro do container). Volumes e a imagem continuam.',
    images: 'A imagem sai do disco. Se precisar dela de novo, o Docker baixa ou reconstrói. Imagem usada por algum container é recusada pelo próprio Docker.',
    volumes: 'Os dados do volume são apagados para sempre (banco local, uploads, cache). Não há como desfazer. Volume montado em algum container é recusado pelo próprio Docker.',
  },
})

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
      toast(`${p.kind === 'remove' ? tx({ en: 'Deleted', pt: 'Apagado' }) : ACTION_LABEL[p.action]}: ${p.label}`)
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
      title={disabledReason ?? tx({ en: `Delete ${label}`, pt: `Apagar ${label}` })}
    >
      <Trash2 size={12} /> {tx({ en: 'Delete', pt: 'Apagar' })}
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
            { id: 'images', label: tx({ en: `Images (${data.images.length})`, pt: `Imagens (${data.images.length})` }) },
            { id: 'volumes', label: `Volumes (${data.volumes.length})` },
            { id: 'compose', label: `Compose (${data.compose.length})` },
          ]}
        />
        <div className="spacer" />
        <Search value={query} onChange={setQuery} placeholder={tx({ en: 'Filter by name', pt: 'Filtrar por nome' })} width={220} />
      </div>

      {tab === 'containers' && (data.containers.length === 0 ? <Empty icon={Container} title={tx({ en: 'No container', pt: 'Nenhum container' })} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Container</th><th>{tx({ en: 'State', pt: 'Estado' })}</th><th>{tx({ en: 'Ports', pt: 'Portas' })}</th><th /></tr></thead>
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
                          ? <><button className="btn btn-sm" disabled={busy === c.id} onClick={() => ask('restart')}><RotateCw size={12} /> {ACTION_LABEL.restart}</button><button className="btn btn-sm" disabled={busy === c.id} onClick={() => ask('stop')}><Square size={12} /> {ACTION_LABEL.stop}</button></>
                          : <button className="btn btn-sm" disabled={busy === c.id} onClick={() => ask('start')}><Play size={12} /> {ACTION_LABEL.start}</button>}
                        {trash('containers', c.id, c.name, running ? tx({ en: 'Stop the container before deleting it', pt: 'Pare o container antes de apagar' }) : undefined)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {tab === 'images' && (data.images.length === 0 ? <Empty icon={Layers} title={tx({ en: 'No image', pt: 'Nenhuma imagem' })} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{tx({ en: 'Image', pt: 'Imagem' })}</th><th>{tx({ en: 'Created', pt: 'Criada' })}</th><th className="num">{tx({ en: 'Size', pt: 'Tamanho' })}</th><th /></tr></thead>
            <tbody>
              {data.images.filter(i => match(`${i.repository} ${i.tag}`)).map(i => (
                <tr key={i.id}>
                  <td>
                    <div className="mono">{i.repository === '<none>' ? <span className="muted">{tx({ en: 'no name', pt: 'sem nome' })}</span> : i.repository}<span className="muted">{i.tag && i.tag !== '<none>' ? `:${i.tag}` : ''}</span></div>
                    <div className="muted mono" style={{ fontSize: 11.5 }}>{i.id.slice(0, 19)}</div>
                  </td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{i.created}{i.inUse && <span className="badge badge-signal" style={{ marginLeft: 6 }} title={tx({ en: 'Used by a container, running or stopped', pt: 'Usada por algum container, rodando ou parado' })}>{tx({ en: 'in use', pt: 'em uso' })}</span>}</td>
                  <td className="num mono">{i.size}</td>
                  <td className="num">{trash('images', i.id, imageRef(i), i.inUse ? tx({ en: 'Used by a container: delete the container first', pt: 'Usada por um container: apague o container antes' }) : undefined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {tab === 'volumes' && (data.volumes.length === 0 ? <Empty icon={HardDrive} title={tx({ en: 'No volume', pt: 'Nenhum volume' })} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Volume</th><th>Driver</th><th /></tr></thead>
            <tbody>
              {data.volumes.filter(v => match(v.name)).map(v => (
                <tr key={v.name}>
                  <td className="mono">{v.name}{v.inUse && <span className="badge badge-signal" style={{ marginLeft: 6 }} title={tx({ en: 'Mounted in a container, running or stopped', pt: 'Montado em algum container, rodando ou parado' })}>{tx({ en: 'in use', pt: 'em uso' })}</span>}</td>
                  <td className="muted">{v.driver}</td>
                  <td className="num">{trash('volumes', v.name, v.name, v.inUse ? tx({ en: 'Mounted in a container: delete the container first', pt: 'Montado em um container: apague o container antes' }) : undefined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {tab === 'compose' && (data.compose.length === 0 ? (
        <Empty icon={Container} title={tx({ en: 'No compose project', pt: 'Nenhum projeto compose' })}>{tx({ en: 'Projects show up here after the first docker compose up.', pt: 'Projetos aparecem aqui depois do primeiro docker compose up.' })}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{tx({ en: 'Project', pt: 'Projeto' })}</th><th>{tx({ en: 'State', pt: 'Estado' })}</th><th /></tr></thead>
            <tbody>
              {data.compose.filter(p => match(p.name)).map(p => {
                const ask = (action: Action) => setPending({ kind: 'action', on: 'compose', target: p.name, label: p.name, action })
                return (
                  <tr key={p.name}>
                    <td><div className="mono">{p.name}</div><div className="muted" style={{ fontSize: 11.5 }}>{p.configFiles}</div></td>
                    <td className="muted">{p.status}</td>
                    <td className="num">
                      <div className="row" style={{ ['--gap' as string]: '4px', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" disabled={busy === p.name} onClick={() => ask('start')}><Play size={12} /> {tx({ en: 'Up', pt: 'Subir' })}</button>
                        <button className="btn btn-sm" disabled={busy === p.name} onClick={() => ask('stop')}><Square size={12} /> {ACTION_LABEL.stop}</button>
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
          title={pending.kind === 'remove'
            ? tx({
              en: `Delete ${pending.on === 'containers' ? 'container' : pending.on === 'images' ? 'image' : 'volume'}?`,
              pt: `Apagar ${pending.on === 'containers' ? 'container' : pending.on === 'images' ? 'imagem' : 'volume'}?`,
            })
            : `${ACTION_LABEL[pending.action]} ${pending.on === 'containers' ? 'container' : tx({ en: 'compose project', pt: 'projeto compose' })}`}
          confirmLabel={pending.kind === 'remove' ? tx({ en: 'Delete', pt: 'Apagar' }) : ACTION_LABEL[pending.action]}
          icon={pending.kind === 'remove' ? Trash2 : pending.action === 'stop' ? Square : pending.action === 'start' ? Play : RotateCw}
          onConfirm={() => run(pending)}
          onClose={() => setPending(null)}
          action={pending.kind === 'remove' ? tx({ en: 'delete', pt: 'apagar' }) : ACTION_LABEL[pending.action].toLowerCase()}
          env="LOCAL"
          command={commandOf(pending)}
          effects={[pending.kind === 'remove'
            ? CONSEQUENCE[pending.on]
            : pending.action !== 'start'
              ? tx({ en: 'Whoever is using the service loses the connection until it comes back.', pt: 'Quem estiver usando o serviço perde a conexão até ele voltar.' })
              : tx({ en: 'The service starts with the current configuration.', pt: 'O serviço sobe com a configuração atual.' })]}
          typeToConfirm={pending.kind === 'remove' && pending.on === 'volumes' ? pending.label : undefined}
        />
      )}
    </section>
  )
}
