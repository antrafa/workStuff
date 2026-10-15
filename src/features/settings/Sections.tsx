import { useState } from 'react'
import { Check, ImagePlus, Languages, Monitor, Moon, Pipette, RotateCcw, Sun, Trash2 } from 'lucide-react'
import { NAV } from '@/app/nav'
import { setHiddenPaths, useHiddenPaths } from '@/app/menu'
import { ACCENTS, setAccent, setTheme, useAccent, useTheme, type Theme } from '@/app/theme'
import { BACKGROUND_POSITIONS, removeBackgroundImage, saveBackgroundImage, setBackgroundColor, setBackgroundFit, setBackgroundPosition, setBackgroundTransparency, useBackground, type BackgroundFit } from '@/app/background'
import { Meter, Segmented } from '@/ui'
import { language, tx } from '@/lib/i18n'
import type { Lang } from '../../../server/lib/lang.ts'
import { changeLanguage } from './api'

const THEMES: { id: Theme; label: string; hint: string; icon: typeof Sun }[] = [
  { id: 'dark', label: tx({ en: 'Dark', pt: 'Escuro' }), hint: tx({ en: 'Graphite console, the panel default', pt: 'Console grafite, padrão do painel' }), icon: Moon },
  { id: 'light', label: tx({ en: 'Light', pt: 'Claro' }), hint: tx({ en: 'For shared screens and bright rooms', pt: 'Para tela compartilhada e ambiente iluminado' }), icon: Sun },
  { id: 'auto', label: tx({ en: 'Automatic', pt: 'Automático' }), hint: tx({ en: 'Follows the operating system theme', pt: 'Segue o tema do sistema operacional' }), icon: Monitor },
]

const FITS: { id: BackgroundFit; label: string }[] = [
  { id: 'cover', label: tx({ en: 'Cover the screen', pt: 'Cobrir a tela' }) },
  { id: 'contain', label: tx({ en: 'Fit whole', pt: 'Caber inteira' }) },
  { id: 'auto', label: tx({ en: 'Original size', pt: 'Tamanho original' }) },
]

const POSITION_LABELS: Record<(typeof BACKGROUND_POSITIONS)[number], string> = {
  'top left': tx({ en: 'Top left', pt: 'Topo à esquerda' }),
  'top center': tx({ en: 'Top center', pt: 'Topo ao centro' }),
  'top right': tx({ en: 'Top right', pt: 'Topo à direita' }),
  'center left': tx({ en: 'Center left', pt: 'Centro à esquerda' }),
  center: tx({ en: 'Center', pt: 'Centro' }),
  'center right': tx({ en: 'Center right', pt: 'Centro à direita' }),
  'bottom left': tx({ en: 'Bottom left', pt: 'Base à esquerda' }),
  'bottom center': tx({ en: 'Bottom center', pt: 'Base ao centro' }),
  'bottom right': tx({ en: 'Bottom right', pt: 'Base à direita' }),
}

// Saved on the server with the other settings (the server answers errors in it too).
export function LanguageSection() {
  const [error, setError] = useState<string | null>(null)
  const change = async (lang: Lang) => {
    try {
      await changeLanguage(lang)
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

export function BackgroundSection() {
  const { color, transparency, fit, position, image } = useBackground()
  useTheme() // re-renders on a theme switch, so the default base color below follows it
  const themeBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(tx({ en: `The image was not saved: ${(e as Error).message}`, pt: `A imagem não foi salva: ${(e as Error).message}` }))
    }
  }
  const pick = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(tx({ en: 'Choose an image file (PNG, JPG, WebP…).', pt: 'Escolha um arquivo de imagem (PNG, JPG, WebP…).' }))
      return
    }
    run(() => saveBackgroundImage(file))
  }

  return (
    <section className="card card-pad stack">
      <div>
        <div className="card-title">{tx({ en: 'Background', pt: 'Fundo' })}</div>
        <small className="muted">
          {tx({
            en: 'An image from your computer over a base color. Raising the transparency fades the image into the base color. Applies right away and is saved in this browser.',
            pt: 'Uma imagem do seu computador sobre uma cor base. Aumentar a transparência faz a imagem sumir na cor base. Aplica na hora e fica salvo neste navegador.',
          })}
        </small>
      </div>
      <div className="row">
        <label className="btn btn-sm">
          <ImagePlus size={13} /> {image ? tx({ en: 'Change image', pt: 'Trocar imagem' }) : tx({ en: 'Choose image', pt: 'Escolher imagem' })}
          <input type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <button className="btn btn-sm" disabled={!image} onClick={() => run(removeBackgroundImage)}>
          <Trash2 size={13} /> {tx({ en: 'Remove image', pt: 'Remover imagem' })}
        </button>
      </div>
      {image && (
        <div className="row">
          <span className="eyebrow">{tx({ en: 'Fit', pt: 'Ajuste' })}</span>
          <Segmented<BackgroundFit> options={FITS} value={fit} onChange={setBackgroundFit} />
          <span className="eyebrow">{tx({ en: 'Position', pt: 'Posição' })}</span>
          <select className="select" value={position} onChange={e => setBackgroundPosition(e.target.value)}>
            {BACKGROUND_POSITIONS.map(p => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
          </select>
        </div>
      )}
      <div className="row">
        <span className="eyebrow">{tx({ en: 'Base color', pt: 'Cor base' })}</span>
        <input type="color" value={color || themeBg} onChange={e => setBackgroundColor(e.target.value)} />
        <span className="mono muted">{color || themeBg}</span>
        <button className="btn btn-sm" disabled={!color} onClick={() => setBackgroundColor('')}>
          <RotateCcw size={13} /> {tx({ en: "Use the theme's", pt: 'Usar a do tema' })}
        </button>
      </div>
      <label className="row">
        <span className="eyebrow">{tx({ en: 'Transparency', pt: 'Transparência' })}</span>
        <input type="range" min={0} max={100} value={transparency} disabled={!image} style={{ accentColor: 'var(--signal)' }}
          onChange={e => setBackgroundTransparency(Number(e.target.value))} />
        <span className="mono muted">{transparency}%</span>
      </label>
      {error && <div className="callout callout-crit">{error}</div>}
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
