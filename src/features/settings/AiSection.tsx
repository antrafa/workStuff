import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Segmented } from '@/ui'
import { ModelPicker } from './ModelPicker'
import type { Model, Provider, ProviderId, Settings } from './api'

const EFFORT_LABEL: Record<string, string> = {
  low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo', ultra: 'Ultra',
}
const DEFAULT_EFFORTS = ['low', 'medium', 'high']

// Níveis de esforço vêm do modelo quando o CLI informa (Codex); senão, os três genéricos.
const effortsOf = (model?: Model) => model?.efforts ?? DEFAULT_EFFORTS
const defaultModel = (p: Provider) => (p.models.find(m => m.recommended) ?? p.models[0])?.id ?? ''

type Props = { providers: Provider[]; settings: Settings; onChange: (p: Partial<Settings>) => void }

export function AiSection({ providers: loaded, settings, onChange }: Props) {
  const [refreshed, setRefreshed] = useState<Partial<Record<ProviderId, Provider>>>({})
  const providers = loaded.map(p => refreshed[p.id] ?? p)
  const selected = providers.find(p => p.id === settings.provider)
  const model = selected?.models.find(m => m.id === settings.model)
  const efforts = effortsOf(model)

  const pickModel = (id: string) => {
    const next = selected?.models.find(m => m.id === id)
    const options = effortsOf(next)
    onChange({ model: id, effort: options.includes(settings.effort) ? settings.effort : next?.defaultEffort ?? 'medium' })
  }

  return (
    <section className="card card-pad stack" style={{ ['--gap' as string]: '18px' }}>
      <div>
        <div className="card-title">Provedor de IA</div>
        <small className="muted">O painel roda o CLI escolhido direto na máquina, para o Cluster Doctor, a Análise e a revisão de itens do Catálogo.</small>
      </div>
      {providers.length === 0 && (
        <div className="callout callout-warn"><AlertTriangle size={16} />Nenhum CLI de IA detectado no PATH. Instale claude, agy ou codex para usar as telas de IA.</div>
      )}
      <div className="grid" style={{ ['--min' as string]: '200px' }}>
        {providers.map(p => (
          <button
            key={p.id}
            className="provider"
            aria-pressed={p.id === settings.provider}
            disabled={!p.installed}
            onClick={() => onChange({ provider: p.id, model: defaultModel(p), effort: p.models.find(m => m.recommended)?.defaultEffort ?? 'medium' })}
            title={p.installed ? p.path ?? '' : `${p.bin} não encontrado no PATH`}
          >
            <b>{p.name}</b>
            <code className="inline">{p.bin}</code>
            <span className="row" style={{ fontSize: 12, ['--gap' as string]: '6px' }}>
              <span className={`dot ${p.installed ? 'dot-ok' : ''}`} /> {p.installed ? 'disponível' : 'não detectado'}
            </span>
            <span className="muted" style={{ fontSize: 11.5 }}>{p.nativeGuard ? 'guarda nativa de comandos' : 'sem guarda nativa: proteção reduzida'}</span>
          </button>
        ))}
      </div>
      {selected && !selected.nativeGuard && (
        <div className="callout callout-warn"><AlertTriangle size={16} />{selected.name} não bloqueia comandos por conta própria: o Cluster Doctor depende só da guarda do painel.</div>
      )}
      {selected?.nativeGuard && (
        <div className="callout callout-info"><ShieldCheck size={16} />{selected.name} tem guarda nativa: comandos de escrita são negados pelo próprio CLI.</div>
      )}
      {selected && (
        <ModelPicker
          provider={selected}
          value={settings.model}
          onChange={pickModel}
          onRefreshed={p => setRefreshed(r => ({ ...r, [p.id]: p }))}
        />
      )}
      <div className="field">
        <span>Esforço</span>
        <Segmented<string>
          value={settings.effort}
          onChange={effort => onChange({ effort })}
          options={efforts.map(id => ({ id, label: EFFORT_LABEL[id] ?? id }))}
        />
        <small>Mais esforço, respostas mais cuidadosas e mais lentas.</small>
      </div>
    </section>
  )
}
