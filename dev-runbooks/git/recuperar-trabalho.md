# Recuperar trabalho perdido com o reflog

Recupera commits que sumiram depois de `reset --hard`, rebase que deu errado, branch apagada com `-D` ou worktree da Fábrica descartada. O Git guarda por onde o `HEAD` e cada branch passaram (o *reflog*) por cerca de 90 dias.

**Quando usar:** "meu commit sumiu", "apaguei a branch errada", "o rebase comeu minhas alterações".

**Não recupera:** alteração que nunca foi commitada nem guardada em stash.

### Antes de começar
- `projeto`: pasta do repositório (para worktree da Fábrica apagada, o repositório **principal**: o reflog é compartilhado).
- `commit`: hash encontrado no passo 1 ou 2.
- `nova_branch`: nome da branch de resgate (ex.: `resgate/login`).

### 1. Por onde o HEAD passou
```bash
git reflog -n 40 --date=relative
```
> Procure a linha **anterior** ao desastre: `reset: moving to`, `rebase (start)`, `checkout: moving from`. O hash à esquerda é o estado que você quer.

### 2. Commits soltos (branch apagada)
Branch apagada não deixa rastro no reflog do HEAD se você nunca fez checkout dela (caso das branches `factory/*`). Procure os commits que não estão em nenhuma branch:
```bash
git fsck --no-reflogs
```
> As linhas `dangling commit <hash>` são candidatos. Veja cada um no passo 3.

### 3. Confira o conteúdo antes de resgatar
```bash
git show --stat {{commit}}
git log --oneline -n 5 {{commit}}
```

### 4. Resgate numa branch nova
Criar branch nova não mexe na sua branch atual; é o jeito seguro.
```bash
git branch {{nova_branch}} {{commit}}
git log --oneline -n 5 {{nova_branch}}
```
> A partir daqui, faça merge, cherry-pick ou só compare com a branch original.
