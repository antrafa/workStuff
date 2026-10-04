# Verificação Manual de Portões de Aceitação

Procedimento para validação determinística dos critérios mecânicos de aceitação (Portões / Acceptance Gates) da Fábrica de Software. Permite ao desenvolvedor ou ao agente Tester inspecionar e comprovar manualmente que a branch atende aos requisitos de código alterado, integridade de tipos e suíte de testes antes do Merge Request.

### Parâmetros
- `projeto`: Diretório do repositório Git local
- `branch_base`: Nome da branch base de comparação (ex.: `main` ou `master`)

### Procedimento

1. Verifique os arquivos modificados e o saldo de adições/remoções na branch da tarefa (Portão: diff não-vazio):
```bash
git diff --stat {{branch_base}}...HEAD
```

2. Inspecione o diff completo das alterações implementadas para validação visual de clareza e escopo:
```bash
git diff {{branch_base}}...HEAD
```

3. Execute a validação estática de tipagem para certificar que nenhum contrato de interface foi quebrado:
```bash
npm run typecheck
```

4. Execute a suíte completa de testes automatizados do projeto (Portão: testes passando):
```bash
npm test
```
