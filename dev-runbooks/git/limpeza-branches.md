# Limpeza de branches locais já incorporadas

Apaga branches locais cujo conteúdo já está na base, e descobre as que perderam a branch remota. Lista longa de branches esconde as que ainda importam.

**Quando usar:** `git branch` não cabe mais na tela, ou você não sabe mais quais branches têm trabalho pendente.

### Antes de começar
- `projeto`: pasta do repositório.
- `branch_base`: branch principal (ex.: `main`).
- `branch`: preencha só no passo 5, com a branch escolhida.

### 1. Base local atualizada
`--merged` compara com a sua base **local**; base atrasada esconde branches que já poderiam sair.
```bash
git status -sb
git fetch -p origin
```
> `fetch -p` também apaga as referências `origin/*` de branches já removidas no servidor.

### 2. Branches já incorporadas na base
```bash
git branch --merged origin/{{branch_base}}
```
> Pode apagar qualquer uma desta lista, exceto a própria base e branches de longa duração (`develop`, `release/*`).

### 3. Branches cuja remota sumiu
```bash
git branch -vv
```
> `[origin/x: gone]`: o MR foi mergeado (ou a branch apagada) no servidor. Se usou *squash merge*, ela **não** aparece no passo 2, porque os commits mudaram de hash; confira que o MR foi mesmo mergeado.

### 4. Branches com trabalho que não está na base
```bash
git branch --no-merged origin/{{branch_base}}
```
> Estas têm commits únicos. Não apague sem olhar `git log origin/{{branch_base}}..<branch>`.

### 5. Apague a branch escolhida
`-d` recusa apagar branch com commit não incorporado (`not fully merged`), o que protege contra perda.
```bash
git branch -d {{branch}}
```
> Recusou e você tem certeza (ex.: squash merge)? A remoção forçada é `git branch -D`. Recuperação, se precisar: runbook *Recuperar trabalho perdido*.
