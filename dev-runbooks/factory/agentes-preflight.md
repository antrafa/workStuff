# Pre-flight Check do Repositório para Agentes da Fábrica

Procedimento de verificação e validação prévia de sanidade do ambiente local antes de delegar demandas de desenvolvimento aos agentes da Fábrica (Architect, Implementer, Tester e Reviewer). Assegura que a working tree está limpa, as referências remotas estão atualizadas e o projeto compila sem erros pré-existentes.

### Parâmetros
- `projeto`: Diretório do repositório Git local
- `branch_base`: Nome da branch principal do projeto (ex.: `main` ou `master`)

### Procedimento

1. Verifique o status da working tree para certificar que não há alterações pendentes ou arquivos não commitados:
```bash
git status -s
```

2. Sincronize as referências remotas da branch base do repositório:
```bash
git fetch origin {{branch_base}}
```

3. Execute a checagem estática de tipos para garantir que o projeto compila sem falhas de TypeScript:
```bash
npm run typecheck
```

4. Execute a suíte de testes existente para certificar que todos os testes unitários já estão verdes:
```bash
npm test
```
