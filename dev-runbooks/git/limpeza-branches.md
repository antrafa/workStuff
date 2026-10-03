# Limpeza de Branches Locais Mergeadas

Procedimento para identificar e deletar branches locais que já foram incorporadas na branch principal (`main` ou `master`), liberando espaço e mantendo a lista de branches limpa.

### Parâmetros
- `projeto`: Diretório do repositório Git local
- `branch_base`: Nome da branch principal (ex.: `main` ou `master`)
- `branch`: Nome da branch local a ser removida (ex.: `feature/login-sso`)

### Procedimento

1. Verifique o status da working tree para garantir que não há alterações pendentes:
```bash
git status -s
```

2. Atualize as referências remotas e remova referências a branches já deletadas no servidor:
```bash
git fetch -p origin
```

3. Liste todas as branches locais que já foram mergeadas na branch principal:
```bash
git branch --merged {{branch_base}}
```

4. Remova a branch local selecionada com segurança (`-d` garante que só apaga se mergeada):
```bash
git branch -d {{branch}}
```
