# Portão de testes reprovado: reproduzir e isolar a falha

Reproduz na worktree a falha que reprovou o portão de testes e separa as duas causas que exigem ações diferentes: o agente quebrou algo, ou o teste já falhava antes da tarefa.

**Quando usar:** a tarefa voltou com o portão de testes reprovado, ou o Tester relatou falha.

### Antes de começar
- `projeto`: pasta da **worktree da tarefa**, caminho completo.
- `branch_base`: branch base da tarefa.
- A worktree usa o `node_modules` do repositório principal por link simbólico. Se você atualizou dependências no principal depois de criar a tarefa, a worktree enxerga as versões novas.

### 1. O que a tarefa mudou
```bash
git diff --stat {{branch_base}}
git diff {{branch_base}} --name-only
```
> Guarde a lista: um teste que falha **fora** desses arquivos e sem relação com eles sugere falha pré-existente ou de ambiente.

### 2. Reproduza a falha
```bash
npm test
```
> Leia a primeira falha, não a última: erros em cascata costumam vir de uma só causa. Passou aqui mas falhou na esteira? Provável estouro de tempo ou teste instável (rode de novo duas vezes).

### 3. A falha já existia na base?
Com `projeto` apontando para o **repositório principal**, na branch base, rode o mesmo comando:
```bash
npm test
```
> **Falha também na base:** não é culpa do agente. Registre na tarefa e decida se corrige a base antes ou se aceita a entrega com a falha conhecida.
> **Passa na base:** o agente quebrou. Siga para o passo 4.

### 4. Encontre o arquivo responsável
Compare o diff do arquivo de produção que o teste exercita:
```bash
git diff {{branch_base}} -- {{arquivo}}
```
> `arquivo`: caminho relativo de um dos arquivos do passo 1 (ex.: `src/lib/api.ts`).

### Decisão
- Correção pequena e óbvia: corrija na worktree e confira de novo com o runbook *Portões de aceitação*.
- Mudança de comportamento não pedida: reprove e peça nova execução ao Implementer citando o teste e o arquivo.
- Arquivo fora do escopo causando a quebra: runbook *Reverter alteração fora do escopo*.
