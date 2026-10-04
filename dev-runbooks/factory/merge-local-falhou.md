# Merge local da aprovação falhou

Resolve as duas falhas que impedem a Fábrica de fazer o merge local de uma tarefa aprovada. Na aprovação, a esteira faz checkout da branch de destino no seu repositório principal, roda `git merge --no-ff factory/<id>` e volta para a branch em que você estava. Se o merge conflita, ela aborta e mantém tudo como antes.

**Quando usar:** ao aprovar com merge local, a tela mostrou erro de alterações pendentes, de conflito, ou de branch em uso.

### Antes de começar
- `projeto`: pasta do repositório **principal** (não a worktree).
- `branch_base`: branch de destino do merge.
- `branch_fabrica`: `factory/<id-da-tarefa>`.

### 1. Repositório principal com alteração pendente
Erro: *"O repositório principal possui alterações pendentes não commitadas"*.
```bash
git status -s
```
> Linhas aqui bloqueiam o merge. Commite o que é seu, ou guarde temporariamente:
```bash
git stash push -u -m antes-do-merge-da-fabrica
```
> Depois do merge, recupere com o runbook *Gerenciamento de stash*.

### 2. A branch de destino está presa em outra worktree
Erro: *"is already checked out at"*.
```bash
git worktree list
```
> Se a branch de destino aparece numa worktree que não é o repositório principal, o checkout falha. Libere a worktree ou faça o merge a partir dela.

### 3. Conflito: quais arquivos os dois lados mexeram
```bash
git fetch origin {{branch_base}}
git diff --name-only {{branch_fabrica}}...{{branch_base}}
git diff --name-only {{branch_base}}...{{branch_fabrica}}
```
> Arquivos nas duas listas são os conflitantes. A esteira já abortou o merge; seu repositório está intacto.

### 4. Resolva na worktree, não no principal
Atualize a branch da tarefa com a base pelo runbook *Atualizar branch com a base* (com `projeto` apontando para a **worktree**), resolva os conflitos lá, rode os testes e aprove de novo na tela.

### 5. Confirme o estado do principal
```bash
git status -sb
git log --oneline -n 3
```
> Você deve estar na mesma branch em que estava antes, sem merge pela metade.
