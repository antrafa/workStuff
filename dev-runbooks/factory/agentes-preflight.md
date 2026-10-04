# Pre-flight do repositório antes de delegar aos agentes

Confirma que o repositório está num estado em que o trabalho dos agentes vai poder ser avaliado. Se o build ou os testes já falham **antes** da tarefa, o portão de testes da esteira vai reprovar a entrega por um problema que o agente não causou.

**Quando usar:** antes de criar uma tarefa na Fábrica ou de rodar o Architect/Implementer avulso num repositório.

**Não precisa se:** você rodou este pre-flight no mesmo repositório hoje e ninguém fez push na base desde então.

### Antes de começar
- `projeto`: pasta do repositório principal (não a worktree).
- `branch_base`: branch de onde a tarefa vai sair (`main`, `master`, `develop`…). Confirme no remoto; não presuma.

### 1. Working tree limpa
A worktree da tarefa nasce de `origin/<base>`, então alterações locais não entram nela, mas o merge local da aprovação **recusa** repositório com alteração pendente.
```bash
git status -s
```
> Saída vazia: siga. Qualquer linha: faça commit, `git stash` (runbook *Gerenciamento de stash*) ou descarte antes de continuar.

### 2. A branch base existe no remoto e está atualizada
```bash
git fetch origin {{branch_base}}
git log --oneline -n 5 origin/{{branch_base}}
```
> `couldn't find remote ref`: o nome da base está errado. Confira com `git branch -r`.

### 3. Sua branch local da base não divergiu do remoto
```bash
git log --oneline {{branch_base}}..origin/{{branch_base}}
git log --oneline origin/{{branch_base}}..{{branch_base}}
```
> Primeira lista com commits: sua base local está atrasada (inofensivo para a worktree, que usa `origin/`). Segunda lista com commits: há commit local **não publicado** na base; ele não vai para a tarefa. Publique ou mova para uma branch.

### 4. O projeto compila e os testes passam hoje
O portão de testes da esteira roda `npm test` (ou `mvn test` / `go test ./...` / `pytest`, conforme o projeto). Rode o mesmo comando aqui.
```bash
npm test
```
Se o projeto tiver checagem de tipos separada (script `typecheck` no `package.json`), rode também:
```bash
npm run typecheck
```
> Falhou aqui? **Não delegue ainda.** Corrija a base ou registre a falha conhecida na descrição da tarefa, senão o Tester vai gastar a execução tentando consertar algo fora do escopo.

### Pronto quando
- `git status -s` vazio, base buscada do remoto, testes verdes (ou falha pré-existente registrada na tarefa).
