# Gerenciamento e Aplicação de Stash

Procedimento para inspecionar, restaurar ou limpar alterações temporárias guardadas no `git stash`.

### Parâmetros
- `projeto`: Diretório do repositório Git
- `stash_id`: Identificador do stash (ex.: `stash@{0}`)

### Procedimento

1. Liste todos os stashes armazenados no repositório:
```bash
git stash list
```

2. Inspecione detalhadamente o diff e as alterações contidas no stash selecionado:
```bash
git stash show -p {{stash_id}}
```

3. Aplique as modificações do stash na sua árvore de trabalho atual:
```bash
git stash apply {{stash_id}}
```

4. Após conferir que as alterações foram aplicadas com sucesso, descarte o stash da pilha:
```bash
git stash drop {{stash_id}}
```
