# Dependências Node quebradas: cache e reinstalação limpa

Resolve erros que somem quando "apaga o node_modules e instala de novo": versão diferente da do lockfile, pacote corrompido no cache, ou `package.json` alterado sem atualizar o lock.

**Quando usar:** `Cannot find module` logo após um pull, erro em pacote que funcionava ontem, ou CI passando e a sua máquina não (ou o contrário).

### Antes de começar
- `projeto`: pasta com o `package.json`.
- Se o projeto usa `pnpm-lock.yaml` ou `yarn.lock`, o equivalente de `npm ci` é `pnpm install --frozen-lockfile` / `yarn install --frozen-lockfile`.
- Worktrees da Fábrica usam o `node_modules` do repositório principal por link simbólico: reinstalar aqui afeta as tarefas abertas desse repositório.

### 1. Versões de Node e npm
```bash
npm version
```
> Compare com o campo `engines` do `package.json` ou com o `.nvmrc`. Node diferente do esperado é a causa mais comum de "na minha máquina não funciona".

### 2. Lockfile e package.json concordam?
```bash
npm ls --depth=0
```
> `missing`, `invalid` ou `extraneous`: o `node_modules` não bate com o que foi declarado. O passo 5 resolve.

### 3. O lockfile mudou no último pull?
```bash
git log --oneline -n 5 -- package-lock.json
git status -s -- package.json package-lock.json
```
> `package.json` alterado e lockfile não: alguém esqueceu de commitar o lock. `npm ci` vai falhar; nesse caso rode `npm install` e commite o lock gerado.

### 4. Integridade do cache
```bash
npm cache verify
```

### 5. Instalação limpa a partir do lockfile
`npm ci` apaga o `node_modules` e instala exatamente o que está no lock.
```bash
npm ci
```
> `npm ci can only install packages when your package.json and package-lock.json are in sync`: veja o passo 3.

### 6. Confirme
```bash
npm ls --depth=0
npm test
```
