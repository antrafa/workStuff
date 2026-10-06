import { useState } from 'react'
import { Check, Languages, Monitor, Moon, Pipette, RotateCcw, Sun } from 'lucide-react'
import { NAV } from '@/app/nav'
import { setHiddenPaths, useHiddenPaths } from '@/app/menu'
import { ACCENTS, setAccent, setTheme, useAccent, useTheme, type Theme } from '@/app/theme'
import { Meter, Segmented } from '@/ui'
import { language, switchLanguage, tx } from '@/lib/i18n'
import type { Lang } from '../../../server/lib/lang.ts'
import { saveSettings, type Settings } from './api'

const THEMES: { id: Theme; label: string; hint: string; icon: typeof Sun }[] = [
  { id: 'dark', label: tx({ en: 'Dark', pt: 'Escuro' }), hint: tx({ en: 'Graphite console, the panel default', pt: 'Console grafite, padrão do painel' }), icon: Moon },
  { id: 'light', label: tx({ en: 'Light', pt: 'Claro' }), hint: tx({ en: 'For shared screens and bright rooms', pt: 'Para tela compartilhada e ambiente iluminado' }), icon: Sun },
  { id: 'auto', label: tx({ en: 'Automatic', pt: 'Automático' }), hint: tx({ en: 'Follows the operating system theme', pt: 'Segue o tema do sistema operacional' }), icon: Monitor },
]

// Saved on the server with the other settings (the server answers errors in it too), then the page
// reloads in the new language. Saves only the language: a pending AI change stays a draft.
export function LanguageSection({ saved }: { saved: Settings }) {
  const [error, setError] = useState<string | null>(null)
  const change = async (lang: Lang) => {
    if (lang === language()) return
    try {
      await saveSettings({ ...saved, language: lang })
      switchLanguage(lang)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <section className="card card-pad stack">
      <div>
        <div className="card-title row" style={{ gap: 8 }}><Languages size={15} /> {tx({ en: 'Language', pt: 'Idioma' })}</div>
        <small className="muted">{tx({ en: 'Interface and server messages. The page reloads to apply it.', pt: 'Interface e mensagens do servidor. A página recarrega para aplicar.' })}</small>
      </div>
      <Segmented<Lang>
        options={[{ id: 'en', label: 'English' }, { id: 'pt', label: 'Português' }]}
        value={language()}
        onChange={change}
      />
      {error && <div className="callout callout-crit">{error}</div>}
    </section>
  )
}

export function AppearanceSection() {
  const theme = useTheme()
  return (
    <section className="card card-pad stack">
      <div>
        <div className="card-title">{tx({ en: 'Theme', pt: 'Tema' })}</div>
        <small className="muted">{tx({ en: 'Applies right away and is saved in this browser.', pt: 'Aplica na hora e fica salvo neste navegador.' })}</small>
      </div>
      <div className="grid" style={{ ['--min' as string]: '180px' }}>
        {THEMES.map(({ id, label, hint, icon: Icon }) => (
          <button key={id} className="provider" aria-pressed={theme === id} onClick={() => setTheme(id)}>
            <Icon size={18} />
            <b>{label}</b>
            <span className="muted" style={{ fontSize: 12 }}>{hint}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function AccentSection() {
  const accent = useAccent()
  const preset = ACCENTS.find(a => a.hex === accent)

  return (
    <section className="card card-pad stack">
      <div>
        <div className="card-title">{tx({ en: 'Accent color', pt: 'Cor de destaque' })}</div>
        <small className="muted">
          {tx({
            en: 'Marks the main action, the active item and the filters that are on. It is adjusted on its own to stay readable in the light and dark themes.',
            pt: 'Marca a ação principal, o item ativo e os filtros ligados. A cor é ajustada sozinha para continuar legível no tema claro e no escuro.',
          })}
        </small>
      </div>
      <div className="row" style={{ ['--gap' as string]: '10px' }}>
        {ACCENTS.map(a => (
          <button key={a.id} className="swatch" aria-pressed={a.hex === accent} onClick={() => setAccent(a.hex)} title={`${tx(a.label)} (${a.hex})`}>
            <span style={{ background: a.hex }}>{a.hex === accent && <Check size={14} />}</span>
            {tx(a.label)}
          </button>
        ))}
        <label className="swatch" aria-pressed={!preset} title={tx({ en: 'Pick any color', pt: 'Escolher qualquer cor' })}>
          <span className="swatch-custom" style={!preset ? { background: accent } : undefined}>
            <Pipette size={14} />
          </span>
          {tx({ en: 'Other', pt: 'Outra' })}
          <input type="color" value={accent} onChange={e => setAccent(e.target.value)} />
        </label>
      </div>
      <small className="muted">
        {tx({
          en: 'Red, orange and yellow look like the error and warning alerts. Prefer another color if you rely on those at a glance.',
          pt: 'Vermelho, laranja e amarelo ficam parecidos com os alertas de erro e atenção. Prefira outra cor se você depende deles para bater o olho.',
        })}
      </small>
      <div className="accent-preview">
        <span className="eyebrow">{tx({ en: 'Preview', pt: 'Prévia' })}</span>
        <div className="row">
          <button className="btn btn-primary">{tx({ en: 'Main action', pt: 'Ação principal' })}</button>
          <button className="chip" aria-pressed="true">{tx({ en: 'Filter on', pt: 'Filtro ligado' })}</button>
          <span className="badge badge-signal">{tx({ en: 'AI', pt: 'IA' })}</span>
          <div style={{ width: 140 }}><Meter percent={42} /></div>
          <span className="mono muted">{accent}</span>
        </div>
      </div>
    </section>
  )
}

export function MenuSection() {
  const hidden = useHiddenPaths()
  const onChange = setHiddenPaths
  const toggle = (path: string) => onChange(hidden.includes(path) ? hidden.filter(p => p !== path) : [...hidden, path])

  return (
    <section className="card card-pad stack">
      <div className="row">
        <div className="spacer">
          <div className="card-title">{tx({ en: 'Menu items', pt: 'Itens do menu' })}</div>
          <small className="muted">{tx({ en: 'Hide the screens you do not use. Applies right away; they stay reachable by URL.', pt: 'Esconda as telas que você não usa. Aplica na hora; elas continuam acessíveis pela URL.' })}</small>
        </div>
        <button className="btn btn-sm" disabled={hidden.length === 0} onClick={() => onChange([])}><RotateCcw size={13} /> {tx({ en: 'Show all', pt: 'Mostrar todas' })}</button>
      </div>
      {NAV.map(group => (
        <div key={group.id} className="stack" style={{ ['--gap' as string]: '6px' }}>
          <span className="eyebrow">{group.label}</span>
          <div className="grid" style={{ ['--min' as string]: '240px', ['--gap' as string]: '8px' }}>
            {group.items.map(({ path, label, hint, icon: Icon }) => {
              const visible = !hidden.includes(path)
              return (
                <label key={path} className={`menu-tile ${visible ? '' : 'is-hidden'}`}>
                  <Icon size={15} />
                  <span className="spacer stack" style={{ ['--gap' as string]: '0' }}>
                    <b style={{ fontSize: 13 }}>{label}</b>
                    <small className="muted">{hint}</small>
                  </span>
                  <button className="switch" role="switch" aria-checked={visible} aria-label={tx({ en: `Show ${label} in the menu`, pt: `Mostrar ${label} no menu` })} onClick={() => toggle(path)} />
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
