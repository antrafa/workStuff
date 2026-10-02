// Diagnóstico da máquina: o que falta para trabalhar e o comando que resolve cada pendência.
// Só verifica; nada é instalado aqui. Detecção e correção dependem do sistema (Linux, macOS, Windows):
// toda correção sai de fixesFor(), para o autoteste conferir a tabela inteira em cada sistema.
// Autoteste: node server/lib/doctor/checks.ts --selfcheck

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statfsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { FOREIGN, PLATFORM, SIMULATED, foreignKey, installFix, type Fix, type Platform, type Recipe } from '../platform.ts'
import { which } from '../run.ts'
import { listSources, resolveToken } from '../repos/sources.ts'
import { readDoctorConfig, type DoctorConfig } from './config.ts'

const exec = promisify(execFile)

export type Status = 'ok' | 'falta' | 'aviso'
// auto: o painel roda sozinho (instala na home, sem sudo nem terminal); manual: precisa de sudo ou shell
// interativo, só dá para copiar; instrucao: não é comando (URL, pedir arquivo ao time).
export type Execution = 'auto' | 'manual' | 'instrucao'

export type CheckResult = { grupo: string; item: string; status: Status; detalhe: string; correcao: string; execucao: Execution }

type AnyFix = { correcao: string; execucao: Execution }

const HOME = homedir()
const LOCALAPPDATA = process.env.LOCALAPPDATA ?? join(HOME, 'AppData', 'Local')
const PROGRAMFILES = process.env.ProgramFiles ?? 'C:\\Program Files'
const SDKMAN_JAVA = join(HOME, '.sdkman', 'candidates', 'java')
const SDKMAN_MAVEN = join(HOME, '.sdkman', 'candidates', 'maven')
const NVM_NODE = join(HOME, '.nvm', 'versions', 'node')
// nvm-windows guarda cada versão numa pasta vN.N.N dentro do NVM_HOME.
const NVM_WINDOWS = process.env.NVM_HOME ?? join(process.env.APPDATA ?? join(HOME, 'AppData', 'Roaming'), 'nvm')
const WINDOWS_JDK_DIRS = ['Zulu', 'Eclipse Adoptium', 'Java', 'Microsoft', 'Amazon Corretto'].map(d => join(PROGRAMFILES, d))
const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

const RECIPES = {
  git: { apt: 'git', dnf: 'git', pacman: 'git', brew: 'git', winget: 'Git.Git', url: 'https://git-scm.com/downloads' },
  curl: { apt: 'curl', dnf: 'curl', pacman: 'curl', brew: 'curl', winget: 'cURL.cURL', url: 'https://curl.se/download.html' },
  unzip: { apt: 'unzip', dnf: 'unzip', pacman: 'unzip', brew: 'unzip', url: 'https://infozip.sourceforge.net/' },
  zip: { apt: 'zip', dnf: 'zip', pacman: 'zip', brew: 'zip', url: 'https://infozip.sourceforge.net/' },
  kubectl: { pacman: 'kubectl', snap: 'kubectl --classic', brew: 'kubectl', winget: 'Kubernetes.kubectl', url: 'https://kubernetes.io/docs/tasks/tools/' },
  zenity: { apt: 'zenity', dnf: 'zenity', pacman: 'zenity', url: 'https://help.gnome.org/users/zenity/' },
  bwrap: { apt: 'bubblewrap', dnf: 'bubblewrap', pacman: 'bubblewrap', url: 'https://github.com/containers/bubblewrap' },
  dockerDesktop: { brew: '--cask docker', winget: 'Docker.DockerDesktop', url: 'https://docs.docker.com/engine/install/' },
  compose: { apt: 'docker-compose-plugin', dnf: 'docker-compose-plugin', pacman: 'docker-compose', url: 'https://docs.docker.com/compose/install/linux/' },
  vscode: { snap: 'code --classic', brew: '--cask visual-studio-code', winget: 'Microsoft.VisualStudioCode', url: 'https://code.visualstudio.com/download' },
  intellij: { url: 'https://www.jetbrains.com/toolbox-app/' },
  dbeaver: { snap: 'dbeaver-ce', brew: '--cask dbeaver-community', winget: 'dbeaver.dbeaver', url: 'https://dbeaver.io/download/' },
  postman: { snap: 'postman', brew: '--cask postman', winget: 'Postman.Postman', url: 'https://www.postman.com/downloads/' },
  compass: { brew: '--cask mongodb-compass', winget: 'MongoDB.Compass.Full', url: 'https://www.mongodb.com/try/download/compass' },
} satisfies Record<string, Recipe>

