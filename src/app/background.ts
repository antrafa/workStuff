import { useEffect, useState } from 'react'

// Background chosen in Settings: a base color with an image over it. The transparency fades the
// image so the base color shows through. Color and transparency sit in localStorage next to the
// theme; the image goes to IndexedDB, because a photo is larger than the ~5 MB localStorage holds.
export type BackgroundFit = 'cover' | 'contain' | 'auto'
type Background = { color: string; transparency: number; fit: BackgroundFit; position: string; image: string | null }

// CSS background-position values, in the order the screen shows them (rows top to bottom).
export const BACKGROUND_POSITIONS = [
  'top left', 'top center', 'top right',
  'center left', 'center', 'center right',
  'bottom left', 'bottom center', 'bottom right',
] as const

const DB = 'workstuff'
const STORE = 'background'
const IMAGE_KEY = 'image'

let imageUrl: string | null = null

function openStore(mode: IDBTransactionMode) {
  return new Promise<IDBObjectStore>((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onsuccess = () => resolve(open.result.transaction(STORE, mode).objectStore(STORE))
    open.onerror = () => reject(open.error)
  })
}

function settle<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function read(): Background {
  try {
    return {
      color: localStorage.getItem('bg-color') ?? '',
      transparency: Number(localStorage.getItem('bg-transparency') ?? 0),
      fit: (localStorage.getItem('bg-fit') as BackgroundFit) || 'cover',
      position: localStorage.getItem('bg-position') || 'center',
      image: imageUrl,
    }
  } catch {
    return { color: '', transparency: 0, fit: 'cover', position: 'center', image: imageUrl }
  }
}

// An empty color keeps the theme's own background (--bg in tokens.css).
function apply({ color, transparency, fit, position, image }: Background) {
  const style = document.documentElement.style
  if (color) style.setProperty('--bg-base', color)
  else style.removeProperty('--bg-base')
  style.setProperty('--bg-image', image ? `url("${image}")` : 'none')
  style.setProperty('--bg-image-opacity', String(1 - transparency / 100))
  style.setProperty('--bg-image-size', fit)
  style.setProperty('--bg-image-position', position)
}

const listeners = new Set<(b: Background) => void>()

function refresh() {
  const next = read()
  apply(next)
  listeners.forEach(l => l(next))
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // no storage: the preference lasts for this tab only
  }
}

export function setBackgroundColor(color: string) {
  store('bg-color', color || null)
  refresh()
}

export function setBackgroundTransparency(percent: number) {
  store('bg-transparency', String(percent))
  refresh()
}

export function setBackgroundFit(fit: BackgroundFit) {
  store('bg-fit', fit)
  refresh()
}

export function setBackgroundPosition(position: string) {
  store('bg-position', position)
  refresh()
}

function showImage(blob: Blob | null) {
  if (imageUrl) URL.revokeObjectURL(imageUrl)
  imageUrl = blob ? URL.createObjectURL(blob) : null
  refresh()
}

export async function saveBackgroundImage(file: File) {
  await settle((await openStore('readwrite')).put(file, IMAGE_KEY))
  showImage(file)
}

export async function removeBackgroundImage() {
  await settle((await openStore('readwrite')).delete(IMAGE_KEY))
  showImage(null)
}

apply(read())

openStore('readonly')
  .then(s => settle(s.get(IMAGE_KEY)))
  .then(blob => blob instanceof Blob && showImage(blob))
  .catch(e => console.warn('background image not loaded:', e))

export function useBackground() {
  const [background, set] = useState(read)
  useEffect(() => {
    listeners.add(set)
    return () => void listeners.delete(set)
  }, [])
  return background
}
