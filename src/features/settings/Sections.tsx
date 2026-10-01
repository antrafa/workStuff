import { Check, Monitor, Moon, Pipette, RotateCcw, Sun } from 'lucide-react'
import { NAV } from '@/app/nav'
import { setHiddenPaths, useHiddenPaths } from '@/app/menu'
import { ACCENTS, setAccent, setTheme, useAccent, useTheme, type Theme } from '@/app/theme'
import { Meter } from '@/ui'

const THEMES: { id: Theme; label: string; hint: string; icon: typeof Sun }[] = [
  { id: 'dark', label: 'Escuro', hint: 'Console grafite, padrão do painel', icon: Moon },
  { id: 'light', label: 'Claro', hint: 'Para tela compartilhada e ambiente iluminado', icon: Sun },
  { id: 'auto', label: 'Automático', hint: 'Segue o tema do sistema operacional', icon: Monitor },
]

export function AppearanceSection() {
  const theme = useTheme()
  return (
    <section className="card card-pad stack">
      <div>
        <div className="card-title">Tema</div>
        <small className="muted">Aplica na hora e fica salvo neste navegador.</small>
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
        <div className="card-title">Cor de destaque</div>
        <small className="muted">
          Marca a ação principal, o item ativo e os filtros ligados. A cor é ajustada sozinha para continuar legível no tema claro e no escuro.
        </small>
      </div>
      <div className="row" style={{ ['--gap' as string]: '10px' }}>
        {ACCENTS.map(a => (
          <button key={a.id} className="swatch" aria-pressed={a.hex === accent} onClick={() => setAccent(a.hex)} title={`${a.label} (${a.hex})`}>
            <span style={{ background: a.hex }}>{a.hex === accent && <Check size={14} />}</span>
            {a.label}
          </button>
        ))}
        <label className="swatch" aria-pressed={!preset} title="Escolher qualquer cor">
          <span className="swatch-custom" style={!preset ? { background: accent } : undefined}>
            <Pipette size={14} />
          </span>
          Outra
          <input type="color" value={accent} onChange={e => setAccent(e.target.value)} />
        </label>
      </div>
      <small className="muted">
        Vermelho, laranja e amarelo ficam parecidos com os alertas de erro e atenção. Prefira outra cor se você depende deles para bater o olho.
      </small>
      <div className="accent-preview">
        <span className="eyebrow">Prévia</span>
        <div className="row">
          <button className="btn btn-primary">Ação principal</button>
          <button className="chip" aria-pressed="true">Filtro ligado</button>
          <span className="badge badge-signal">IA</span>
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
          <div className="card-title">Itens do menu</div>
          <small className="muted">Esconda as telas que você não usa. Aplica na hora; elas continuam acessíveis pela URL.</small>
        </div>
        <button className="btn btn-sm" disabled={hidden.length === 0} onClick={() => onChange([])}><RotateCcw size={13} /> Mostrar todas</button>
      </div>
      {NAV.map(group => (
        <div key={group.label} className="stack" style={{ ['--gap' as string]: '6px' }}>
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
                  <button className="switch" role="switch" aria-checked={visible} aria-label={`Mostrar ${label} no menu`} onClick={() => toggle(path)} />
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