const instrucao = (correcao: string): AnyFix => ({ correcao, execucao: 'instrucao' })
const manual = (correcao: string): AnyFix => ({ correcao, execucao: 'manual' })
const auto = (correcao: string): AnyFix => ({ correcao, execucao: 'auto' })

// Toda correção que o diagnóstico pode sugerir, por sistema. SDKMAN e NVM são instalados na home,
// sem sudo: por isso podem ser automáticos no Unix. No Windows nada é automático além do npm install,
// porque winget e nvm-windows pedem elevação.
export function fixesFor(p: Platform) {
  const win = p.os === 'win32'
  const install = (r: Recipe): Fix => installFix(r, p)
  return {
    install,
    gitIdentity: instrucao('git config --global user.name "Seu Nome"; git config --global user.email "voce@exemplo.com"'),
    sshKey: (email: string) => manual(`ssh-keygen -t ed25519 -C "${email || 'voce@exemplo.com'}"`),
    sdkman: win ? null : auto('curl -s "https://get.sdkman.io" | bash'),
    javaVersion: (id: string) => (win ? manual(`winget install -e --id Azul.Zulu.${id.split('.')[0]}.JDK`) : auto(`sdk install java ${id}`)),
    mavenVersion: (v: string) => (win ? instrucao('https://maven.apache.org/download.cgi') : auto(`sdk install maven ${v}`)),
    nvm: win ? manual('winget install -e --id CoreyButler.NVMforWindows') : auto('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash'),
    nodeVersion: (v: string) => (win ? manual(`nvm install ${v}`) : auto(`nvm install ${v}`)),
    nodeOnPath: win ? manual('nvm install 24; nvm use 24') : manual('nvm install 24 && nvm alias default 24'),
    dockerEngine: p.os === 'linux' ? instrucao('https://docs.docker.com/engine/install/') : install(RECIPES.dockerDesktop),
    compose: p.os === 'linux' ? install(RECIPES.compose) : instrucao('atualize o Docker Desktop: o compose vem junto com ele'),
    dockerDaemon: p.os === 'linux' ? manual('sudo systemctl start docker') : instrucao('abra o Docker Desktop e espere ele terminar de iniciar'),
    // Grupo docker só existe no Linux; no macOS e no Windows quem dá o acesso é o Docker Desktop.
    dockerGroup: p.os === 'linux' ? manual('sudo usermod -aG docker $USER && newgrp docker') : null,
    npmInstall: auto('npm install'),
    noBwrap: instrucao('escolha Claude ou Codex em Configurações'),
  }
}

const ok = (grupo: string, item: string, detalhe: string): CheckResult => ({ grupo, item, status: 'ok', detalhe, correcao: '', execucao: 'manual' })
const pending = (grupo: string, item: string, status: Exclude<Status, 'ok'>, detalhe: string, fix: AnyFix): CheckResult =>
  ({ grupo, item, status, detalhe, ...fix })

async function output(bin: string, args: string[], timeout = 8000): Promise<string | null> {
  try {
    const { stdout, stderr } = await exec(bin, args, { timeout })
    return (stdout || stderr).trim()
  } catch (e) {
    const { stdout = '', stderr = '' } = e as { stdout?: string; stderr?: string }
    return (stdout || stderr).trim() || null
  }
}

const has = async (bin: string) => (await which(bin)) !== null

const firstLine = (s: string | null) => (s ?? '').split('\n')[0].slice(0, 60)
const list = (dir: string) => (existsSync(dir) ? readdirSync(dir) : [])
const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf-8') : '')

// No Windows o binário pode ser um .cmd, que o execFile não roda sem shell: a versão fica em branco,
// mas a presença (pelo where) continua valendo.
async function binary(grupo: string, item: string, bin: string, fix: AnyFix, status: 'falta' | 'aviso', versionArgs = ['--version']) {
  if (!(await has(bin))) return pending(grupo, item, status, 'não encontrado no PATH', fix)
  return ok(grupo, item, firstLine(await output(bin, versionArgs)) || (await which(bin))!)
}

