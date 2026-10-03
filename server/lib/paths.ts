import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Dados da máquina ficam fora do repositório: sobrevivem a clone novo e não correm risco de commit.
export const DATA_DIR = process.env.WORKSTUFF_HOME ?? join(homedir(), '.workstuff')
mkdirSync(DATA_DIR, { recursive: true })

export const dataFile = (name: string) => join(DATA_DIR, name)

// Home onde ficam as configs dos agentes (~/.claude, ~/.codex…). Sobrescrevível para testar sem tocar nas reais.
export const AGENT_HOME = process.env.WORKSTUFF_AGENT_HOME ?? homedir()

export const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url))
export const DEFAULT_RUNBOOKS_DIR = join(PROJECT_ROOT, 'runbooks')
export const DEFAULT_PLAYBOOKS_DIR = join(PROJECT_ROOT, 'playbooks')
export const DEFAULT_DEV_RUNBOOKS_DIR = join(PROJECT_ROOT, 'dev-runbooks')

export const expandHome = (p: string) => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p)
export const tildify = (p: string) => (p.startsWith(homedir()) ? '~' + p.slice(homedir().length) : p)

