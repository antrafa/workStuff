# Publicar a branch da tarefa para abrir o MR

Envia a branch da tarefa ao remoto depois de conferir que o que vai subir é exatamente a entrega revisada: sem arquivo solto, sem commit estranho, sem atraso grande em relação à base.

**Quando usar:** a tarefa foi aprovada e você vai abrir o MR/PR à mão, ou a publicação automática da Fábrica falhou.

### Antes de começar
- `projeto`: pasta da **worktree da tarefa** (caminho completo).
- `branch_base`: branch de destino do MR.
- `branch_fabrica`: `factory/<id-da-tarefa>`. Se o time exige outro padrão de nome no remoto, renomeie antes (`git branch -m`).
- Publicar é ação **externa**: dispara pipeline e fica visível para o time.

### 1. Tudo commitado
```bash
git status -s
```
> Linhas aqui não vão no push. Se fazem parte da entrega, commite; se não, descarte.

### 2. Os commits que vão subir
```bash
git log --oneline origin/{{branch_base}}..HEAD
git diff --stat origin/{{branch_base}}...HEAD
```
> Confira se a lista de arquivos bate com o que foi revisado. Arquivo inesperado: volte ao runbook *Inspecionar a entrega*.

### 3. A base andou desde que a tarefa começou?
```bash
git fetch origin {{branch_base}}
git log --oneline HEAD..origin/{{branch_base}}
```
> Commits listados: a base avançou. Se forem muitos ou tocarem os mesmos arquivos, rode antes o runbook *Atualizar branch com a base* para o MR não nascer com conflito.

### 4. Publique
```bash
git push -u origin {{branch_fabrica}}
```
> `rejected (non-fast-forward)`: já existe uma branch com esse nome no remoto com outro histórico. **Não** force. Confira quem a criou e escolha outro nome.
> A saída do GitLab/GitHub traz o link para abrir o MR.

### Descrição do MR
Use o resumo do Reviewer e responda: o que mudou, por quê, e como validar. Declare o que ficou fora do escopo.