// Versão instalada por SDKMAN/NVM (pasta por versão), localizada pelo major.
function major(grupo: string, item: string, dir: string, prefix: string, fix: AnyFix, status: 'falta' | 'aviso' = 'falta'): CheckResult {
  const found = list(dir).find(v => v.startsWith(prefix))
  return found ? ok(grupo, item, found) : pending(grupo, item, status, `nenhuma versão ${prefix}x instalada`, fix)
}

// IDE pode vir de gerenciador, Toolbox, instalador ou tarball: procurar por gestor daria pendência falsa. Sempre aviso.
async function ide(item: string, fix: AnyFix, candidates: string[]): Promise<CheckResult> {
  for (const c of candidates) {
    if (isAbsolute(c) ? existsSync(c) : await has(c)) return ok('IDEs', item, c.replace(HOME, '~'))
  }
  return pending('IDEs', item, 'aviso', 'não encontrado', fix)
}

// Falso negativo aqui ensina a ignorar o diagnóstico: timeout folgado e uma retentativa.
async function reachable(url: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000), redirect: 'manual' })
      return true // qualquer resposta HTTP, até 401/403, prova que a rede chega lá
    } catch {
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  return false
}

async function url(item: string, target: string) {
  return (await reachable(target))
    ? ok('Rede', item, 'alcançável')
    : pending('Rede', item, 'falta', 'sem resposta após 2 tentativas: verifique VPN, DNS ou proxy', instrucao('conecte-se à rede corporativa'))
}

function base(p: Platform, fix: ReturnType<typeof fixesFor>): Promise<CheckResult[]> {
  // zip e unzip existem para o SDKMAN, que não roda no Windows.
  const tools: (keyof typeof RECIPES)[] = p.os === 'win32' ? ['git', 'curl'] : ['git', 'curl', 'unzip', 'zip']
  return Promise.all(tools.map(b => binary('Base', b, b, fix.install(RECIPES[b]), 'falta', b === 'unzip' || b === 'zip' ? ['-v'] : ['--version'])))
}

async function credentials(cfg: DoctorConfig, fix: ReturnType<typeof fixesFor>): Promise<CheckResult[]> {
  const name = await output('git', ['config', '--global', 'user.name'])
  const email = await output('git', ['config', '--global', 'user.email'])
  const keys = list(join(HOME, '.ssh')).filter(f => f.endsWith('.pub')).length
  // Só presença: settings.xml e .npmrc guardam token em texto puro, nada deles é exibido.
  const m2 = read(join(HOME, '.m2', 'settings.xml'))
  const npmrc = read(join(HOME, '.npmrc'))
  return [
    name && email
      ? ok('Credenciais', 'Identidade git', `${name} <${email}>`)
      : pending('Credenciais', 'Identidade git', 'falta', 'user.name ou user.email não configurado', fix.gitIdentity),
    keys > 0
      ? ok('Credenciais', 'Chave SSH', `${keys} chave(s) pública(s) em ~/.ssh`)
      : pending('Credenciais', 'Chave SSH', 'falta', 'nenhuma chave em ~/.ssh: sem clonar nem dar push por SSH', fix.sshKey(email ?? '')),
    // Registries e escopos privados só existem se cadastrados: o painel não presume empresa nenhuma.
    ...cfg.mavenRegistries.map(r =>
      !m2
        ? pending('Credenciais', `Maven: ${r.label}`, 'falta', '~/.m2/settings.xml ausente', instrucao(`configure o ~/.m2/settings.xml com o repositório ${r.label}`))
        : m2.includes(r.match)
          ? ok('Credenciais', `Maven: ${r.label}`, `settings.xml cita ${r.match}`)
          : pending('Credenciais', `Maven: ${r.label}`, 'falta', `settings.xml não cita ${r.match}`, instrucao(`inclua o repositório ${r.label} no ~/.m2/settings.xml`)),
    ),
    ...cfg.npmScopes.map(scope =>
      npmrc.includes(`${scope}:registry`)
        ? ok('Credenciais', `npm ${scope}`, 'escopo configurado no ~/.npmrc')
        : pending('Credenciais', `npm ${scope}`, 'falta', `sem ${scope}:registry no ~/.npmrc: npm install de pacote ${scope} quebra`, instrucao(`configure ${scope}:registry no ~/.npmrc`)),
    ),
  ]
}

