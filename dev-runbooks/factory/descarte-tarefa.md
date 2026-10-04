# Descarte e Recuperação de Tarefa de Fábrica

Procedimento de contingência para remoção forçada e limpeza atômica de uma tarefa da Fábrica de Software com erro irrecuperável ou cancelada pelo usuário. Garante a desalocação completa da Git Worktree e exclusão da branch temporária sem deixar resíduos no disco ou no repositório principal.

### Parâmetros
- `projeto`: Diretório do repositório Git local
- `caminho_worktree`: Caminho da pasta da worktree a remover (ex.: `~/.workstuff/worktrees/repo/fac-12345`)
- `branch_fabrica`: Nome da branch temporária da fábrica a deletar (ex.: `factory/fac-12345`)

### Procedimento

1. Liste todas as worktrees registradas para confirmar o caminho e branch vinculada à tarefa:
```bash
git worktree list
```

2. Remova forçadamente o vínculo da worktree da tarefa cancelada:
```bash
git worktree remove --force {{caminho_worktree}}
```

3. Execute a poda administrativa dos metadados de worktrees excluídas:
```bash
git worktree prune -v
```

4. Exclua a branch local temporária da tarefa:
```bash
git branch -D {{branch_fabrica}}
```

5. Confirme que o status do repositório principal permanece limpo e consistente:
```bash
git status -s
```
