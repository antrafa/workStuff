# Sincronização de Branch com Upstream

Procedimento para atualizar a branch de desenvolvimento local com os últimos commits da branch principal (`main`/`master`) utilizando rebase limpo para manter histórico linear.

### Parâmetros
- `projeto`: Diretório do repositório Git
- `branch_base`: Branch principal de referência (ex.: `main` ou `master`)

### Procedimento

1. Verifique se há arquivos modificados ou unstaged na branch atual:
```bash
git status -s
```

2. Busque os commits mais recentes do remoto sem alterar sua árvore de trabalho:
```bash
git fetch origin {{branch_base}}
```

3. Inspecione quais commits a branch principal tem que ainda não estão na sua branch:
```bash
git log HEAD..origin/{{branch_base}} --oneline
```

4. Aplique o rebase da sua branch sobre a base mais recente:
```bash
git rebase origin/{{branch_base}}
```
