import { spawn } from 'node:child_process'
import { diagnose, type CheckResult } from './checks.ts'

export class FixRefused extends Error {}

// O navegador manda só o identificador (grupo|item); o comando sai da tabela do diagnóstico, nunca do
// pedido. Aceitar comando vindo da tela seria execução arbitrária pela porta do painel.
export async function resolveFix(grupo: unknown, item: unknown): Promise<CheckResult> {
  if (typeof grupo !== 'string' || typeof item !== 'string') throw new FixRefused('informe grupo e item')
  const target = (await diagnose()).find(r => r.grupo === grupo && r.item === item)
  if (!target) throw new FixRefused(`item não encontrado no diagnóstico: ${grupo} / ${item}`)
  if (target.status === 'ok') throw new FixRefused(`${item} já está ok; nada a fazer`)
  if (target.execucao !== 'auto') throw new FixRefused(`${item} não é resolvível pelo painel (precisa de sudo, terminal ou ação sua): ${target.correcao}`)
  return target
}

// sdk e nvm são funções de shell, não binários: sem carregar os inits o comando da tabela não existe.
const PRELUDE = [
  'export sdkman_auto_answer=true', // sem terminal, o "set as default?" do sdkman travaria
  '[ -s "$HOME/.sdkman/bin/sdkman-init.sh" ] && source "$HOME/.sdkman/bin/sdkman-init.sh"',
  'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"',
].join('\n')

export function runFix(fix: CheckResult, cwd: string, onLine: (line: string) => void, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', `${PRELUDE}\n${fix.correcao}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const forward = (chunk: Buffer) => chunk.toString('utf-8').split('\n').filter(Boolean).forEach(onLine)
    child.stdout.on('data', forward)
    child.stderr.on('data', forward)
    signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true })
    child.on('error', reject)
    child.on('close', code => resolve(code ?? -1))
  })
}
