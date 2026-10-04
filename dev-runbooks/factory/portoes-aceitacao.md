# Conferir à mão os portões de aceitação da esteira

Repete, na worktree da tarefa, as três verificações mecânicas que a Fábrica aplica antes de liberar uma entrega para revisão. Serve para entender por que um portão reprovou, ou para confirmar que uma correção manual passaria.

**Quando usar:** a tarefa voltou com portão reprovado, ou você corrigiu algo à mão na worktree e quer saber se a esteira aceitaria.

### Os três portões
| Portão | O que a esteira verifica | Reprova quando |
|---|---|---|
| Diff não vazio | arquivos alterados contra a base, commitados ou não | o agente não mudou nada |
| Artefatos existem | cada arquivo que o agente **disse** ter criado/alterado existe no disco | o agente citou um arquivo que não está lá |
| Testes | o comando de teste do projeto termina com sucesso | qualquer falha, ou mais de 10 minutos |

### Antes de começar
- `projeto`: pasta da **worktree da tarefa**, caminho completo (`/home/<você>/.workstuff/worktrees/<repo>/<id>`).
- `branch_base`: branch base da tarefa.

### 1. Portão: diff não vazio
A esteira soma o que está em `git status` com o diff contra a base.
```bash
git status --porcelain
git diff {{branch_base}} --name-only
```
> As duas saídas vazias: o portão reprova com razão. O agente não alterou arquivos; veja o log da execução para entender se ele só respondeu em texto.

### 2. Portão: artefatos declarados existem
Compare a lista de arquivos que o agente declarou (na tela de revisão da tarefa) com os arquivos realmente presentes:
```bash
git ls-files --others --exclude-standard
git diff {{branch_base}} --name-status
```
> Arquivo declarado que não aparece aqui nem existe no projeto: o agente **alucinou** a mudança. Não aprove; peça nova execução citando o arquivo.

### 3. Portão: testes
A esteira escolhe o comando pelo primeiro arquivo que encontrar: `package.json` → `npm test` (sem script `test`, o portão é **pulado**, não reprovado); `pom.xml` → `mvn test`; `pytest.ini`/`pyproject.toml` → `pytest`; `go.mod` → `go test ./...`. O limite é de 10 minutos. Rode o equivalente:
```bash
npm test
```
Para projetos Maven ou Go, use um destes no lugar:
```bash
mvn test
go test ./...
```
> `pytest` não roda pelo painel; use o terminal. Falha aqui: siga para o runbook *Portão de testes reprovado*.

### Pronto quando
- Diff com os arquivos esperados, todo artefato declarado presente e testes verdes.
