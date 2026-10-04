# Sincronização e Rebase de Branch de Fábrica

Procedimento para atualizar a branch da tarefa desenvolvida na Fábrica de Software em relação às atualizações recentes da branch principal (`main` ou `master`), garantindo histórico linear e evitando conflitos no momento da abertura do Merge Request.

### Parâmetros
- `projeto`: Diretório do repositório Git local
- `branch_base`: Nome da branch principal de comparação (ex.: `main` ou `master`)

### Procedimento

1. Atualize e baixe as referências mais recentes da branch remota:
```bash
git fetch origin {{branch_base}}
```

2. Consulte os commits mais recentes realizados pelos agentes na branch atual:
```bash
git log -n 5 --oneline
```

3. Execute o rebase dos commits da tarefa sobre o topo atualizado da branch base remota:
```bash
git rebase origin/{{branch_base}}
```

4. Verifique o status para confirmar a conclusão limpa do rebase ou identificar eventuais arquivos com conflito:
```bash
git status -s
```
