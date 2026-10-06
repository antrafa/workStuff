import { useEffect, useState } from 'react'
import { inkFor, readableOn } from '@/lib/color'

export type Theme = 'dark' | 'light' | 'auto'

// Imported before the language is known (main.tsx, so the theme never flashes): labels are pairs
// resolved by the screen with tx(), never tx() here.
export const ACCENTS = [
  { id: 'azul', label: { en: 'Blue', pt: 'Azul' }, hex: '#5b9dff' },
  { id: 'lima', label: { en: 'Lime', pt: 'Lima' }, hex: '#c6f432' },
  { id: 'roxo', label: { en: 'Purple', pt: 'Roxo' }, hex: '#a78bfa' },
  { id: 'ciano', label: { en: 'Cyan', pt: 'Ciano' }, hex: '#3fd4c8' },
  { id: 'amarelo', label: { en: 'Yellow', pt: 'Amarelo' }, hex: '#ffd23f' },
  { id: 'laranja', label: { en: 'Orange', pt: 'Laranja' }, hex: '#ff9a4d' },
  { id: 'vermelho', label: { en: 'Red', pt: 'Vermelho' }, hex: '#ff6b6b' },
  { id: 'rosa', label: { en: 'Pink', pt: 'Rosa' }, hex: '#ff7ac8' },
] as const

type Prefs = { theme: Theme; accent: string }

// Backgrounds the accent must be readable on (same values as tokens.css).
const SURFACE = { dark: '#131418', light: '#ffffff' }
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
    // no storage: the preference lasts for this tab only
  }
  apply(next)
  listeners.forEach(l => l(next))
}

export const setTheme = (theme: Theme) => update({ theme })
export const setAccent = (accent: string) => update({ accent })

apply(read())

// In "auto", follows the system without a reload.
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
