# Desfazer um commit

Escolhe a forma certa de desfazer um commit conforme ele já foi ou não publicado. O critério é simples: commit só local pode ser reescrito; commit publicado se desfaz com outro commit.

**Quando usar:** commitou na branch errada, commitou arquivo que não devia, mensagem errada, ou um commit já publicado quebrou algo.

### Antes de começar
- `projeto`: pasta do repositório.
- `commit`: hash do commit a reverter (só para o caminho B). Copie do passo 1.

### 1. Onde você está e o que foi publicado
```bash
git status -sb
git log --oneline -n 10
```
> `ahead N` no `status -sb`: os N commits mais recentes são só locais (caminho A). Sem `ahead`: o commit já está no remoto (caminho B).

### Caminho A: commit ainda não publicado
Desfaz o último commit e devolve as alterações para o índice, prontas para recommitar do jeito certo. Nada se perde.
```bash
git reset --soft HEAD^
git status -s
```
> Para só corrigir a mensagem ou incluir um arquivo esquecido, prefira `git commit --amend` depois do `git add`.

### Caminho B: commit já publicado
Cria um commit novo que desfaz o anterior. O histórico de quem já baixou a branch continua válido.
```bash
git show --stat {{commit}}
git revert --no-edit {{commit}}
```
> `revert` de commit de merge exige `-m 1`. Conflito no revert: resolva os arquivos, `git add` e `git revert --continue`.

### Confirme
```bash
git log --oneline -n 3
```

### Se apagou algo por engano
`git reset --hard` ou um `reset --soft` seguido de checkout podem descartar trabalho. Runbook *Recuperar trabalho perdido*.
