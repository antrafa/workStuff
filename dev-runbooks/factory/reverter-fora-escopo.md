# Reverter alteração fora do escopo na worktree

Desfaz, arquivo por arquivo, o que o agente mudou sem ter sido pedido, mantendo o resto da entrega. Mais barato que reprovar e rodar a tarefa de novo quando o problema é pontual.

**Quando usar:** a inspeção da entrega achou arquivo alterado que não devia (formatação em massa, config local, lockfile mexido sem dependência nova, arquivo de rascunho).

### Antes de começar
- `projeto`: pasta da **worktree da tarefa**, caminho completo.
- `branch_base`: branch base da tarefa.
- `arquivo`: caminho relativo do arquivo a reverter (ex.: `package-lock.json`). Um por vez.
- A reversão altera a worktree. O que for revertido sem commit não tem volta pelo Git.

### 1. Confirme o que mudou no arquivo
```bash
git diff {{branch_base}} -- {{arquivo}}
```
> Confira que nada nesse diff é necessário para a tarefa. Se metade é necessária, edite à mão em vez de reverter.

### 2a. Arquivo **existente** que foi alterado: volte à versão da base
```bash
git restore --source={{branch_base}} --staged --worktree -- {{arquivo}}
```

### 2b. Arquivo **novo** que não devia existir e não foi commitado
Arquivo não versionado não volta com `restore`. Remova do índice (se estiver lá) e apague pelo editor ou terminal:
```bash
git rm --cached -- {{arquivo}}
```

### 3. Confirme
```bash
git diff {{branch_base}} --stat
git status -s
```
> O arquivo não deve mais aparecer no diff contra a base.

### 4. Rode os portões de novo
Reverter um arquivo pode quebrar outro que dependia dele. Siga o runbook *Portões de aceitação* antes de aprovar.
