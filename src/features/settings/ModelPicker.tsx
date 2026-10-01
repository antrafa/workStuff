import { AlertTriangle, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { refreshModels, type Provider } from './api'

type Props = { provider: Provider; value: string; onChange: (model: string) => void; onRefreshed: (p: Provider) => void }

export function ModelPicker({ provider, value, onChange, onRefreshed }: Props) {
  const [refreshing, setRefreshing] = useState(false)
  const toast = useToast()
  const known = provider.models.some(m => m.id === value)
  const suggestion = provider.models.find(m => m.recommended) ?? provider.models[0]

  const refresh = async () => {
    setRefreshing(true)
    try {
      const fresh = await refreshModels(provider)
      onRefreshed(fresh)
      toast(`${fresh.models.length} modelos lidos de ${fresh.source.command}`)
    } catch (e) {
      toast(`Não consegui ler os modelos: ${(e as Error).message}`)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="field">
      <div className="row">
        <span className="spacer" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>Modelo</span>
        <small className="muted" title="O painel não guarda lista fixa: ela vem do próprio CLI instalado">
          {provider.source.kind === 'alias' ? 'apelidos do CLI, lidos de ' : 'lista lida de '}
          <code className="inline">{provider.source.command}</code> {provider.source.fetchedAt && <> · {relTime(provider.source.fetchedAt)}</>}
        </small>
        <button type="button" className="btn btn-sm" onClick={refresh} disabled={refreshing} title={`Roda ${provider.source.command} de novo`}>
          <RotateCw size={13} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Lendo…' : 'Atualizar lista'}
        </button>
      </div>

      {provider.source.kind === 'alias' && (
        <small>O apelido acompanha a versão mais nova sozinho: quando sair um Opus novo, <code className="inline">opus</code> já passa a usá-lo.</small>
      )}

      {provider.source.error && (
        <div className="callout callout-crit">
          <AlertTriangle size={16} />
          <div className="spacer">
            {provider.source.error}
            {provider.models.length > 0 && ' A lista abaixo é da última leitura que deu certo.'}
          </div>
        </div>
      )}

      {provider.installed && provider.models.length === 0 && !provider.source.error && (
        <div className="callout callout-warn"><AlertTriangle size={16} />O {provider.name} não devolveu nenhum modelo. Tente "Atualizar lista".</div>
      )}

      {!known && value && suggestion && (
        <div className="callout callout-warn">
          <AlertTriangle size={16} />
          <div className="spacer">
            O modelo salvo <code className="inline">{value}</code> não está na lista atual do {provider.name}. Ele pode estar desatualizado ou ter sido
            descontinuado.
          </div>
          <button type="button" className="btn btn-sm" onClick={() => onChange(suggestion.id)}>Usar {suggestion.label}</button>
        </div>
      )}

      <div className="models" role="radiogroup">
        {provider.models.map(m => (
          <label key={m.id} className="model" aria-checked={m.id === value}>
            <input type="radio" name="model" checked={m.id === value} onChange={() => onChange(m.id)} />
            <span className="spacer stack" style={{ ['--gap' as string]: '2px' }}>
              <span className="row" style={{ ['--gap' as string]: '6px' }}>
                <b style={{ fontSize: 13 }}>{m.label}</b>
                <code className="inline">{m.id}</code>
                {m.recommended && <span className="badge badge-signal">recomendado</span>}
                {m.alias && <span className="badge">sempre o mais novo</span>}
              </span>
              {m.description && <small className="muted">{m.description}</small>}
            </span>
          </label>
        ))}
      </div>

      <label className="row" style={{ ['--gap' as string]: '8px', fontSize: 12.5 }}>
        <span className="muted">Outro id de modelo:</span>
        <input
          className="input mono"
          style={{ width: 260 }}
          placeholder="ex.: claude-opus-5-5"
          value={known ? '' : value}
          onChange={e => onChange(e.target.value.trim())}
          title="Para um modelo que o CLI aceita mas ainda não aparece na lista"
        />
      </label>
    </div>
  )
}
