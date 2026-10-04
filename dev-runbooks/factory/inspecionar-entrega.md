# Inspecionar a entrega do agente antes de aprovar

Mostra o que o agente **realmente** mudou na worktree, independente do que ele disse no resumo. É o passo que mais evita aprovar trabalho incompleto, fora do escopo ou com arquivo indevido.

**Quando usar:** sempre antes de aprovar uma tarefa na Fábrica, e antes de rodar o Reviewer avulso.

### Antes de começar
- `projeto`: pasta da **worktree da tarefa**, caminho completo (`/home/<você>/.workstuff/worktrees/<repo>/<id>`). O caminho aparece na tela de revisão da tarefa.
- `branch_base`: branch base da tarefa.
- Tudo aqui é leitura.

### 1. Panorama: quantos arquivos, quanto mudou
```bash
git status -sb
git diff --stat {{branch_base}}
```
> `git diff` contra a base inclui o que está commitado e o que ainda não está (a esteira só commita na aprovação). Compare o tamanho com o pedido: uma correção de uma linha que mexeu em 30 arquivos merece explicação.

### 2. Arquivos novos
```bash
git ls-files --others --exclude-standard
```
> Arquivo novo que não aparece no plano do Architect: pergunte por quê. Arquivo de rascunho (`notes.md`, `test.js` solto, `*.orig`): remova antes de aprovar.

### 3. O diff completo
```bash
git diff {{branch_base}}
```
Leia procurando:
- mudança em arquivo que a tarefa não pedia (formatação em massa, renomeação gratuita);
- teste apagado ou com `skip`/`only` adicionado;
- `console.log`, `debugger`, `TODO` deixados pelo agente;
- tratamento de erro que engole a exceção (`catch {}`).

### 4. Espaços e marcadores de conflito
```bash
git diff --check {{branch_base}}
```
> Saída vazia é o esperado.

### 5. Commits que o agente fez (quando fez)
```bash
git log --oneline {{branch_base}}..HEAD
```

### Decisão
- **Aprovar:** escopo bate com o pedido, nada de rascunho, testes verdes (runbook *Portões de aceitação*).
- **Ajustar à mão:** um arquivo indevido ou uma linha de debug. Use *Reverter alteração fora do escopo* e aprove.
- **Reprovar:** comportamento errado ou escopo muito maior que o pedido. Peça nova execução citando os arquivos.
