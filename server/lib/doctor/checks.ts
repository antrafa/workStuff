// Diagnóstico da máquina: o que falta para trabalhar e o comando que resolve cada pendência.
// Só verifica; nada é instalado aqui.
// Autoteste: node server/lib/doctor/checks.ts --selfcheck

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statfsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { listSources, resolveToken } from '../repos/sources.ts'
import { readDoctorConfig, type DoctorConfig } from './config.ts'

const exec = promisify(execFile)

export type Status = 'ok' | 'falta' | 'aviso'
// auto: o painel roda sozinho (instala na home, sem sudo nem terminal); manual: precisa de sudo ou shell
// interativo, só dá para copiar; instrucao: não é comando (URL, pedir arquivo ao time).
export type Execution = 'auto' | 'manual' | 'instrucao'

export type CheckResult = { grupo: string; item: string; status: Status; detalhe: string; correcao: string; execucao: Execution }

const HOME = homedir()
const SDKMAN_JAVA = join(HOME, '.sdkman', 'candidates', 'java')
const SDKMAN_MAVEN = join(HOME, '.sdkman', 'candidates', 'maven')
const NVM_NODE = join(HOME, '.nvm', 'versions', 'node')
const PROJECT_ROOT = new URL('../../..', import.meta.url).pathname

const ok = (grupo: string, item: string, detalhe: string): CheckResult => ({ grupo, item, status: 'ok', detalhe, correcao: '', execucao: 'manual' })
const pending = (grupo: string, item: string, status: Exclude<Status, 'ok'>, detalhe: string, correcao: string, execucao: Execution): CheckResult =>
  ({ grupo, item, status, detalhe, correcao, execucao })

async function output(bin: string, args: string[], timeout = 8000): Promise<string | null> {
  try {
    const { stdout, stderr } = await exec(bin, args, { timeout })
    return (stdout || stderr).trim()
  } catch (e) {
    const { stdout = '', stderr = '' } = e as { stdout?: string; stderr?: string }
    return (stdout || stderr).trim() || null
  }
}

async function has(bin: string) {
  return (await output('which', [bin], 3000)) !== null
}

const firstLine = (s: string | null) => (s ?? '').split('\n')[0].slice(0, 60)
const list = (dir: string) => (existsSync(dir) ? readdirSync(dir) : [])
const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf-8') : '')

async function binary(grupo: string, item: string, bin: string, correcao: string, status: 'falta' | 'aviso', execucao: Execution, versionArgs = ['--version']) {
  if (!(await has(bin))) return pending(grupo, item, status, 'não encontrado no PATH', correcao, execucao)
  return ok(grupo, item, firstLine(await output(bin, versionArgs)))
}

// Versão instalada pelo SDKMAN/NVM, localizada pelo major.
function major(grupo: string, item: string, dir: string, prefix: string, correcao: string, status: 'falta' | 'aviso' = 'falta'): CheckResult {
  const found = list(dir).find(v => v.startsWith(prefix))
  return found ? ok(grupo, item, found) : pending(grupo, item, status, `nenhuma versão ${prefix}x instalada`, correcao, 'auto')
}

// IDE pode vir de apt, snap, Toolbox ou tarball: procurar por gestor daria pendência falsa. Sempre aviso.
async function ide(item: string, correcao: string, execucao: Execution, candidates: string[]): Promise<CheckResult> {
  for (const c of candidates) {
    if (c.startsWith('/') ? existsSync(c) : await has(c)) return ok('IDEs', item, c.replace(HOME, '~'))
  }
  return pending('IDEs', item, 'aviso', 'não encontrado', correcao, execucao)
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
    : pending('Rede', item, 'falta', 'sem resposta após 2 tentativas: verifique VPN, DNS ou proxy', 'conecte-se à rede corporativa', 'instrucao')
}