async function java(cfg: DoctorConfig, p: Platform, fix: ReturnType<typeof fixesFor>): Promise<CheckResult[]> {
  const majorOf = (id: string) => id.split('.')[0]
  if (p.os === 'win32') return javaWindows(cfg, fix, majorOf)
  if (!existsSync(SDKMAN_JAVA)) return [pending('Java', 'SDKMAN', 'falta', 'não instalado em ~/.sdkman', fix.sdkman!)]
  const out = [
    ok('Java', 'SDKMAN', `${list(SDKMAN_JAVA).filter(v => v !== 'current').length} versões instaladas`),
    ...cfg.javaVersions.map(id => major('Java', `Java ${majorOf(id)}`, SDKMAN_JAVA, `${majorOf(id)}.`, fix.javaVersion(id))),
  ]
  if (!cfg.mavenVersions.length) return out
  if (!existsSync(SDKMAN_MAVEN)) return [...out, pending('Maven', 'Maven', 'falta', 'nenhuma versão via SDKMAN', fix.mavenVersion(cfg.mavenVersions[0]))]
  return [...out, ...cfg.mavenVersions.map(v => major('Maven', `Maven ${v.split('.').slice(0, 2).join('.')}`, SDKMAN_MAVEN, v.split('.').slice(0, 2).join('.'), fix.mavenVersion(v)))]
}

// Windows não tem SDKMAN: cada JDK é um instalador numa pasta própria em Program Files.
async function javaWindows(cfg: DoctorConfig, fix: ReturnType<typeof fixesFor>, majorOf: (id: string) => string): Promise<CheckResult[]> {
  const installed = WINDOWS_JDK_DIRS.flatMap(list)
  const out = cfg.javaVersions.map(id => {
    const m = majorOf(id)
    const found = installed.find(d => new RegExp(`(jdk|zulu|java)[-_ ]?${m}(\\b|[._-])`, 'i').test(d))
    return found ? ok('Java', `Java ${m}`, found) : pending('Java', `Java ${m}`, 'falta', `nenhum JDK ${m} em ${PROGRAMFILES}`, fix.javaVersion(id))
  })
  if (!cfg.mavenVersions.length) return out
  return [...out, await binary('Maven', 'Maven', 'mvn', fix.mavenVersion(cfg.mavenVersions[0]), 'falta', ['-v'])]
}

async function node(cfg: DoctorConfig, p: Platform, fix: ReturnType<typeof fixesFor>): Promise<CheckResult[]> {
  const dir = p.os === 'win32' ? NVM_WINDOWS : NVM_NODE
  const where = p.os === 'win32' ? dir : '~/.nvm'
  const out: CheckResult[] = existsSync(dir)
    ? [
        ok('Node', 'NVM', `${list(dir).filter(v => /^v\d/.test(v)).length} versões instaladas`),
        ...cfg.nodeVersions.map(v => major('Node', `Node ${v}`, dir, `v${v}.`, fix.nodeVersion(v))),
      ]
    : [pending('Node', 'NVM', 'falta', `não instalado em ${where}`, fix.nvm)]
  // O workStuff roda no node do PATH e usa type stripping nativo: exige 22.18+ (testado no 24).
  const version = await output('node', ['-v'])
  const [maj, min] = (version ?? '').replace('v', '').split('.').map(Number)
  out.push(
    maj > 22 || (maj === 22 && min >= 18)
      ? ok('Node', 'Node no PATH', `${version}: o painel exige 22.18+`)
      : pending('Node', 'Node no PATH', 'falta', `${version ?? 'nenhum node ativo'}: o painel exige 22.18+ para rodar TypeScript direto`, fix.nodeOnPath),
  )
  return out
}

