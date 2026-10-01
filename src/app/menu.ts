import { useEffect, useState } from 'react'

// Telas escondidas do menu lateral. Preferência desta máquina, como o tema.
const KEY = 'hidden-menu'
const listeners = new Set<(paths: string[]) => void>()

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function setHiddenPaths(paths: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(paths))
  } catch {
    // sem storage vale só nesta aba
  }
  listeners.forEach(l => l(paths))
}

export function useHiddenPaths() {
  const [paths, set] = useState(read)
  useEffect(() => {
    listeners.add(set)
    return () => void listeners.delete(set)
  }, [])
  return paths
}
