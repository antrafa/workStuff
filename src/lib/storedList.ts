import { useEffect, useState } from 'react'

// Lista guardada no navegador desta máquina (como o tema), com aviso para quem está ouvindo.
export function storedList(key: string) {
  const listeners = new Set<(items: string[]) => void>()

  const read = (): string[] => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]')
    } catch {
      return []
    }
  }

  const set = (items: string[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(items))
    } catch {
      // sem storage vale só nesta aba
    }
    listeners.forEach(l => l(items))
  }

  const use = () => {
    const [items, setItems] = useState(read)
    useEffect(() => {
      listeners.add(setItems)
      return () => void listeners.delete(setItems)
    }, [])
    return items
  }

  return { read, set, use }
}
