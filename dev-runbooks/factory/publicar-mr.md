# Publicação Remota e Preparação de Merge Request

Procedimento para o agente Reviewer ou operador humano validar e publicar a branch de desenvolvimento da Fábrica de Software no repositório remoto configurado (GitLab ou GitHub), deixando o código pronto para abertura de Merge Request ou Pull Request.

### Parâmetros
- `projeto`: Diretório do repositório Git local ou da worktree
- `branch_base`: Nome da branch base remota (ex.: `main` ou `master`)
- `branch_fabrica`: Nome da branch local da fábrica a publicar (ex.: `factory/fac-123456789`)

### Procedimento

1. Inspecione o último commit gerado na tarefa e seu resumo de arquivos modificados:
```bash
git log -n 1 --stat
```

2. Exiba o balanço consolidado de adições e remoções frente à branch base:
```bash
git diff --stat {{branch_base}}...HEAD
```

3. Confirme que a árvore de trabalho está totalmente limpa e commitada:
```bash
git status -s
```

4. Envie a branch local para o servidor remoto com vinculação de rastreamento:
```bash
git push -u origin {{branch_fabrica}}
```
