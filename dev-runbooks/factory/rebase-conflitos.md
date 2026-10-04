# Conflitos de rebase: resolver ou desistir com segurança

Guia a saída de um rebase que parou no meio por conflito, seja na worktree de uma tarefa ou na sua branch. O repositório fica num estado intermediário até você continuar ou abortar, e esse estado confunde a esteira.

**Quando usar:** `git status` mostra `rebase in progress` ou `You are currently rebasing`.

### Antes de começar
- `projeto`: pasta onde o rebase está acontecendo (worktree ou repositório).
- Em dúvida, **aborte** (passo 5): volta tudo exatamente como estava antes do rebase.

### 1. Em que ponto o rebase parou
```bash
git status
```
> A saída diz qual commit está sendo aplicado e lista os arquivos em `both modified`.

### 2. Quais arquivos estão em conflito
```bash
git diff --name-only --diff-filter=U
```

### 3. O conflito em si
```bash
git diff
```
> Entre `<<<<<<<` e `=======` está a versão da **base** (durante rebase, "ours" é a base). Entre `=======` e `>>>>>>>` está o commit da tarefa. Edite o arquivo no editor deixando a versão final correta e apague os marcadores.

### 4. Confirme que não sobrou marcador
```bash
git diff --check
```
> Qualquer linha com `leftover conflict marker` significa arquivo ainda não resolvido.

Depois de editar, marque cada arquivo como resolvido (substitua pelo caminho real) e continue:
```bash
git add {{arquivo}}
git rebase --continue
```
> Se o rebase parar de novo, é o próximo commit com conflito: volte ao passo 2.

### 5. Desistir e voltar ao estado anterior
```bash
git rebase --abort
```

### Pronto quando
```bash
git status -sb
git log --oneline -n 5
```
> Sem `rebase in progress` e com os commits da tarefa no topo. Rode os testes antes de publicar: resolver conflito errado não quebra o rebase, quebra o código.
