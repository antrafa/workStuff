# Triagem e Diagnóstico de Erro

Diagnóstico rápido e estruturado a partir de stack traces, mensagens de erro ou logs de produção durante um incidente ativo.

### Parâmetros
- `servico`: Nome do microserviço ou aplicação afetada
- `erro`: Mensagem de erro, logs ou stack trace capturado

### Procedimento

1. Analisar causa raiz e anatomia da falha:
```prompt
# Análise de Causa Raiz
Você é um engenheiro SRE sênior responsável pelo suporte de incidentes.
Analise a falha a seguir no serviço {{servico}}:

Logs / Stack Trace:
{{erro}}

Responda com agilidade:
1. **O que aconteceu:** Explique em termos claros o ponto exato da quebra no código ou infraestrutura.
2. **Causa Mais Provável:** Hipótese principal fundamentada na mensagem ou stack trace.
3. **Componentes Impactados:** Se é banco de dados, rede, memória, concorrência ou chamada externa.
4. **Severidade Estimada:** Crítico (indisponibilidade), Alto (degradação funcional) ou Médio/Baixo.
```

2. Definir ações imediatas de contingência:
```prompt
# Plano de Contingência e Mitigação
Com base na análise da falha:
{{passo_anterior}}

Forneça um checklist de ações imediatas para o time de plantão:
1. **Mitigação Rápida:** O que fazer nos próximos 5 minutos para estancar o impacto (rollback, restart, scale up, desabilitar feature flag)?
2. **Comandos / Verificações:** Quais comandos ou métricas conferir agora para confirmar o diagnóstico.
3. **Solução Definitiva:** O que deve ser alterado no código ou infra para que o erro não volte a acontecer.
```
