# Mapeamento de Arquitetura e Dependências

Procedimento de análise e inventário arquitetural para o agente Architect ou desenvolvedor antes de iniciar o planejamento de novas funcionalidades ou refatorações estruturais. Permite mapear dependências diretas, versões desatualizadas e o histórico recente sem alterar código.

### Parâmetros
- `projeto`: Diretório do repositório Git local

### Procedimento

1. Inspecione o status da árvore de trabalho e branch atual:
```bash
git status -s
```

2. Consulte o histórico recente de commits para compreender as alterações arquiteturais mais recentes:
```bash
git log -n 5 --oneline
```

3. Liste as dependências diretas de primeiro nível do projeto:
```bash
npm list --depth=0
```

4. Verifique pacotes desatualizados ou com atualizações pendentes:
```bash
npm outdated
```

5. Realize auditoria estática de segurança nas dependências registradas:
```bash
npm audit
```
