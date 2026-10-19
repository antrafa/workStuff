// Gancho PreToolUse do Claude Code para o Cluster Doctor: roda antes de cada comando Bash do agente e
// só libera leitura aceita por command.ts. Escrita nunca roda pelo agente: ele propõe, o usuário confirma
// na tela e o servidor executa. Qualquer entrada ilegível é negada.
// Autoteste: node server/lib/doctorAi/hook.ts --selfcheck

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { decide } from './command.ts'
import { appendAudit } from '../auditLog.ts'

type HookInput = { tool_name?: string; tool_input?: { command?: unknown } }

export function hookDecision(input: HookInput): { decision: 'allow' | 'deny'; reason: string } {
  if (input.tool_name !== 'Bash') return { decision: 'deny', reason: 'só a ferramenta Bash passa por este gancho' }
  const command = typeof input.tool_input?.command === 'string' ? input.tool_input.command : ''
  const d = decide(command)
  if (!d.ok) return { decision: 'deny', reason: `Bloqueado pelo workStuff: ${d.reason}.` }
  if (d.action !== 'read') {
    return { decision: 'deny', reason: `Ação de escrita (${d.action}) não roda por aqui. Proponha o comando exato num bloco \`\`\`bash na resposta; o usuário confirma na tela e o painel executa.` }
  }
  return { decision: 'allow', reason: 'leitura permitida' }
}

async function readStdin() {
  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const self = fileURLToPath(import.meta.url)
  const run = (input: unknown) => {
    const r = spawnSync(process.execPath, [self], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf-8' })
    return JSON.parse(r.stdout).hookSpecificOutput as { permissionDecision: string; permissionDecisionReason: string }
  }
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'kubectl get pods -n x' } }).permissionDecision, 'allow')
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'kubectl get pods; rm -rf /' } }).permissionDecision, 'deny')
  const restart = run({ tool_name: 'Bash', tool_input: { command: 'kubectl rollout restart deployment/x -n y' } })
  assert.equal(restart.permissionDecision, 'deny')
  assert.match(restart.permissionDecisionReason, /Proponha o comando/)
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'curl http://x' } }).permissionDecision, 'deny')
  assert.equal(run('isto não é json').permissionDecision, 'deny', 'entrada ilegível é negada')
  assert.equal(run({ tool_name: 'Write', tool_input: {} }).permissionDecision, 'deny')
  console.log('doctor hook selfcheck: ok')
} else if (import.meta.main) {
  let input: HookInput = {}
  try {
    input = JSON.parse(await readStdin())
  } catch {
    input = {}
  }
  const { decision, reason } = hookDecision(input)
  // Trilha de auditoria: tudo o que o agente tentou rodar no cluster, e o que foi decidido.
  const audit = process.env.WORKSTUFF_DOCTOR_AUDIT
  if (audit) {
    try {
      appendAudit(audit, { context: process.env.WORKSTUFF_DOCTOR_SCOPE, command: input.tool_input?.command ?? null, decision, reason })
    } catch {
      // auditoria indisponível não pode liberar nem travar o comando: a decisão acima já está tomada
    }
  }
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }))
}