async function credentials(cfg: DoctorConfig): Promise<CheckResult[]> {
  const name = await output('git', ['config', '--global', 'user.name'])
  const email = await output('git', ['config', '--global', 'user.email'])
  const keys = list(join(HOME, '.ssh')).filter(f => f.endsWith('.pub')).length
  // Só presença: settings.xml e .npmrc guardam token em texto puro, nada deles é exibido.
  const m2 = read(join(HOME, '.m2', 'settings.xml'))
  const npmrc = read(join(HOME, '.npmrc'))
  return [
    name && email
      ? ok('Credenciais', 'Identidade git', `${name} <${email}>`)
      : pending('Credenciais', 'Identidade git', 'falta', 'user.name ou user.email não configurado', 'git config --global user.name "Seu Nome" && git config --global user.email "voce@exemplo.com"', 'instrucao'),
    keys > 0
      ? ok('Credenciais', 'Chave SSH', `${keys} chave(s) pública(s) em ~/.ssh`)
      : pending('Credenciais', 'Chave SSH', 'falta', 'nenhuma chave em ~/.ssh: sem clonar nem dar push por SSH', `ssh-keygen -t ed25519 -C "${email || 'voce@exemplo.com'}"`, 'manual'),
    // Registries e escopos privados só existem se cadastrados: o painel não presume empresa nenhuma.
    ...cfg.mavenRegistries.map(r =>
      !m2
        ? pending('Credenciais', `Maven: ${r.label}`, 'falta', '~/.m2/settings.xml ausente', `configure o ~/.m2/settings.xml com o repositório ${r.label}`, 'instrucao')
        : m2.includes(r.match)
          ? ok('Credenciais', `Maven: ${r.label}`, `settings.xml cita ${r.match}`)
          : pending('Credenciais', `Maven: ${r.label}`, 'falta', `settings.xml não cita ${r.match}`, `inclua o repositório ${r.label} no ~/.m2/settings.xml`, 'instrucao'),
    ),
    ...cfg.npmScopes.map(scope =>
      npmrc.includes(`${scope}:registry`)
        ? ok('Credenciais', `npm ${scope}`, 'escopo configurado no ~/.npmrc')
        : pending('Credenciais', `npm ${scope}`, 'falta', `sem ${scope}:registry no ~/.npmrc: npm install de pacote ${scope} quebra`, `configure ${scope}:registry no ~/.npmrc`, 'instrucao'),
    ),
  ]
}

function java(cfg: DoctorConfig): CheckResult[] {
  if (!existsSync(SDKMAN_JAVA)) return [pending('Java', 'SDKMAN', 'falta', 'não instalado em ~/.sdkman', 'curl -s "https://get.sdkman.io" | bash', 'auto')]
  const majorOf = (id: string) => id.split('.')[0]
  const out = [
    ok('Java', 'SDKMAN', `${list(SDKMAN_JAVA).filter(v => v !== 'current').length} versões instaladas`),
    ...cfg.javaVersions.map(id => major('Java', `Java ${majorOf(id)}`, SDKMAN_JAVA, `${majorOf(id)}.`, `sdk install java ${id}`)),
  ]
  if (!cfg.mavenVersions.length) return out
  if (!existsSync(SDKMAN_MAVEN)) return [...out, pending('Maven', 'Maven', 'falta', 'nenhuma versão via SDKMAN', `sdk install maven ${cfg.mavenVersions[0]}`, 'auto')]
  return [...out, ...cfg.mavenVersions.map(v => major('Maven', `Maven ${v.split('.').slice(0, 2).join('.')}`, SDKMAN_MAVEN, v.split('.').slice(0, 2).join('.'), `sdk install maven ${v}`))]
}

