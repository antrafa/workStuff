// Sistema operacional onde o painel roda e o comando de instalação de cada ferramenta nele.
// Autoteste: node server/lib/platform.ts --selfcheck

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

export type Os = 'linux' | 'darwin' | 'win32'
// Família do Linux decide o gerenciador de pacotes; fora do Linux é null.
export type Family = 'debian' | 'fedora' | 'arch' | 'other' | null
export type Platform = { os: Os; family: Family; label: string }

export function detectPlatform(): Platform {
  const os: Os = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux'
  if (os === 'darwin') return { os, family: null, label: 'macOS' }
  if (os === 'win32') return { os, family: null, label: 'Windows' }
  let release = ''
  try {
    release = readFileSync('/etc/os-release', 'utf-8')
  } catch {
    // sem os-release (container mínimo): a família fica desconhecida e a correção cai na URL
  }
  return { os, ...linuxFamily(release) }
}

export function linuxFamily(osRelease: string): { family: Family; label: string } {
  const field = (k: string) => osRelease.match(new RegExp(`^${k}="?([^"\\n]*)"?$`, 'm'))?.[1] ?? ''
  const ids = `${field('ID')} ${field('ID_LIKE')}`.toLowerCase()
  const label = field('PRETTY_NAME') || 'Linux'
  if (/\b(debian|ubuntu)\b/.test(ids)) return { family: 'debian', label }
  if (/\b(fedora|rhel|centos)\b/.test(ids)) return { family: 'fedora', label }
  if (/\barch\b/.test(ids)) return { family: 'arch', label }
  return { family: 'other', label }
}

export const PLATFORM = detectPlatform()

// Pacote de cada gerenciador. brew aceita "--cask nome"; winget recebe o id exato do pacote.
// url é o último recurso: sistema sem gerenciador conhecido ou ferramenta fora dos repositórios.
export type Recipe = { apt?: string; dnf?: string; pacman?: string; snap?: string; brew?: string; winget?: string; url: string }

export type Fix = { correcao: string; execucao: 'manual' | 'instrucao' }

// Instalar pacote do sistema pede sudo (Linux) ou mexe fora da home (brew, winget): sempre manual,
// para a pessoa copiar e rodar no terminal. O painel nunca roda isso sozinho.
export function installFix(r: Recipe, p: Platform): Fix {
  const manual = (correcao: string): Fix => ({ correcao, execucao: 'manual' })
  if (p.os === 'darwin') return r.brew ? manual(`brew install ${r.brew}`) : { correcao: r.url, execucao: 'instrucao' }
  if (p.os === 'win32') return r.winget ? manual(`winget install -e --id ${r.winget}`) : { correcao: r.url, execucao: 'instrucao' }
  if (p.family === 'debian' && r.apt) return manual(`sudo apt install -y ${r.apt}`)
  if (p.family === 'fedora' && r.dnf) return manual(`sudo dnf install -y ${r.dnf}`)
  if (p.family === 'arch' && r.pacman) return manual(`sudo pacman -S --noconfirm ${r.pacman}`)
  if (r.snap) return manual(`sudo snap install ${r.snap}`)
  return { correcao: r.url, execucao: 'instrucao' }
}

// Gerenciadores que não existem em cada sistema: uma correção que cite um deles está errada ali.
export const FOREIGN: Record<string, RegExp> = {
  debian: /\b(dnf|pacman|brew|winget)\b/,
  fedora: /\b(apt|pacman|brew|winget)\b/,
  arch: /\b(apt|dnf|brew|winget)\b/,
  other: /\b(apt|dnf|pacman|brew|winget)\b/,
  darwin: /\b(apt|dnf|pacman|snap|winget|sudo)\b/,
  win32: /\b(apt|dnf|pacman|snap|brew|sudo|bash|source)\b/,
}
export const foreignKey = (p: Platform) => (p.os === 'linux' ? p.family ?? 'other' : p.os)

export const SIMULATED: Platform[] = [
  { os: 'linux', family: 'debian', label: 'Ubuntu' },
  { os: 'linux', family: 'fedora', label: 'Fedora' },
  { os: 'linux', family: 'arch', label: 'Arch' },
  { os: 'linux', family: 'other', label: 'Linux' },
  { os: 'darwin', family: null, label: 'macOS' },
  { os: 'win32', family: null, label: 'Windows' },
]

if (import.meta.main && process.argv.includes('--selfcheck')) {
  assert.deepEqual(linuxFamily('NAME="Ubuntu"\nID=ubuntu\nID_LIKE=debian\nPRETTY_NAME="Ubuntu 24.04 LTS"'), { family: 'debian', label: 'Ubuntu 24.04 LTS' })
  assert.equal(linuxFamily('ID=linuxmint\nID_LIKE="ubuntu debian"').family, 'debian')
  assert.equal(linuxFamily('ID="rocky"\nID_LIKE="rhel centos fedora"').family, 'fedora')
  assert.equal(linuxFamily('ID=fedora').family, 'fedora')
  assert.equal(linuxFamily('ID=manjaro\nID_LIKE=arch').family, 'arch')
  assert.equal(linuxFamily('ID=alpine').family, 'other')
  assert.deepEqual(linuxFamily(''), { family: 'other', label: 'Linux' })

  const kubectl: Recipe = { pacman: 'kubectl', snap: 'kubectl --classic', brew: 'kubectl', winget: 'Kubernetes.kubectl', url: 'https://kubernetes.io/docs/tasks/tools/' }
  const [debian, fedora, arch, other, mac, win] = SIMULATED
  assert.equal(installFix(kubectl, debian).correcao, 'sudo snap install kubectl --classic', 'sem apt, cai no snap')
  assert.equal(installFix(kubectl, arch).correcao, 'sudo pacman -S --noconfirm kubectl')
  assert.equal(installFix(kubectl, mac).correcao, 'brew install kubectl')
  assert.equal(installFix(kubectl, win).correcao, 'winget install -e --id Kubernetes.kubectl')
  assert.deepEqual(installFix({ url: 'https://x' }, fedora), { correcao: 'https://x', execucao: 'instrucao' })
  for (const p of SIMULATED) {
    const fix = installFix(kubectl, p)
    assert.notEqual(fix.execucao, 'auto' as string, 'instalar pacote nunca é automático')
    assert.ok(!FOREIGN[foreignKey(p)].test(fix.correcao), `${p.label}: ${fix.correcao}`)
  }
  assert.equal(foreignKey(other), 'other')
  console.log(`platform selfcheck: ok (esta máquina: ${PLATFORM.label})`)
}
