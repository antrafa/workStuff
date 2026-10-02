// Dependências diretas declaradas num projeto: package.json (com a versão exata do lockfile) e pom.xml
// (com ${propriedade} resolvida). Só lê arquivos; nada é instalado nem executado.
// Autoteste: node server/lib/vulns/manifests.ts --selfcheck

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

export type Ecosystem = 'npm' | 'Maven'

export type Dependency = {
  ecosystem: Ecosystem
  name: string
  declared: string
  // Versão exata para consultar a base de falhas; null quando não dá para saber (gerenciada pelo parent, range sem lockfile).
  version: string | null
  dev: boolean
  file: string
}

const SKIP = new Set(['node_modules', '.git', 'target', 'dist', 'build', 'out', '.next', 'vendor', 'graphify-out'])
const MAX_DEPTH = 4
const MAX_FILES = 60

// Monorepo e projeto multi-módulo têm um manifest por pasta: procura até 4 níveis, sem dependências baixadas.
export function findManifests(root: string): string[] {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || found.length >= MAX_FILES) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return // pasta sem permissão de leitura: segue sem ela
    }
    for (const e of entries) {
      if (e.isFile() && (e.name === 'package.json' || e.name === 'pom.xml')) found.push(join(dir, e.name))
    }
    for (const e of entries) {
      if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.')) walk(join(dir, e.name), depth + 1)
    }
  }
  walk(root, 0)
  return found.slice(0, MAX_FILES)
}

// Versão exata quando o range é uma versão só ("1.2.3", "^1.2.3", "~1.2.3"); range de verdade fica sem.
const exactFromRange = (range: string) => range.match(/^[\^~=v]?(\d+\.\d+\.\d+(?:-[\w.]+)?)$/)?.[1] ?? null

function lockVersions(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  const lockFile = join(dir, 'package-lock.json')
  if (!existsSync(lockFile)) return out
  try {
    const lock = JSON.parse(readFileSync(lockFile, 'utf-8'))
    // lockfile v2/v3: "packages" com chave "node_modules/nome"; v1: "dependencies" com nome direto.
    for (const [key, v] of Object.entries<{ version?: string }>(lock.packages ?? {})) {
      if (key.startsWith('node_modules/') && !key.slice(13).includes('/node_modules/') && v.version) out.set(key.slice(13), v.version)
    }
    for (const [name, v] of Object.entries<{ version?: string }>(lock.dependencies ?? {})) {
      if (!out.has(name) && v.version) out.set(name, v.version)
    }
  } catch {
    // lockfile corrompido: cai no range declarado
  }
  return out
}

