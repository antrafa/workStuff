# Auditoria de segurança antes do MR

Procura, no que a tarefa adicionou, os problemas que mais vazam para produção: credencial no código, arquivo que não devia ser versionado e dependência nova com vulnerabilidade conhecida. Complementa a revisão do Reviewer; não a substitui.

**Quando usar:** antes de aprovar uma tarefa ou publicar a branch, sempre que o diff tocar configuração, autenticação, integração externa ou `package.json`.

### Antes de começar
- `projeto`: pasta da **worktree da tarefa** (`~/.workstuff/worktrees/<repo>/<tarefa>`, caminho completo) ou do repositório com a branch da tarefa em checkout.
- `branch_base`: branch base da tarefa (ex.: `main`).
- Todos os passos são leitura.

### 1. Quais arquivos entraram
```bash
git diff --stat origin/{{branch_base}}...HEAD
git diff --name-status origin/{{branch_base}}...HEAD
```
> Sinal de alerta na lista: `.env`, `*.pem`, `*.key`, `id_rsa`, `*.p12`, `*.sqlite`, dumps (`*.sql`, `*.bak`), `node_modules/`, `dist/`, arquivos de log. Qualquer um deles: **reprove** e use o runbook *Reverter alteração fora do escopo*.

### 2. Arquivos novos ainda não commitados
A esteira commita a worktree inteira na aprovação; o que está solto aqui vai junto.
```bash
git status -s
git ls-files --others --exclude-standard
```

### 3. Padrões de segredo nas linhas adicionadas
```bash
git diff -G 'password|passwd|secret|token|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}' --stat origin/{{branch_base}}...HEAD
git diff -G 'password|passwd|secret|token|api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}' origin/{{branch_base}}...HEAD
```
> O primeiro mostra **quais arquivos** têm linha casando com o padrão; o segundo mostra o diff desses arquivos. Leia cada ocorrência: nome de variável (`tokenExpirado`) é falso positivo; valor literal (`apiKey = 'sk-...'`) é vazamento. Segredo real commitado precisa ser **revogado**, não só apagado: ele continua no histórico da branch.

### 4. Construções perigosas introduzidas
```bash
git diff -G 'eval\(|new Function\(|child_process|exec\(|innerHTML|dangerouslySetInnerHTML|shell=True' origin/{{branch_base}}...HEAD
```
> Não é proibido por si, mas cada ocorrência precisa de entrada controlada. Concatenação de texto do usuário em comando, SQL ou HTML é bloqueio do MR.

### 5. Dependências novas e vulnerabilidades (projetos Node)
```bash
git diff origin/{{branch_base}}...HEAD -- package.json
npm audit --omit=dev
```
> Dependência nova sem justificativa no plano: questione. `high`/`critical` introduzida pela tarefa: reprove; pré-existente: registre e siga.

### Veredito
- **Aprovar:** nenhum arquivo sensível, nenhum segredo literal, dependências justificadas.
- **Reprovar:** qualquer segredo literal ou arquivo sensível. Informe o arquivo e a linha na revisão.
