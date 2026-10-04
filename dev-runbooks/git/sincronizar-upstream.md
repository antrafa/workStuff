# Atualizar sua branch com a base (rebase)

Traz os commits novos da base para a sua branch reaplicando os seus por cima, o que deixa o histórico linear e o MR sem commits de merge.

**Quando usar:** sua branch de feature está atrás da base e você vai abrir ou atualizar o MR.

**Não use se:** a branch é compartilhada com outra pessoa. Rebase reescreve os commits; quem já tem a branch vai ter conflito no próximo pull. Nesse caso use `git merge origin/<base>`.

### Antes de começar
- `projeto`: pasta do repositório.
- `branch_base`: branch de referência (ex.: `main`).

### 1. Working tree limpa
```bash
git status -s
```
> Rebase não começa com alteração pendente. Commite ou use stash.

### 2. O que a base tem de novo
```bash
git fetch origin {{branch_base}}
git log --oneline HEAD..origin/{{branch_base}}
```
> Vazio: você já está atualizado, pare aqui.

### 3. Seus commits que serão reaplicados
```bash
git log --oneline origin/{{branch_base}}..HEAD
```

### 4. Rebase
```bash
git rebase origin/{{branch_base}}
```
> Parou com conflito: runbook *Conflitos de rebase* (serve para qualquer branch, não só da Fábrica).

### 5. Publicar a branch reescrita
Se a branch já estava no remoto, o push normal é recusado. `--force-with-lease` só sobrescreve se ninguém tiver publicado nada novo desde o seu último fetch:
```bash
git push --force-with-lease
```