export function npmDependencies(file: string, root: string): Dependency[] {
  const pkg = JSON.parse(readFileSync(file, 'utf-8'))
  const locked = lockVersions(join(file, '..'))
  const rel = relative(root, file)
  const deps = (block: Record<string, string> | undefined, dev: boolean) => Object.entries(block ?? {})
    // file:, link:, workspace:, git e URL não estão num registry: não há o que consultar.
    .filter(([, range]) => !/^(file|link|workspace|git|github|https?):|\//.test(range))
    .map(([name, range]): Dependency => ({ ecosystem: 'npm', name, declared: range, version: locked.get(name) ?? exactFromRange(range), dev, file: rel }))
  return [...deps(pkg.dependencies, false), ...deps(pkg.devDependencies, true)]
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`))?.[1] ?? null

// Sem parser de XML: o pom é regular o bastante para regex. Bloco <dependencyManagement> e <plugins>
// ficam de fora, porque não são dependências do código.
export function mavenDependencies(file: string, root: string): Dependency[] {
  const xml = readFileSync(file, 'utf-8').replace(/<!--[\s\S]*?-->/g, '')
  const props = new Map<string, string>()
  const propsBlock = xml.match(/<properties>([\s\S]*?)<\/properties>/)?.[1] ?? ''
  for (const m of propsBlock.matchAll(/<([\w.-]+)>\s*([^<]*?)\s*<\/\1>/g)) props.set(m[1], m[2])
  const projectVersion = tag(xml.replace(/<parent>[\s\S]*?<\/parent>/, '').replace(/<dependencies>[\s\S]*$/, ''), 'version')
  if (projectVersion) props.set('project.version', projectVersion)
  const resolve = (v: string | null) => (v ? v.replace(/\$\{([^}]+)\}/g, (all, k) => props.get(k) ?? all) : null)

  const body = xml.replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, '').replace(/<build>[\s\S]*?<\/build>/g, '')
  const rel = relative(root, file)
  return [...body.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)].map(([, dep]) => {
    const declared = tag(dep, 'version')
    const resolved = resolve(declared)
    const scope = tag(dep, 'scope')
    return {
      ecosystem: 'Maven' as const,
      name: `${tag(dep, 'groupId')}:${tag(dep, 'artifactId')}`,
      declared: declared ?? '(do parent)',
      version: resolved && !resolved.includes('${') ? resolved : null,
      dev: scope === 'test',
      file: rel,
    }
  }).filter(d => !d.name.includes('null'))
}

export function readDependencies(root: string): { files: string[]; dependencies: Dependency[]; errors: string[] } {
  const files = findManifests(root)
  const errors: string[] = []
  const dependencies = files.flatMap(f => {
    try {
      return f.endsWith('pom.xml') ? mavenDependencies(f, root) : npmDependencies(f, root)
    } catch (e) {
      errors.push(`${relative(root, f)}: ${(e as Error).message}`)
      return []
    }
  })
  return { files: files.map(f => relative(root, f)), dependencies, errors }
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const root = mkdtempSync(join(tmpdir(), 'vulns-manifests-'))
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      dependencies: { express: '^5.2.1', lodash: '^4.17.0', local: 'file:../x', semverRange: '>=1 <3' },
      devDependencies: { vite: '8.3.1' },
    }))
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3,
      packages: { '': {}, 'node_modules/express': { version: '5.2.1' }, 'node_modules/lodash': { version: '4.17.21' }, 'node_modules/a/node_modules/lodash': { version: '3.0.0' } },
    }))
    mkdirSync(join(root, 'api'))
    writeFileSync(join(root, 'api', 'pom.xml'), `<project>
      <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.3.0</version></parent>
      <groupId>com.exemplo</groupId><artifactId>api</artifactId><version>1.0.0</version>
      <properties><jackson.version>2.15.2</jackson.version></properties>
      <dependencyManagement><dependencies><dependency><groupId>x</groupId><artifactId>bom</artifactId><version>9</version></dependency></dependencies></dependencyManagement>
      <dependencies>
        <dependency><groupId>com.fasterxml.jackson.core</groupId><artifactId>jackson-databind</artifactId><version>\${jackson.version}</version></dependency>
        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
        <!-- <dependency><groupId>comentado</groupId><artifactId>fora</artifactId><version>1</version></dependency> -->
        <dependency><groupId>junit</groupId><artifactId>junit</artifactId><version>4.12</version><scope>test</scope></dependency>
      </dependencies>
      <build><plugins><plugin><dependencies><dependency><groupId>p</groupId><artifactId>plugin-dep</artifactId><version>1</version></dependency></dependencies></plugin></plugins></build>
    </project>`)
    mkdirSync(join(root, 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'x', 'package.json'), '{}')

    const { files, dependencies: deps, errors } = readDependencies(root)
    assert.deepEqual(errors, [])
    assert.deepEqual(files.sort(), ['api/pom.xml', 'package.json'], 'node_modules fica de fora')
    const by = (n: string) => deps.find(d => d.name === n)
    assert.equal(by('express')?.version, '5.2.1')
    assert.equal(by('lodash')?.version, '4.17.21', 'versão do lockfile, não a aninhada')
    assert.equal(by('local'), undefined, 'file: não é consultável')
    assert.equal(by('semverRange')?.version, null, 'range sem lockfile fica sem versão')
    assert.deepEqual([by('vite')?.version, by('vite')?.dev], ['8.3.1', true])
    assert.equal(by('com.fasterxml.jackson.core:jackson-databind')?.version, '2.15.2', 'propriedade resolvida')
    assert.equal(by('org.springframework.boot:spring-boot-starter-web')?.version, null, 'versão do parent')
    assert.equal(by('junit:junit')?.dev, true)
    for (const n of ['comentado:fora', 'x:bom', 'p:plugin-dep']) assert.equal(by(n), undefined, `${n} não é dependência do código`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  console.log('vulns manifests selfcheck: ok')
}
