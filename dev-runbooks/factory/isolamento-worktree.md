# Criação e Isolamento de Git Worktree da Fábrica

Procedimento para provisionamento e preparação manual de uma Git Worktree isolada para o agente Implementer ou para reprodução local de tarefas da Fábrica de Software. Permite criar uma árvore de trabalho independente a partir de uma branch dedicada sem alterar o checkout do repositório principal.

### Parâmetros
- `projeto`: Diretório do repositório Git local
- `branch_base`: Nome da branch base de comparação (ex.: `main` ou `master`)
- `branch_fabrica`: Nome da branch dedicada da tarefa (ex.: `factory/tarefa-01`)
- `caminho_worktree`: Caminho absoluto ou relativo do diretório da worktree (ex.: `../worktrees/tarefa-01`)

### Procedimento

1. Verifique o status da árvore de trabalho atual:
```bash
git status -s
```

2. Consulte as worktrees atualmente registradas no repositório:
```bash
git worktree list --porcelain
```

3. Baixe e atualize as referências mais recentes da branch base:
```bash
git fetch origin {{branch_base}}
```

4. Crie a worktree isolada apontando para a nova branch da tarefa baseada no topo da branch base remota:
```bash
git worktree add -b {{branch_fabrica}} {{caminho_worktree}} origin/{{branch_base}}
```

5. Confirme a criação da nova worktree na lista do repositório:
```bash
git worktree list
```