async function docker(p: Platform, fix: ReturnType<typeof fixesFor>): Promise<CheckResult[]> {
  const engine = p.os === 'linux' ? 'Docker Engine' : 'Docker Desktop'
  if (!(await has('docker'))) return [pending('Docker', engine, 'falta', 'não encontrado no PATH', fix.dockerEngine)]
  const compose = await output('docker', ['compose', 'version'])
  const daemon = await output('docker', ['info', '--format', '{{.ServerVersion}}'])
  const daemonUp = Boolean(daemon) && !/error|denied|cannot/i.test(daemon!)
  const out = [
    ok('Docker', engine, firstLine(await output('docker', ['--version']))),
    compose?.includes('version') ? ok('Docker', 'Compose plugin', firstLine(compose)) : pending('Docker', 'Compose plugin', 'falta', 'docker compose indisponível', fix.compose),
  ]
  // Grupo docker é coisa do Linux; no macOS e no Windows o Docker Desktop cuida do acesso.
  if (p.os !== 'linux') return [...out, daemonUp ? ok('Docker', 'Daemon ativo', 'o Docker Desktop responde') : pending('Docker', 'Daemon ativo', 'falta', 'o daemon não responde', fix.dockerDaemon)]
  const groups = (await output('id', ['-nG'])) ?? ''
  return [
    ...out,
    daemonUp
      ? ok('Docker', 'Acesso sem sudo', 'daemon responde ao usuário atual')
      : groups.split(/\s+/).includes('docker')
        ? pending('Docker', 'Daemon ativo', 'falta', 'usuário está no grupo docker, mas o daemon não responde', fix.dockerDaemon)
        : pending('Docker', 'Acesso sem sudo', 'falta', 'usuário fora do grupo docker', fix.dockerGroup!),
  ]
}

async function picker(p: Platform, fix: ReturnType<typeof fixesFor>): Promise<CheckResult> {
  if (p.os === 'darwin') return ok('workStuff', 'Seletor de pasta', 'osascript (nativo do macOS)')
  if (p.os === 'win32') return ok('workStuff', 'Seletor de pasta', 'PowerShell (nativo do Windows)')
  const found = (await has('zenity')) ? 'zenity' : (await has('kdialog')) ? 'kdialog' : null
  return found ? ok('workStuff', 'Seletor de pasta', found) : pending('workStuff', 'Seletor de pasta', 'aviso', 'sem zenity/kdialog: escolher pasta cai no caminho digitado', fix.install(RECIPES.zenity))
}

// O Antigravity escreve em disco mesmo em --mode plan; o bwrap é a trava de modo leitura dele, e só existe no Linux.
async function bubblewrap(p: Platform, fix: ReturnType<typeof fixesFor>): Promise<CheckResult> {
  const item = 'bubblewrap (trava do Antigravity)'
  if (p.os !== 'linux') return pending('workStuff', item, 'aviso', `bubblewrap só existe no Linux: no ${p.label} o Antigravity não roda nas telas de IA`, fix.noBwrap)
  return (await has('bwrap'))
    ? ok('workStuff', item, firstLine(await output('bwrap', ['--version'])))
    : pending('workStuff', item, 'aviso', 'sem bwrap o Antigravity não roda nas telas de IA', fix.install(RECIPES.bwrap))
}

async function workstuff(p: Platform, fix: ReturnType<typeof fixesFor>): Promise<CheckResult[]> {
  const catalogCount = (read(join(HOME, '.claude', 'CLAUDE.md')).match(/<!-- workstuff:item:/g) ?? []).length
  return [
    existsSync(join(PROJECT_ROOT, 'node_modules'))
      ? ok('workStuff', 'Dependências do painel', 'node_modules presente')
      : pending('workStuff', 'Dependências do painel', 'falta', 'node_modules ausente', fix.npmInstall),
    await picker(p, fix),
    await bubblewrap(p, fix),
    catalogCount > 0
      ? ok('workStuff', 'Catálogo de IA', `${catalogCount} item(ns) ativo(s) no Claude`)
      : pending('workStuff', 'Catálogo de IA', 'aviso', 'nenhuma rule/persona ativada no Claude pelo workStuff', instrucao('ative itens pela tela Catálogo')),
  ]
}

async function kubernetes(fix: ReturnType<typeof fixesFor>): Promise<CheckResult[]> {
  const kubeconfigs = list(join(HOME, '.kube')).filter(f => !['cache', 'http-cache'].includes(f)).length
  return [
    await binary('Kubernetes', 'kubectl', 'kubectl', fix.install(RECIPES.kubectl), 'falta', ['version', '--client']),
    kubeconfigs > 0
      ? ok('Kubernetes', 'Kubeconfigs', `${kubeconfigs} arquivo(s) em ~/.kube`)
      : pending('Kubernetes', 'Kubeconfigs', 'aviso', '~/.kube vazio: telas de Kubernetes ficam sem ambiente', instrucao('adicione um kubeconfig pela tela Cluster')),
  ]
}

