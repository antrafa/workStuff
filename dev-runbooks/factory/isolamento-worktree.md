# Criar uma worktree isolada para reproduzir uma tarefa

Cria, à mão, o mesmo isolamento que a Fábrica usa: uma pasta separada com uma branch própria saindo de `origin/<base>`, sem tocar no checkout em que você está trabalhando.

**Quando usar:** para reproduzir localmente o que um agente fez, testar uma ideia sem sujar sua branch, ou rodar o Implementer avulso numa pasta descartável.

### Antes de começar
- `projeto`: pasta do repositório **principal**.
- `branch_base`: branch de onde sair (ex.: `main`).
- `branch_fabrica`: nome da nova branch. Use um nome que diga a entrega (`teste/retry-http`). Evite o prefixo `factory/`, reservado para as tarefas da esteira.
- `caminho_worktree`: pasta nova, caminho completo sem `~` (ex.: `/home/<você>/worktrees/retry-http`). Ela **não pode existir** ainda.

### 1. Estado atual
```bash
git status -s
git worktree list
```
> A worktree não depende do seu checkout estar limpo, mas confira que `caminho_worktree` não aparece na lista.

### 2. Base atualizada
```bash
git fetch origin {{branch_base}}
```

### 3. Crie a worktree com a branch nova
```bash
git worktree add -b {{branch_fabrica}} {{caminho_worktree}} origin/{{branch_base}}
```
> `a branch named ... already exists`: escolha outro nome ou, se quiser reaproveitar a branch, use `git worktree add {{caminho_worktree}} {{branch_fabrica}}`.
> `is already checked out at`: essa branch já está em outra worktree; uma branch só pode estar em uma worktree por vez.

### 4. Confirme
```bash
git worktree list
```

### Depois de criar
- A worktree **não** tem `node_modules`. A Fábrica cria um link simbólico para o `node_modules` do repositório principal; à mão, rode `npm ci` com `projeto` apontando para a worktree.
- Para remover quando terminar: runbook *Descartar uma tarefa da Fábrica manualmente*, passos 3 a 5.
