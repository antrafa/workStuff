import { ExternalLink, Network } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Empty, SkeletonRows } from '@/ui'
import { graphUrl } from './api'

// Mostra o grafo que o graphify já gerou no projeto (graphify-out/graph.html). Gerar o grafo pelo
// painel ficou de fora: exige o agente rodando comandos, e o executor aqui é só leitura.
export function GraphTab({ projectPath }: { projectPath: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const url = graphUrl(projectPath)

  useEffect(() => {
    fetch(url).then(r => setState(r.ok ? 'ok' : 'missing'), () => setState('missing'))
  }, [url])

  if (state === 'loading') return <SkeletonRows rows={1} height={320} />
  if (state === 'missing') {
    return (
      <Empty icon={Network} title="Este projeto não tem grafo">
        O grafo de conhecimento é gerado pelo graphify. Rode <code className="inline">/graphify</code> no Claude Code dentro do projeto (ou{' '}
        <code className="inline">graphify extract .</code>) e ele aparece aqui, a partir de <code className="inline">graphify-out/graph.html</code>.
      </Empty>
    )
  }
  return (
    <div className="stack">
      <div className="row">
        <span className="muted" style={{ fontSize: 12.5 }}>graphify-out/graph.html do projeto</span>
        <div className="spacer" />
        <a className="btn btn-sm" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Abrir em aba</a>
      </div>
      {/* sandbox sem allow-same-origin: o HTML vem do projeto e não alcança o painel */}
      <iframe className="graph-frame" src={url} sandbox="allow-scripts" title="Grafo de conhecimento do projeto" />
    </div>
  )
}