async function ai(): Promise<CheckResult[]> {
  const clis = (await Promise.all(['claude', 'codex', 'agy'].map(async c => ((await has(c)) ? c : null)))).filter(Boolean)
  return [
    clis.length
      ? ok('IA', 'CLI de IA', `disponível: ${clis.join(', ')}`)
      : pending('IA', 'CLI de IA', 'falta', 'nenhum de claude/codex/agy no PATH: as telas de IA ficam inertes', instrucao('https://claude.com/claude-code')),
    await repoConnections(),
  ]
}

async function repoConnections(): Promise<CheckResult> {
  const sources = listSources()
  if (!sources.length) return pending('IA', 'Conexões de repositório', 'aviso', 'nenhuma conexão GitLab/GitHub: Repositórios e Requests & Limits ficam sem origem', instrucao('crie uma conexão na tela Repositórios'))
  const missing = (await Promise.all(sources.map(async s => ((await resolveToken(s.provider, s.tokenSource, s.id)) || s.tokenSource === 'none' ? null : s.label)))).filter(Boolean)
  return missing.length
    ? pending('IA', 'Conexões de repositório', 'aviso', `sem token encontrado em: ${missing.join(', ')}`, instrucao('edite a conexão na tela Repositórios'))
    : ok('IA', 'Conexões de repositório', `${sources.length} conexão(ões) com token`)
}

