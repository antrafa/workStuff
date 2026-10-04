# Gerenciamento de stash: guardar, inspecionar e recuperar

Recupera alterações guardadas com `git stash` sem perder nada no caminho. O erro clássico é aplicar o stash errado, ou dar `drop` antes de conferir que a aplicação deu certo.

**Quando usar:** você guardou alterações para trocar de branch (ou a Fábrica pediu repositório limpo) e quer de volta, ou a lista de stashes cresceu e precisa de faxina.

### Antes de começar
- `projeto`: pasta do repositório.
- `stash_n`: número do stash na lista do passo 1 (`0` é o mais recente). O painel aceita só o número; `stash@{0}` e `0` são a mesma coisa para o Git.

### 1. Liste os stashes
```bash
git stash list
```
> Cada linha mostra a branch em que o stash foi criado e a mensagem. Stash sem mensagem aparece como `WIP on <branch>`: dê mensagem da próxima vez (`git stash push -m motivo`).

### 2. Veja o conteúdo antes de aplicar
```bash
git stash show --stat {{stash_n}}
git stash show -p {{stash_n}}
```

### 3. Confira o estado atual
```bash
git status -s
```
> Aplicar stash por cima de alterações nos mesmos arquivos gera conflito. Prefira aplicar com working tree limpa.

### 4. Aplique (mantendo o stash na lista)
`apply` não remove o stash: se der conflito, ele continua guardado.
```bash
git stash apply {{stash_n}}
```
> `CONFLICT`: resolva os arquivos como num merge. O stash continua na lista, nada se perdeu.

### 5. Confirme e só então descarte
```bash
git status -s
git stash drop {{stash_n}}
```
> Drop por engano? O hash do stash apagado aparece na saída do `drop` (`Dropped ... (abc1234)`). Recupere com `git stash apply abc1234` enquanto o Git não fizer limpeza.
