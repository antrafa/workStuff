// Which clone of the workspace holds the code of a workload: by name, since the cluster does not say.
// The person can always pick another one; this only fills the first choice.

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function score(names: string[], clone: string): number {
  const c = plain(clone.split('/').pop() ?? clone)
  if (!c) return 0
  return Math.max(...names.map(plain).filter(Boolean).map(n => (n === c ? 3 : n.startsWith(c) || c.startsWith(n) ? 2 : n.includes(c) || c.includes(n) ? 1 : 0)))
}

export function guessClone(names: string[], clones: string[]): string | null {
  let best: string | null = null
  let bestScore = 0
  for (const clone of clones) {
    const s = score(names, clone)
    // Same score: the shorter path is the closer name (api over api-legacy)
    if (s > bestScore || (s === bestScore && s > 0 && best && clone.length < best.length)) {
      best = clone
      bestScore = s
    }
  }
  return best
}
