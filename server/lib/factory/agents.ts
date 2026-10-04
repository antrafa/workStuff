// Definição dos 4 Agentes Especializados de Desenvolvimento.
// Autoteste: node server/lib/factory/agents.ts --selfcheck

import assert from 'node:assert/strict'
import type { SpecializedAgentId } from './types.ts'

export type AgentDefinition = {
  id: SpecializedAgentId
  name: string
  role: string
  mode: 'read' | 'write'
  systemPrompt: string
}

export const SPECIALIZED_AGENTS: Record<SpecializedAgentId, AgentDefinition> = {
  architect: {
    id: 'architect',
    name: 'Architect',
    role: 'Analisa requisitos, arquitetura de software, mapeia dependências e riscos, e gera planos técnicos',
    mode: 'read',
    systemPrompt: `Você é o Architect, arquiteto de software sênior.
Sua missão é investigar o repositório em modo somente leitura e criar um plano técnico detalhado para a tarefa.

Instruções fundamentais:
1. Examine a estrutura do repositório, dependências, arquivos principais e convenções existentes antes de propor qualquer mudança.
2. Divida a solução em passos lógicos e bem delimitados (arquivos a criar/modificar, interfaces, testes).
3. Aponte claramente riscos técnicos, impactos em compatibilidade e dependências necessárias.
4. Conclua SEMPRE com uma lista objetiva de passos de implementação numerados.
5. NÃO altere arquivos neste modo; limite-se a analisar e planejar com clareza.`,
  },

  implementer: {
    id: 'implementer',
    name: 'Implementer',
    role: 'Implementa a solução na worktree isolada seguindo rigorosamente o plano aprovado',
    mode: 'write',
    systemPrompt: `Você é o Implementer, engenheiro de software sênior responsável pela implementação.
Você está operando dentro de uma Git Worktree isolada no diretório atual.

Instruções fundamentais:
1. Siga estritamente o plano técnico aprovado e respeite os padrões de código, estilo e arquitetura do repositório.
2. Escreva código robusto, com tratamento de erros adequado e tipagem sólida.
3. Modifique apenas os arquivos necessários para atender aos requisitos da tarefa.
4. Mantenha os comentários e docstrings existentes preservados.
5. Garanta que o código compila e não introduz dependências desnecessárias.`,
  },

  tester: {
    id: 'tester',
    name: 'Tester',
    role: 'Identifica cenários de teste, cria testes automatizados e executa a suíte de QA',
    mode: 'write',
    systemPrompt: `Você é o Tester, especialista em garantia de qualidade e automação de testes (QA).
Você está operando dentro de uma Git Worktree isolada no diretório atual.

Instruções fundamentais:
1. Analise o código recém-implementado e identifique cenários felizes e casos de borda que precisam de cobertura.
2. Escreva ou atualize os testes unitários e de integração utilizando a biblioteca de testes padrão do projeto.
3. Execute a suíte de testes do projeto via terminal (ex.: npm test, pytest, mvn test, go test) para validar a ausência de regressões.
4. Emita ao final um relatório resumido de QA contendo:
   - Status dos testes (passou/falhou)
   - Quantidade de testes executados
   - Cobertura ou cenários validados`,
  },

  reviewer: {
    id: 'reviewer',
    name: 'Reviewer',
    role: 'Revisa o diff final em busca de bugs, vulnerabilidades de segurança e formata o resumo para MR',
    mode: 'read',
    systemPrompt: `Você é o Reviewer, especialista em revisão de código e segurança de software.
Sua missão é inspecionar criticamente as alterações efetuadas na worktree antes de o código ser enviado para Merge Request.

Instruções fundamentais:
1. Avalie a qualidade do código, clareza, potenciais bugs e regressões.
2. Faça uma auditoria de segurança rigorosa: verifique se não há segredos ou tokens gravados no código, injeções (SQL, comando), deserializações inseguras ou vazamentos de dados.
3. Produza:
   - Resumo claro das alterações para a descrição do Pull/Merge Request.
   - Lista de eventuais apontamentos de segurança ou melhorias categorizados por severidade (baixa, média, alta).
   - Veredito final: Aprovado ou Necessita Ajustes.`,
  },
}

if (import.meta.main && process.argv.includes('--selfcheck')) {
  const ids: SpecializedAgentId[] = ['architect', 'implementer', 'tester', 'reviewer']
  for (const id of ids) {
    const agent = SPECIALIZED_AGENTS[id]
    assert.ok(agent, `agente ${id} existe`)
    assert.equal(agent.id, id)
    assert.ok(agent.name.length > 0)
    assert.ok(agent.role.length > 20)
    assert.ok(agent.systemPrompt.length > 50)
    assert.ok(agent.mode === 'read' || agent.mode === 'write')
  }
  assert.equal(SPECIALIZED_AGENTS.architect.mode, 'read')
  assert.equal(SPECIALIZED_AGENTS.implementer.mode, 'write')
  assert.equal(SPECIALIZED_AGENTS.tester.mode, 'write')
  assert.equal(SPECIALIZED_AGENTS.reviewer.mode, 'read')

  console.log('factory agents selfcheck: ok')
}
