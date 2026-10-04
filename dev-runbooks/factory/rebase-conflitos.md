# Diagnóstico e Resolução de Conflitos de Rebase

Procedimento para inspecionar, tratar ou abortar operações de rebase da branch de tarefa da Fábrica de Software em caso de divergências ou conflitos com a branch base (`main`). Garante que o desenvolvedor ou o agente Implementer consiga restabelecer a estabilidade do repositório.

### Parâmetros
- `projeto`: Diretório do repositório Git local ou pasta da worktree

### Procedimento

1. Verifique o status detalhado da operação de rebase e identifique a etapa atual:
```bash
git status
```

2. Identifique eventuais conflitos com marcadores de merge remanescentes:
```bash
git diff --check
```

3. Liste exclusivamente os arquivos com conflitos não resolvidos:
```bash
git diff --name-only --diff-filter=U
```

4. Caso decida descartar a tentativa de rebase e retornar a branch ao estado anterior seguro:
```bash
git rebase --abort
```

5. Caso todos os conflitos já tenham sido corrigidos e indexados:
```bash
git rebase --continue
```
