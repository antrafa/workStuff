import { storedList } from '@/lib/storedList'

// Preferências de navegação desta máquina: telas escondidas, favoritas (Alt 1–9), recentes e grupos abertos.
const hidden = storedList('hidden-menu')
const favorites = storedList('favorite-screens')
const recents = storedList('recent-screens')
const openGroups = storedList('open-menu-groups')

export const setHiddenPaths = hidden.set
export const useHiddenPaths = hidden.use

export const useFavorites = favorites.use
export const MAX_FAVORITES = 9
export function toggleFavorite(path: string) {
  const list = favorites.read()
  favorites.set(list.includes(path) ? list.filter(p => p !== path) : [...list, path].slice(0, MAX_FAVORITES))
}
export const favoriteAt = (index: number) => favorites.read()[index]

export const useRecents = recents.use
export function recordVisit(path: string) {
  recents.set([path, ...recents.read().filter(p => p !== path)].slice(0, 5))
}

export const useOpenGroups = openGroups.use
export function toggleGroup(id: string) {
  const list = openGroups.read()
  openGroups.set(list.includes(id) ? list.filter(l => l !== id) : [...list, id])
}
