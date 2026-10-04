# Auditoria de Segurança e Verificação Pré-MR

Procedimento de auditoria e inspeção de segurança para a branch desenvolvida na Fábrica de Software, seguindo o padrão de revisão do agente Reviewer. Valida que nenhum segredo ou credencial foi comitado, nenhum arquivo temporário foi exposto e nenhuma vulnerabilidade crítica foi introduzida nas dependências.

### Parâmetros
- `projeto`: Diretório do repositório Git local
- `branch_base`: Nome da branch base de comparação (ex.: `main` ou `master`)

### Procedimento

1. Liste todos os commits criados na tarefa em comparação com a branch base:
```bash
git log {{branch_base}}..HEAD --oneline
```

2. Inspecione detalhadamente o diff completo à procura de credenciais, chaves de API, tokens ou funções inseguras:
```bash
git diff {{branch_base}}...HEAD
```

3. Verifique o status da árvore de trabalho para confirmar que nenhum arquivo temporário (`.env`, logs, dumps) ficou pendente:
```bash
git status -s
```

4. Execute uma auditoria de segurança das dependências do projeto para detectar vulnerabilidades conhecidas:
```bash
npm audit
```
