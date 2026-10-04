# Atualizar a branch da tarefa com a base

Reaplica os commits da tarefa sobre o topo atual da base. Evita que o MR nasça com conflito e garante que os testes rodem contra o código que de fato vai para produção.

**Quando usar:** a base recebeu commits depois que a tarefa começou e eles tocam arquivos da tarefa, ou o MR está marcado com conflito.

**Não use se:** a branch já foi publicada e outra pessoa trabalha nela. Rebase reescreve histórico; nesse caso faça merge da base.

### Antes de começar
- `projeto`: pasta da **worktree da tarefa** (ou do repositório com a branch em checkout).
- `branch_base`: branch base da tarefa.

### 1. Working tree limpa
```bash
git status -s
```
> Rebase não começa com alteração pendente. Commite (a esteira commita na aprovação) ou guarde com stash.

### 2. O que mudou na base e o que a tarefa tem
```bash
git fetch origin {{branch_base}}
git log --oneline HEAD..origin/{{branch_base}}
git log --oneline origin/{{branch_base}}..HEAD
```
> A primeira lista são os commits novos da base; a segunda, os da tarefa. Lista da base vazia: nada a fazer.

### 3. Arquivos tocados pelos dois lados (prováveis conflitos)
```bash
git diff --name-only HEAD...origin/{{branch_base}}
git diff --name-only origin/{{branch_base}}...HEAD
```
> Arquivos que aparecem nas duas listas são onde o conflito vai acontecer. Muitos em comum: considere refazer a tarefa a partir da base nova em vez de rebasear.

### 4. Rebase
```bash
git rebase origin/{{branch_base}}
```
> Parou com conflito: siga o runbook *Conflitos de rebase*.

### 5. Confirme e teste
```bash
git status -sb
npm test
```
> Branch já publicada antes do rebase vai exigir `git push --force-with-lease`. Faça isso só se a branch for só sua.
