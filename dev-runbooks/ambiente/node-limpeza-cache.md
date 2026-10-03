# Purga de Cache e Reinstalação de Dependências Node

Procedimento para resolver conflitos de dependências, corrupção de cache do gerenciador de pacotes ou divergência entre lockfile e node_modules.

### Parâmetros
- `projeto`: Pasta raiz do projeto contendo `package.json`

### Procedimento

1. Verifique a integridade do cache local do npm:
```bash
npm cache verify
```

2. Liste dependências desatualizadas no projeto:
```bash
npm outdated
```

3. Verifique vulnerabilidades conhecidas nas dependências declaradas:
```bash
npm audit
```

4. Execute uma instalação limpa e determinística baseada no lockfile (`package-lock.json`):
```bash
npm ci
```
