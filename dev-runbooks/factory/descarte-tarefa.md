# Descartar uma tarefa da Fábrica manualmente

Remove a worktree e a branch de uma tarefa que travou, falhou sem conserto ou foi cancelada, quando a exclusão pela tela da Fábrica não limpou tudo (pasta presa, branch que sobrou, erro de "already checked out").

**Quando usar:** a tela da Fábrica falhou ao excluir a tarefa, ou `git worktree list` ainda mostra a worktree de uma tarefa que já não existe.

**Prefira a tela:** o botão de excluir tarefa da Fábrica faz exatamente isto. Use o runbook só quando ele falhar.

**Irreversível:** commits que só existem na branch da tarefa somem da lista de branches. Ainda dá para recuperar por algumas semanas via `git reflog` (runbook *Recuperar trabalho perdido*), mas não conte com isso.

### Antes de começar
- `projeto`: pasta do repositório **principal** (não a worktree).
- `caminho_worktree`: caminho **completo** da worktree, sem `~` (copie da saída do passo 1). Padrão da Fábrica: `/home/<você>/.workstuff/worktrees/<repo>/<id-da-tarefa>`.
- `branch_fabrica`: `factory/<id-da-tarefa>`.

### 1. Confirme a worktree e a branch da tarefa
```bash
git worktree list
```
> Localize a linha cujo caminho termina no id da tarefa e confira que a branch entre colchetes é `factory/<id>`. Se for outra branch, **pare**: o caminho está errado.

### 2. Veja se há trabalho que vale guardar
```bash
git log --oneline {{branch_fabrica}} --not --remotes
```
> Commits listados não estão em nenhuma branch remota: existem só aqui. Se algum vale a pena, publique antes (`git push -u origin {{branch_fabrica}}`) ou crie uma branch com outro nome a partir dela.

### 3. Remova a worktree
`--force` é necessário porque a Fábrica deixa `node_modules` como link simbólico e arquivos não commitados dentro dela.
```bash
git worktree remove --force {{caminho_worktree}}
```
> `is not a working tree`: a pasta já foi apagada à mão; o passo 4 limpa o registro órfão.

### 4. Limpe registros de worktrees cuja pasta não existe mais
```bash
git worktree prune -v
```

### 5. Apague a branch da tarefa
`-D` apaga mesmo sem merge; é o esperado para tarefa descartada.
```bash
git branch -D {{branch_fabrica}}
```

### 6. Confirme
```bash
git worktree list
git branch --list 'factory/*'
```
> A tarefa não pode aparecer em nenhuma das duas listas.