async function node(cfg: DoctorConfig): Promise<CheckResult[]> {
  const out: CheckResult[] = existsSync(NVM_NODE)
    ? [
        ok('Node', 'NVM', `${list(NVM_NODE).length} versões instaladas`),
        ...cfg.nodeVersions.map(v => major('Node', `Node ${v}`, NVM_NODE, `v${v}.`, `nvm install ${v}`)),
      ]
    : [pending('Node', 'NVM', 'falta', 'não instalado em ~/.nvm', 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash', 'auto')]
  // O workStuff roda no node do PATH e usa type stripping nativo: exige 22.18+ (testado no 24).
  const version = await output('node', ['-v'])
  const [maj, min] = (version ?? '').replace('v', '').split('.').map(Number)
  out.push(
    maj > 22 || (maj === 22 && min >= 18)
      ? ok('Node', 'Node no PATH', `${version}: o painel exige 22.18+`)
      : pending('Node', 'Node no PATH', 'falta', `${version ?? 'nenhum node ativo'}: o painel exige 22.18+ para rodar TypeScript direto`, 'nvm install 24 && nvm alias default 24', 'manual'),
  )
  return out
}

async function docker(): Promise<CheckResult[]> {
  if (!(await has('docker'))) return [pending('Docker', 'Docker Engine', 'falta', 'não encontrado no PATH', 'https://docs.docker.com/engine/install/ubuntu/', 'instrucao')]
  const compose = await output('docker', ['compose', 'version'])
  const daemon = await output('docker', ['info', '--format', '{{.ServerVersion}}'])
  const groups = (await output('id', ['-nG'])) ?? ''
  return [
    ok('Docker', 'Docker Engine', firstLine(await output('docker', ['--version']))),
    compose?.includes('version') ? ok('Docker', 'Compose plugin', firstLine(compose)) : pending('Docker', 'Compose plugin', 'falta', 'docker compose indisponível', 'sudo apt install -y docker-compose-plugin', 'manual'),
    daemon && !/error|denied|cannot/i.test(daemon)
      ? ok('Docker', 'Acesso sem sudo', 'daemon responde ao usuário atual')
      : groups.split(/\s+/).includes('docker')
        ? pending('Docker', 'Daemon ativo', 'falta', 'usuário está no grupo docker, mas o daemon não responde', 'sudo systemctl start docker', 'manual')
        : pending('Docker', 'Acesso sem sudo', 'falta', 'usuário fora do grupo docker', 'sudo usermod -aG docker $USER && newgrp docker', 'manual'),
  ]
}

async function workstuff(): Promise<CheckResult[]> {
  const pickers = (await has('zenity')) ? 'zenity' : (await has('kdialog')) ? 'kdialog' : null
  const catalogCount = (read(join(HOME, '.claude', 'CLAUDE.md')).match(/<!-- workstuff:item:/g) ?? []).length
  return [
    existsSync(join(PROJECT_ROOT, 'node_modules'))
      ? ok('workStuff', 'Dependências do painel', 'node_modules presente')
      : pending('workStuff', 'Dependências do painel', 'falta', 'node_modules ausente', 'npm install', 'auto'),
    pickers
      ? ok('workStuff', 'Seletor de pasta', pickers)
      : pending('workStuff', 'Seletor de pasta', 'aviso', 'sem zenity/kdialog: escolher pasta cai no caminho digitado', 'sudo apt install -y zenity', 'manual'),
    // O Antigravity escreve em disco mesmo em --mode plan; o bwrap é a trava de modo leitura dele.
    (await has('bwrap'))
      ? ok('workStuff', 'bubblewrap (trava do Antigravity)', firstLine(await output('bwrap', ['--version'])))
      : pending('workStuff', 'bubblewrap (trava do Antigravity)', 'aviso', 'sem bwrap o Antigravity não roda nas telas de IA', 'sudo apt install -y bubblewrap', 'manual'),
    catalogCount > 0
      ? ok('workStuff', 'Catálogo de IA', `${catalogCount} item(ns) ativo(s) no Claude`)
      : pending('workStuff', 'Catálogo de IA', 'aviso', 'nenhuma rule/persona ativada no Claude pelo workStuff', 'ative itens pela tela Catálogo', 'instrucao'),
  ]
}

async function kubernetes(): Promise<CheckResult[]> {
  const kubeconfigs = list(join(HOME, '.kube')).filter(f => !['cache', 'http-cache'].includes(f)).length
  return [
    await binary('Kubernetes', 'kubectl', 'kubectl', 'sudo snap install kubectl --classic', 'falta', 'manual', ['version', '--client']),
    kubeconfigs > 0
      ? ok('Kubernetes', 'Kubeconfigs', `${kubeconfigs} arquivo(s) em ~/.kube`)
      : pending('Kubernetes', 'Kubeconfigs', 'aviso', '~/.kube vazio: telas de Kubernetes ficam sem ambiente', 'adicione um kubeconfig pela tela Cluster', 'instrucao'),
  ]
}

async function ai(): Promise<CheckResult[]> {
  const clis = (await Promise.all(['claude', 'codex', 'agy'].map(async c => ((await has(c)) ? c : null)))).filter(Boolean)
  return [
    clis.length
      ? ok('IA', 'CLI de IA', `disponível: ${clis.join(', ')}`)
      : pending('IA', 'CLI de IA', 'falta', 'nenhum de claude/codex/agy no PATH: as telas de IA ficam inertes', 'https://claude.com/claude-code', 'instrucao'),
    await repoConnections(),
  ]
}

async function repoConnections(): Promise<CheckResult> {
  const sources = listSources()
  if (!sources.length) return pending('IA', 'Conexões de repositório', 'aviso', 'nenhuma conexão GitLab/GitHub: Repositórios e Requests & Limits ficam sem origem', 'crie uma conexão na tela Repositórios', 'instrucao')
  const missing = (await Promise.all(sources.map(async s => ((await resolveToken(s.provider, s.tokenSource, s.id)) || s.tokenSource === 'none' ? null : s.label)))).filter(Boolean)
  return missing.length
    ? pending('IA', 'Conexões de repositório', 'aviso', `sem token encontrado em: ${missing.join(', ')}`, 'edite a conexão na tela Repositórios', 'instrucao')
    : ok('IA', 'Conexões de repositório', `${sources.length} conexão(ões) com token`)
}

function disk(): CheckResult {
  const s = statfsSync(HOME)
  const freeGb = Math.floor((s.bavail * s.bsize) / 1024 ** 3)
  return freeGb >= 20
    ? ok('Sistema', 'Espaço em disco', `${freeGb} GB livres em ~`)
    : pending('Sistema', 'Espaço em disco', 'aviso', `${freeGb} GB livres: JDKs, Node, IDEs e imagens Docker não cabem`, 'libere espaço antes de instalar o resto', 'instrucao')
}

async function sshAccepted(host: string): Promise<CheckResult> {
  // UserKnownHostsFile=/dev/null: o diagnóstico não escreve no known_hosts do usuário.
  const reply = await output('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'ConnectTimeout=5', `git@${host}`], 12000)
  return /welcome to gitlab|successfully authenticated/i.test(reply ?? '')
    ? ok('Rede', `${host} (SSH)`, 'chave aceita')
    : pending('Rede', `${host} (SSH)`, 'falta', `chave não aceita por ${host}`, `cadastre sua chave pública (~/.ssh/*.pub) nas configurações de SSH de ${host}`, 'instrucao')
}

// Rede: o que foi cadastrado + o servidor de cada conexão da tela Repositórios. Nada fixo no código.
function network(cfg: DoctorConfig): Promise<CheckResult[]> {
  const sources = listSources()
  const hosts = [...new Set(sources.map(s => new URL(s.url).origin))]
  const sshHosts = [...new Set(sources.filter(s => s.protocol === 'ssh').map(s => new URL(s.url).hostname))]
  return Promise.all([
    ...hosts.map(origin => url(`${new URL(origin).hostname} (HTTPS)`, origin)),
    ...cfg.urls.map(u => url(u.label, u.url)),
    ...sshHosts.map(sshAccepted),
  ])
}

// Grupos em paralelo (a rede é o que demora); a ordem de exibição é a desta lista.
export async function diagnose(): Promise<CheckResult[]> {
  const cfg = readDoctorConfig()
  const groups = await Promise.all([
    Promise.all(['git', 'curl', 'unzip', 'zip'].map(b => binary('Base', b, b, `sudo apt install -y ${b}`, 'falta', 'manual', b === 'unzip' ? ['-v'] : b === 'zip' ? ['-v'] : ['--version']))),
    credentials(cfg),
    Promise.resolve(java(cfg)),
    node(cfg),
    docker(),
    workstuff(),
    kubernetes(),
    ai(),
    Promise.all([
      ide('VS Code', 'sudo snap install code --classic', 'manual', ['code']),
      ide('IntelliJ IDEA', 'https://www.jetbrains.com/toolbox-app/', 'instrucao', ['idea', 'intellij-idea', join(HOME, '.local/share/JetBrains/Toolbox/scripts/idea')]),
      ide('DBeaver', 'sudo snap install dbeaver-ce', 'manual', ['dbeaver', 'dbeaver-ce']),
      ide('Postman', 'sudo snap install postman', 'manual', ['postman']),
      ide('MongoDB Compass', 'https://www.mongodb.com/try/download/compass', 'instrucao', ['mongodb-compass']),
    ]),
    Promise.resolve([disk()]),
    network(cfg),
  ])
  return groups.flat()
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

  // Correção "auto" com sudo travaria o painel pedindo senha num processo sem terminal. Checagem
  // estática da tabela inteira, não só do que aparece pendente nesta máquina.
  const source = readFileSync(new URL(import.meta.url), 'utf-8')
  const autoWithSudo = source.split('\n').filter(l => !l.includes('autoWithSudo') && /'sudo [^']*'/.test(l) && /'auto'/.test(l))
  assert.deepEqual(autoWithSudo, [], 'correção auto com sudo')
  console.log(`doctor selfcheck: ok (${results.length} verificações)`)
}
