import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Segmented } from '@/ui'
import { tx } from '@/lib/i18n'
import { ModelPicker } from './ModelPicker'
import type { Model, Provider, ProviderId, SandboxDriver, SandboxPolicy, Settings } from './api'

const EFFORT_LABEL: Record<string, string> = tx({
  en: { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Very high', max: 'Maximum', ultra: 'Ultra' },
  pt: { low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo', ultra: 'Ultra' },
})
const DEFAULT_EFFORTS = ['low', 'medium', 'high']

// Effort levels come from the model when the CLI reports them (Codex); otherwise the three generic ones.
const effortsOf = (model?: Model) => model?.efforts ?? DEFAULT_EFFORTS
const defaultModel = (p: Provider) => (p.models.find(m => m.recommended) ?? p.models[0])?.id ?? ''

type Props = { providers: Provider[]; settings: Settings; onChange: (p: Partial<Settings>) => void; sandboxDriver?: SandboxDriver }

export function AiSection({ providers: loaded, settings, onChange, sandboxDriver }: Props) {
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
        <div className="card-title">{tx({ en: 'AI provider', pt: 'Provedor de IA' })}</div>
        <small className="muted">{tx({ en: 'The panel runs the chosen CLI right on this machine, for Cluster Doctor, Analysis and the Catalog item review.', pt: 'O painel roda o CLI escolhido direto na máquina, para o Cluster Doctor, a Análise e a revisão de itens do Catálogo.' })}</small>
      </div>
      {providers.length === 0 && (
        <div className="callout callout-warn"><AlertTriangle size={16} />{tx({ en: 'No AI CLI found on PATH. Install claude, agy or codex to use the AI screens.', pt: 'Nenhum CLI de IA detectado no PATH. Instale claude, agy ou codex para usar as telas de IA.' })}</div>
      )}
      <div className="grid" style={{ ['--min' as string]: '200px' }}>
        {providers.map(p => (
          <button
            key={p.id}
            className="provider"
            aria-pressed={p.id === settings.provider}
            disabled={!p.installed}
            onClick={() => onChange({ provider: p.id, model: defaultModel(p), effort: p.models.find(m => m.recommended)?.defaultEffort ?? 'medium' })}
            title={p.installed ? p.path ?? '' : tx({ en: `${p.bin} not found on PATH`, pt: `${p.bin} não encontrado no PATH` })}
          >
            <b>{p.name}</b>
            <code className="inline">{p.bin}</code>
            <span className="row" style={{ fontSize: 12, ['--gap' as string]: '6px' }}>
              <span className={`dot ${p.installed ? 'dot-ok' : ''}`} /> {p.installed ? tx({ en: 'available', pt: 'disponível' }) : tx({ en: 'not found', pt: 'não detectado' })}
            </span>
            <span className="muted" style={{ fontSize: 11.5 }}>{p.nativeGuard ? tx({ en: 'native command guard', pt: 'guarda nativa de comandos' }) : tx({ en: 'no native guard: reduced protection', pt: 'sem guarda nativa: proteção reduzida' })}</span>
          </button>
        ))}
      </div>
      {selected && !selected.nativeGuard && (
        <div className="callout callout-warn"><AlertTriangle size={16} />{tx({ en: `${selected.name} does not block commands on its own: Cluster Doctor relies only on the panel's guard.`, pt: `${selected.name} não bloqueia comandos por conta própria: o Cluster Doctor depende só da guarda do painel.` })}</div>
      )}
      {selected?.nativeGuard && (
        <div className="callout callout-info"><ShieldCheck size={16} />{tx({ en: `${selected.name} has a native guard: write commands are denied by the CLI itself.`, pt: `${selected.name} tem guarda nativa: comandos de escrita são negados pelo próprio CLI.` })}</div>
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
        <span>{tx({ en: 'Effort', pt: 'Esforço' })}</span>
        <Segmented<string>
          value={settings.effort}
          onChange={effort => onChange({ effort })}
          options={efforts.map(id => ({ id, label: EFFORT_LABEL[id] ?? id }))}
        />
        <small>{tx({ en: 'More effort: more careful, slower answers.', pt: 'Mais esforço, respostas mais cuidadosas e mais lentas.' })}</small>
      </div>
      <div className="field">
        <div className="row">
          <span className="spacer" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
            {tx({ en: 'Sandbox policy', pt: 'Política de Sandbox' })}
          </span>
          {sandboxDriver === 'sandbox-exec' ? (
            <span className="badge badge-ok">sandbox-exec (macOS)</span>
          ) : sandboxDriver === 'bwrap' ? (
            <span className="badge badge-ok">bwrap (Linux)</span>
          ) : (
            <span className="badge badge-warn">{tx({ en: 'No sandbox detected', pt: 'Nenhum sandbox detectado' })}</span>
          )}
        </div>
        <Segmented<SandboxPolicy>
          value={settings.sandboxPolicy ?? 'strict'}
          onChange={sandboxPolicy => onChange({ sandboxPolicy })}
          options={[
            { id: 'strict', label: tx({ en: 'Strict (Isolated)', pt: 'Estrito (Isolado)' }) },
            { id: 'relaxed', label: tx({ en: 'Relaxed (Unconfined)', pt: 'Relaxado (Sem trava)' }) },
          ]}
        />
        <small>
          {(settings.sandboxPolicy ?? 'strict') === 'strict'
            ? tx({
                en: 'Strict: requires kernel-level sandbox (bwrap or sandbox-exec) for write operations and verification.',
                pt: 'Estrito: exige sandbox a nível de kernel (bwrap ou sandbox-exec) para operações de escrita e verificação.',
              })
            : tx({
                en: 'Relaxed: allows AI agents and tests to run directly on the machine if no sandbox is available.',
                pt: 'Relaxado: permite que agentes de IA e testes rodem direto na máquina caso nenhum sandbox esteja disponível.',
              })}
        </small>
        {settings.sandboxPolicy === 'relaxed' && (
          <div className="callout callout-warn">
            <AlertTriangle size={16} />
            {tx({
              en: 'Relaxed sandbox mode allows agents to write and run commands with your user permissions without kernel containerization.',
              pt: 'O modo relaxado permite que os agentes escrevam e executem comandos com suas permissões de usuário sem conteinerização a nível de kernel.',
            })}
          </div>
        )}
      </div>
    </section>
  )
}
