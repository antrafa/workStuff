# Mapa de arquitetura e dependências antes de planejar

Levanta, sem alterar nada, o que o Architect precisa para propor um plano realista: o que mudou recentemente, quais áreas do código mexem mais, quais dependências o projeto usa e quais estão velhas ou vulneráveis.

**Quando usar:** antes de pedir um plano ao Architect, ou para conferir se o plano dele considerou o estado real do projeto.

### Antes de começar
- `projeto`: pasta do repositório.
- `branch_base`: branch principal (ex.: `main`).
- Todos os passos são leitura. Nada aqui altera o repositório.

### 1. Onde o projeto está agora
```bash
git status -sb
git log --oneline -n 15 origin/{{branch_base}}
```
> Procure no histórico refatorações grandes ou migrações em andamento: um plano que ignora uma migração pela metade costuma gerar conflito.

### 2. Quais arquivos mudam com mais frequência (pontos quentes)
```bash
git log --since=60.days --name-only --format= origin/{{branch_base}}
```
> Arquivos que aparecem muito são onde a tarefa tem mais chance de colidir com outro trabalho. Cite-os no plano como risco.

### 3. Quem conhece cada área
```bash
git shortlog -sn --since=180.days origin/{{branch_base}}
```

### 4. Estrutura versionada do projeto
```bash
git ls-files
```
> Use para confirmar se existem testes perto da área afetada e qual é a convenção de pastas.

### 5. Dependências diretas, desatualizadas e vulneráveis (projetos Node)
```bash
npm ls --depth=0
npm outdated
npm audit --omit=dev
```
> `npm outdated` e `npm audit` terminam com erro (saída em vermelho) quando encontram algo: é o resultado, não uma falha do comando.
> `npm outdated` mostra *Current*, *Wanted* (o máximo que o semver do `package.json` aceita) e *Latest*. Diferença em versão **major** entre Wanted e Latest é atualização com quebra: não entra no escopo da tarefa sem pedido explícito. `npm audit` com `high`/`critical` em dependência de produção merece issue própria.

### O que levar para o plano
- Arquivos quentes que a tarefa toca (risco de conflito).
- Dependências que a tarefa precisaria adicionar ou atualizar, com justificativa.
- Se existe ou não teste na área (o Tester vai precisar saber).
