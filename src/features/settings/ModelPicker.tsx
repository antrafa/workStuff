import { AlertTriangle, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@/ui'
import { relTime } from '@/lib/format'
import { tx } from '@/lib/i18n'
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
      toast(tx({ en: `${fresh.models.length} models read from ${fresh.source.command}`, pt: `${fresh.models.length} modelos lidos de ${fresh.source.command}` }))
    } catch (e) {
      toast(tx({ en: `Could not read the models: ${(e as Error).message}`, pt: `Não consegui ler os modelos: ${(e as Error).message}` }))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="field">
      <div className="row">
        <span className="spacer" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>{tx({ en: 'Model', pt: 'Modelo' })}</span>
        <small className="muted" title={tx({ en: 'The panel keeps no fixed list: it comes from the installed CLI itself', pt: 'O painel não guarda lista fixa: ela vem do próprio CLI instalado' })}>
          {provider.source.kind === 'alias' ? tx({ en: 'CLI aliases, read from ', pt: 'apelidos do CLI, lidos de ' }) : tx({ en: 'list read from ', pt: 'lista lida de ' })}
          <code className="inline">{provider.source.command}</code> {provider.source.fetchedAt && <> · {relTime(provider.source.fetchedAt)}</>}
        </small>
        <button type="button" className="btn btn-sm" onClick={refresh} disabled={refreshing} title={tx({ en: `Runs ${provider.source.command} again`, pt: `Roda ${provider.source.command} de novo` })}>
          <RotateCw size={13} className={refreshing ? 'spin' : ''} /> {refreshing ? tx({ en: 'Reading…', pt: 'Lendo…' }) : tx({ en: 'Refresh list', pt: 'Atualizar lista' })}
        </button>
      </div>

      {provider.source.kind === 'alias' && (
        <small>{tx({
          en: <>The alias follows the newest version on its own: when a new Opus comes out, <code className="inline">opus</code> uses it right away.</>,
          pt: <>O apelido acompanha a versão mais nova sozinho: quando sair um Opus novo, <code className="inline">opus</code> já passa a usá-lo.</>,
        })}</small>
      )}

      {provider.source.error && (
        <div className="callout callout-crit">
          <AlertTriangle size={16} />
          <div className="spacer">
            {provider.source.error}
            {provider.models.length > 0 && tx({ en: ' The list below is from the last read that worked.', pt: ' A lista abaixo é da última leitura que deu certo.' })}
          </div>
        </div>
      )}

      {provider.installed && provider.models.length === 0 && !provider.source.error && (
        <div className="callout callout-warn"><AlertTriangle size={16} />{tx({ en: `${provider.name} returned no model. Try "Refresh list".`, pt: `O ${provider.name} não devolveu nenhum modelo. Tente "Atualizar lista".` })}</div>
      )}

      {!known && value && suggestion && (
        <div className="callout callout-warn">
          <AlertTriangle size={16} />
          <div className="spacer">
            {tx({
              en: <>The saved model <code className="inline">{value}</code> is not in {provider.name}'s current list. It may be outdated or discontinued.</>,
              pt: <>O modelo salvo <code className="inline">{value}</code> não está na lista atual do {provider.name}. Ele pode estar desatualizado ou ter sido descontinuado.</>,
            })}
          </div>
          <button type="button" className="btn btn-sm" onClick={() => onChange(suggestion.id)}>{tx({ en: `Use ${suggestion.label}`, pt: `Usar ${suggestion.label}` })}</button>
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
                {m.recommended && <span className="badge badge-signal">{tx({ en: 'recommended', pt: 'recomendado' })}</span>}
                {m.alias && <span className="badge">{tx({ en: 'always the newest', pt: 'sempre o mais novo' })}</span>}
              </span>
              {m.description && <small className="muted">{m.description}</small>}
            </span>
          </label>
        ))}
      </div>

      <label className="row" style={{ ['--gap' as string]: '8px', fontSize: 12.5 }}>
        <span className="muted">{tx({ en: 'Other model id:', pt: 'Outro id de modelo:' })}</span>
        <input
          className="input mono"
          style={{ width: 260 }}
          placeholder={tx({ en: 'e.g. claude-opus-5-5', pt: 'ex.: claude-opus-5-5' })}
          value={known ? '' : value}
          onChange={e => onChange(e.target.value.trim())}
          title={tx({ en: 'For a model the CLI accepts but that is not in the list yet', pt: 'Para um modelo que o CLI aceita mas ainda não aparece na lista' })}
        />
      </label>
    </div>
  )
}