function ides(p: Platform, fix: ReturnType<typeof fixesFor>): Promise<CheckResult[]> {
  const byOs = (linux: string[], darwin: string[], win32: string[]) => (p.os === 'darwin' ? darwin : p.os === 'win32' ? win32 : linux)
  return Promise.all([
    ide('VS Code', fix.install(RECIPES.vscode), byOs(['code'], ['code', '/Applications/Visual Studio Code.app'], ['code', join(LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe')])),
    ide('IntelliJ IDEA', fix.install(RECIPES.intellij), byOs(
      ['idea', 'intellij-idea', join(HOME, '.local/share/JetBrains/Toolbox/scripts/idea')],
      ['idea', '/Applications/IntelliJ IDEA.app', '/Applications/IntelliJ IDEA CE.app', join(HOME, 'Library/Application Support/JetBrains/Toolbox/scripts/idea')],
      ['idea', join(LOCALAPPDATA, 'JetBrains', 'Toolbox', 'scripts', 'idea.cmd')],
    )),
    ide('DBeaver', fix.install(RECIPES.dbeaver), byOs(['dbeaver', 'dbeaver-ce'], ['dbeaver', '/Applications/DBeaver.app'], ['dbeaver', join(PROGRAMFILES, 'DBeaver', 'dbeaver.exe')])),
    ide('Postman', fix.install(RECIPES.postman), byOs(['postman'], ['/Applications/Postman.app'], [join(LOCALAPPDATA, 'Postman', 'Postman.exe')])),
    ide('MongoDB Compass', fix.install(RECIPES.compass), byOs(['mongodb-compass'], ['/Applications/MongoDB Compass.app'], [join(LOCALAPPDATA, 'MongoDBCompass', 'MongoDBCompass.exe')])),
  ])
}

function disk(): CheckResult {
  try {
    const s = statfsSync(HOME)
    const freeGb = Math.floor((s.bavail * s.bsize) / 1024 ** 3)
    return freeGb >= 20
      ? ok('Sistema', 'Espaço em disco', `${freeGb} GB livres em ~`)
      : pending('Sistema', 'Espaço em disco', 'aviso', `${freeGb} GB livres: JDKs, Node, IDEs e imagens Docker não cabem`, instrucao('libere espaço antes de instalar o resto'))
  } catch (e) {
    return pending('Sistema', 'Espaço em disco', 'aviso', `não consegui medir: ${(e as Error).message}`, instrucao('confira o espaço livre pelo sistema'))
  }
}

async function sshAccepted(host: string, p: Platform): Promise<CheckResult> {
  // known_hosts descartável: o diagnóstico não escreve no do usuário. No Windows o "/dev/null" é NUL.
  const devNull = p.os === 'win32' ? 'NUL' : '/dev/null'
  const reply = await output('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', `UserKnownHostsFile=${devNull}`, '-o', 'ConnectTimeout=5', `git@${host}`], 12000)
  return /welcome to gitlab|successfully authenticated/i.test(reply ?? '')
    ? ok('Rede', `${host} (SSH)`, 'chave aceita')
    : pending('Rede', `${host} (SSH)`, 'falta', `chave não aceita por ${host}`, instrucao(`cadastre sua chave pública (~/.ssh/*.pub) nas configurações de SSH de ${host}`))
}

// Rede: o que foi cadastrado + o servidor de cada conexão da tela Repositórios. Nada fixo no código.
function network(cfg: DoctorConfig, p: Platform): Promise<CheckResult[]> {
  const sources = listSources()
  const hosts = [...new Set(sources.map(s => new URL(s.url).origin))]
  const sshHosts = [...new Set(sources.filter(s => s.protocol === 'ssh').map(s => new URL(s.url).hostname))]
  return Promise.all([
    ...hosts.map(origin => url(`${new URL(origin).hostname} (HTTPS)`, origin)),
    ...cfg.urls.map(u => url(u.label, u.url)),
    ...sshHosts.map(h => sshAccepted(h, p)),
  ])
}

// Grupos em paralelo (a rede é o que demora); a ordem de exibição é a desta lista.
export async function diagnose(p: Platform = PLATFORM): Promise<CheckResult[]> {
  const cfg = readDoctorConfig()
  const fix = fixesFor(p)
  const groups = await Promise.all([
    base(p, fix),
    credentials(cfg, fix),
    java(cfg, p, fix),
    node(cfg, p, fix),
    docker(p, fix),
    workstuff(p, fix),
    kubernetes(fix),
    ai(),
    ides(p, fix),
    Promise.resolve([disk()]),
    network(cfg, p),
  ])
  return groups.flat()
}

// Todas as correções possíveis num sistema, inclusive as que esta máquina nunca mostraria.
export function allFixes(p: Platform): AnyFix[] {
  const fix = fixesFor(p)
  const { install, sshKey, javaVersion, mavenVersion, nodeVersion, ...fixed } = fix
  return [
    ...Object.values(RECIPES).map(install),
    ...Object.values(fixed).filter((f): f is AnyFix => typeof f === 'object' && f !== null),
    sshKey('a@b.c'), javaVersion('17.0.16-zulu'), mavenVersion('3.9.6'), nodeVersion('22'),
  ]
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const results = await diagnose()
  assert.ok(results.length >= 25, `só ${results.length} verificações`)
  for (const r of results) {
    assert.ok(['ok', 'falta', 'aviso'].includes(r.status), `status inválido em ${r.item}`)
    assert.ok(['auto', 'manual', 'instrucao'].includes(r.execucao), `execução inválida em ${r.item}`)
    if (r.status !== 'ok') assert.ok(r.correcao, `${r.item} pendente sem correção`)
  }
  assert.equal(new Set(results.map(r => `${r.grupo}|${r.item}`)).size, results.length, 'identificador grupo|item repetido')

  // Correção "auto" com sudo travaria o painel pedindo senha num processo sem terminal. A tabela inteira
  // é conferida em cada sistema, não só o que aparece pendente nesta máquina.
  for (const p of SIMULATED) {
    const fixes = allFixes(p)
    for (const f of fixes) {
      assert.ok(!FOREIGN[foreignKey(p)].test(f.correcao), `${p.label}: correção de outro sistema: ${f.correcao}`)
      if (f.execucao === 'auto') assert.ok(!/\bsudo\b/.test(f.correcao), `${p.label}: auto com sudo: ${f.correcao}`)
    }
    // No Windows só o npm install roda sozinho: o resto pede elevação ou um terminal novo.
    if (p.os === 'win32') assert.deepEqual(fixes.filter(f => f.execucao === 'auto').map(f => f.correcao), ['npm install'])
  }
  const win = SIMULATED.find(p => p.os === 'win32')!
  assert.equal(fixesFor(win).javaVersion('21.0.8-zulu').correcao, 'winget install -e --id Azul.Zulu.21.JDK')
  console.log(`doctor selfcheck: ok (${results.length} verificações em ${PLATFORM.label}; tabela conferida em ${SIMULATED.length} sistemas)`)
}
