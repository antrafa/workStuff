import { useEffect, useState } from 'react'
import { inkFor, readableOn } from '@/lib/color'

export type Theme = 'dark' | 'light' | 'auto'

export const ACCENTS = [
  { id: 'azul', label: 'Azul', hex: '#5b9dff' },
  { id: 'lima', label: 'Lima', hex: '#c6f432' },
  { id: 'roxo', label: 'Roxo', hex: '#a78bfa' },
  { id: 'ciano', label: 'Ciano', hex: '#3fd4c8' },
  { id: 'amarelo', label: 'Amarelo', hex: '#ffd23f' },
  { id: 'laranja', label: 'Laranja', hex: '#ff9a4d' },
  { id: 'vermelho', label: 'Vermelho', hex: '#ff6b6b' },
  { id: 'rosa', label: 'Rosa', hex: '#ff7ac8' },
] as const

type Prefs = { theme: Theme; accent: string }

// Fundos contra os quais a cor de destaque precisa ser legível (mesmos valores de tokens.css).
const SURFACE = { dark: '#181917', light: '#fbfaf6' }
const DEFAULTS: Prefs = { theme: 'dark', accent: ACCENTS[0].hex }

function read(): Prefs {
  try {
    return {
      theme: (localStorage.getItem('theme') as Theme) || DEFAULTS.theme,
      accent: localStorage.getItem('accent') || DEFAULTS.accent,
    }
  } catch {
    return DEFAULTS
  }
}

function apply({ theme, accent }: Prefs) {
  const root = document.documentElement
  const resolved = theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme
  const signal = readableOn(accent, SURFACE[resolved])
  const consoleSignal = readableOn(accent, SURFACE.dark)
  root.dataset.theme = resolved
  root.style.setProperty('--signal', signal)
  root.style.setProperty('--signal-ink', inkFor(signal))
  root.style.setProperty('--signal-console', consoleSignal)
  root.style.setProperty('--signal-console-ink', inkFor(consoleSignal))
}

const listeners = new Set<(p: Prefs) => void>()

function update(patch: Partial<Prefs>) {
  const next = { ...read(), ...patch }
  try {
    localStorage.setItem('theme', next.theme)
    localStorage.setItem('accent', next.accent)
  } catch {
    // sem storage a preferência vale só nesta aba
  }
  apply(next)
  listeners.forEach(l => l(next))
}

export const setTheme = (theme: Theme) => update({ theme })
export const setAccent = (accent: string) => update({ accent })

apply(read())

// Em "Automático", troca junto com o sistema sem precisar recarregar.
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (read().theme !== 'auto') return
  apply(read())
  listeners.forEach(l => l(read()))
})

function usePrefs() {
  const [prefs, set] = useState(read)
  useEffect(() => {
    listeners.add(set)
    return () => void listeners.delete(set)
  }, [])
  return prefs
}

export const useTheme = () => usePrefs().theme
export const useAccent = () => usePrefs().accent
