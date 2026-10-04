# Execução de Testes e Validação de QA

Procedimento para o agente Tester ou engenheiro de QA inspecionar o escopo de alterações de uma tarefa da Fábrica e rodar a validação determinística de testes automatizados e checagem de tipos na worktree isolada.

### Parâmetros
- `projeto`: Diretório da Git Worktree ou repositório local
- `branch_base`: Nome da branch base de comparação (ex.: `main` ou `master`)

### Procedimento

1. Mapeie os arquivos alterados na branch de trabalho para identificar o que deve ser coberto:
```bash
git diff --name-only {{branch_base}}...HEAD
```

2. Verifique o status dos arquivos na árvore de trabalho local:
```bash
git status -s
```

3. Execute a checagem estática de tipos do projeto:
```bash
npm run typecheck
```

4. Execute a suíte automatizada de testes do projeto:
```bash
npm test
```
