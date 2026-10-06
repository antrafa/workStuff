// Which Repositórios connection hosts a git remote, and the project path inside it.
// Autoteste: node server/lib/repos/remote.ts --selfcheck

import assert from 'node:assert/strict'
import { normalizePath } from './layout.ts'
import type { Source } from './sources.ts'

// https://host/group/repo.git, ssh://git@host:2222/group/repo.git or git@host:group/repo.git
export function parseRemote(remote: string): { host: string; path: string } | null {
  const v = remote.trim()
  const scp = /^[\w.-]+@([^:/]+):(.+)$/.exec(v)
  if (scp) return { host: scp[1].toLowerCase(), path: normalizePath(scp[2].replace(/\.git$/, '')) }
  try {
    const u = new URL(v)
    return { host: u.hostname.toLowerCase(), path: normalizePath(u.pathname.replace(/\.git$/, '')) }
  } catch {
    return null
  }
}

// Same host and the project inside the connection's base group. The project path, not the base
// group, is what the MR/PR API needs.
export function sourceForRemote<S extends Pick<Source, 'url' | 'basePath'>>(sources: S[], remote: string): { source: S; projectPath: string } | null {
  const parsed = parseRemote(remote)
  if (!parsed || !parsed.path.includes('/')) return null
  const base = (s: S) => normalizePath(s.basePath)
  const match = sources
    .filter(s => parseRemote(s.url)?.host === parsed.host)
    .filter(s => !base(s) || parsed.path === base(s) || parsed.path.startsWith(`${base(s)}/`))
    // The most specific base group wins when two connections share a host
    .sort((a, b) => base(b).length - base(a).length)[0]
  return match ? { source: match, projectPath: parsed.path } : null
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.deepEqual(parseRemote('https://github.com/antrafa/workStuff.git'), { host: 'github.com', path: 'antrafa/workStuff' })
  assert.deepEqual(parseRemote('git@gitlab.empresa.com:time/area/api.git'), { host: 'gitlab.empresa.com', path: 'time/area/api' })
  assert.deepEqual(parseRemote('ssh://git@gitlab.empresa.com:2222/time/api.git'), { host: 'gitlab.empresa.com', path: 'time/api' })
  assert.equal(parseRemote('não é url'), null)

  const sources = [
    { id: 'gh', url: 'https://github.com', basePath: '' },
    { id: 'gl', url: 'https://gitlab.empresa.com', basePath: 'time' },
    { id: 'gl-area', url: 'https://gitlab.empresa.com', basePath: 'time/area' },
  ]
  assert.deepEqual(sourceForRemote(sources, 'https://github.com/antrafa/workStuff.git'), { source: sources[0], projectPath: 'antrafa/workStuff' })
  assert.equal(sourceForRemote(sources, 'git@gitlab.empresa.com:time/area/api.git')?.source.id, 'gl-area', 'grupo mais específico')
  assert.equal(sourceForRemote(sources, 'git@gitlab.empresa.com:outro/api.git'), null, 'fora do grupo base')
  assert.equal(sourceForRemote(sources, 'https://gitlab.outra.com/time/api.git'), null, 'outro host')
  console.log('repos remote selfcheck: ok')
}
