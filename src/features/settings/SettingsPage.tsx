import './settings.css'
import { Bot, Palette, PanelLeft, Save } from 'lucide-react'
import { NavLink, useParams } from 'react-router'
import { useState } from 'react'
import { Async, Page, SkeletonRows, useToast } from '@/ui'
import { useAsync } from '@/lib/useAsync'
import { useHiddenPaths } from '@/app/menu'
import { AiSection } from './AiSection'
import { AccentSection, AppearanceSection, BackgroundSection, LanguageSection, MenuSection } from './Sections'
import { tx } from '@/lib/i18n'
import { fetchSettings, saveSettings, type Settings } from './api'

const SECTIONS = [
  { id: 'ia', label: tx({ en: 'AI provider', pt: 'Provedor de IA' }), icon: Bot },
  { id: 'aparencia', label: tx({ en: 'Appearance', pt: 'Aparência' }), icon: Palette },
  { id: 'menu', label: tx({ en: 'Menu items', pt: 'Itens do menu' }), icon: PanelLeft },
]

export default function SettingsPage() {
  const { secao = 'ia' } = useParams()
  const state = useAsync(fetchSettings)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const hidden = useHiddenPaths()
  const current = draft ?? state.data?.settings ?? null
  const update = (patch: Partial<Settings>) => current && setDraft({ ...current, ...patch })

  const save = async () => {
    if (!draft || !state.data) return
    setSaving(true)
    try {
      const { settings } = await saveSettings(draft)
      state.setData({ ...state.data, settings })
      setDraft(null)
      toast(tx({ en: 'Settings saved', pt: 'Configurações salvas' }))
    } catch (e) {
      toast(tx({ en: `Not saved: ${(e as Error).message}`, pt: `Não salvou: ${(e as Error).message}` }))
    } finally {
      setSaving(false)
    }
  }

  const badge = (id: string) => {
    if (!current) return null
    if (id === 'ia') return state.data?.providers.find(p => p.id === current.provider)?.name
    if (id === 'menu') return hidden.length ? tx({ en: `${hidden.length} hidden`, pt: `${hidden.length} ocultos` }) : tx({ en: 'all visible', pt: 'todos visíveis' })
    return null
  }

  return (
    <Page
      title={tx({ en: 'Settings', pt: 'Configurações' })}
      hint={tx({ en: 'AI provider, language, theme, accent color, background and which screens show in the menu.', pt: 'Provedor de IA, idioma, tema, cor de destaque, fundo e quais telas aparecem no menu.' })}
      actions={
        <button className="btn btn-primary" disabled={!draft || saving} onClick={save}
          title={draft ? tx({ en: 'Writes provider, model and effort to ~/.workstuff/settings.json', pt: 'Grava provedor, modelo e esforço em ~/.workstuff/settings.json' }) : tx({ en: 'Nothing changed', pt: 'Nada alterado' })}>
          <Save size={14} /> {saving ? tx({ en: 'Saving…', pt: 'Salvando…' }) : draft ? tx({ en: 'Save changes', pt: 'Salvar alterações' }) : tx({ en: 'Saved', pt: 'Salvo' })}
        </button>
      }
    >
      <div className="settings">
        <nav className="settings-nav">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <NavLink key={id} to={`/configuracoes/${id}`} className={() => `settings-link ${secao === id ? 'active' : ''}`}>
              <Icon size={15} />
              <span className="spacer">{label}</span>
              {badge(id) && <span className="badge">{badge(id)}</span>}
            </NavLink>
          ))}
        </nav>
        <div>
          <Async state={state} skeleton={<SkeletonRows rows={3} height={80} />}>
            {data => (
              <>
                {secao === 'ia' && current && <AiSection providers={data.providers} settings={current} onChange={update} />}
                {secao === 'aparencia' && (
                  <div className="stack" style={{ ['--gap' as string]: '16px' }}>
                    <LanguageSection />
                    <AppearanceSection />
                    <AccentSection />
                    <BackgroundSection />
                  </div>
                )}
                {secao === 'menu' && <MenuSection />}
              </>
            )}
          </Async>
        </div>
      </div>
    </Page>
  )
}
