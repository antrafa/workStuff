# Limpeza e Diagnóstico de Worktrees da Fábrica

Procedimento para identificar, inspecionar e limpar worktrees temporárias e referências órfãs criadas pela esteira da Fábrica de Software em `~/.workstuff/worktrees/`, além de remover branches locais de tarefas já finalizadas ou descartadas.

### Parâmetros
- `projeto`: Diretório do repositório Git local
- `branch_fabrica`: Nome da branch de fábrica local a ser removida (ex.: `factory/fac-123456789`)

### Procedimento

1. Verifique o status da working tree para garantir que não há modificações pendentes no checkout atual:
```bash
git status -s
```

2. Liste todas as worktrees ativas vinculadas a este repositório com seus respectivos diretórios e branches:
```bash
git worktree list
```

3. Exiba os detalhes completos das worktrees no formato detalhado (porcelain) para identificar diretórios bloqueados ou inacessíveis:
```bash
git worktree list --porcelain
```

4. Remova com segurança as referências de metadados das worktrees cujas pastas físicas já foram excluídas do disco:
```bash
git worktree prune -v
```

5. Liste todas as branches locais criadas pela Fábrica de Software:
```bash
git branch --list 'factory/*'
```

6. Remova a branch de fábrica selecionada (garantindo que já foi incorporada ou descartada):
```bash
git branch -d {{branch_fabrica}}
```
