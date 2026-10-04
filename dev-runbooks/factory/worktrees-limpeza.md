# Limpeza geral de worktrees e branches da Fábrica

Encontra o lixo que a esteira deixa com o tempo: worktrees de tarefas já concluídas ou excluídas, registros de worktree cuja pasta sumiu e branches `factory/*` sem dono. Para remover **uma** tarefa específica, use *Descartar uma tarefa da Fábrica manualmente*.

**Quando usar:** disco enchendo em `~/.workstuff/worktrees/`, lista de branches poluída, ou erro `already checked out` ao criar tarefa.

### Antes de começar
- `projeto`: pasta do repositório **principal**.
- `branch_base`: branch principal (ex.: `main`).
- `branch_fabrica`: preencha só no passo 5, com a branch que decidiu apagar.

### 1. Worktrees registradas
```bash
git worktree list
```
> Linhas com caminho em `.workstuff/worktrees/` são da Fábrica. Compare os ids com as tarefas ainda abertas na tela da Fábrica: as que não têm tarefa são lixo.

### 2. Registros órfãos e travados
```bash
git worktree list --porcelain
```
> `prunable`: a pasta não existe mais (o passo 3 limpa). `locked`: alguém travou de propósito; não mexa sem saber o motivo.

### 3. Limpe os registros órfãos
```bash
git worktree prune -v
```

### 4. Branches da Fábrica e o que já foi incorporado
```bash
git branch --list 'factory/*' -vv
git branch --merged {{branch_base}} --list 'factory/*'
```
> A segunda lista são branches cujo conteúdo já está na base: pode apagar com segurança. Branch fora dela tem commit que não foi para a base; confirme que a tarefa foi descartada antes.

### 5. Apague a branch escolhida
`-d` só apaga se já estiver incorporada; recusa com `not fully merged` caso contrário (aí use o runbook de descarte, que usa `-D`).
```bash
git branch -d {{branch_fabrica}}
```
> `checked out at`: a worktree dela ainda existe. Remova a worktree primeiro (runbook de descarte, passo 3).

### 6. Confirme
```bash
git worktree list
git branch --list 'factory/*'
```
