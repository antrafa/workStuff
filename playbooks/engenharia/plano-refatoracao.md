# Planejamento de Refatoração Segura

Procedimento para planejar a modernização ou desacoplamento de código legado sem introduzir regressões ou breaking changes.

### Parâmetros
- `projeto`: Diretório do projeto
- `modulo`: Módulo, pacote ou classe legada
- `problema`: Descrição do problema atual (alto acoplamento, lentidão, dívida técnica)

### Procedimento

1. Diagnosticar acoplamento e pontos de risco:
```prompt
# Diagnóstico Estrutural
Você é um arquiteto especialista em refatoração e modernização de sistemas legados.
Analise a situação do módulo {{modulo}} no projeto {{projeto}}:

Problema relatado:
{{problema}}

Estruture um diagnóstico detalhado:
1. **Bad Smells identificados:** God Class, Feature Envy, Long Method, Shotgun Surgery, etc.
2. **Pontos de Acoplamento:** Quem consome este módulo e o que ele consome externamente.
3. **Métricas de Risco:** Quais áreas correm maior risco de quebra caso o comportamento mude.
4. **Pré-requisitos:** Quais testes ou contratos precisam existir antes de tocar no código.
```

2. Desenhar o plano de refatoração em etapas:
```prompt
# Plano de Migração Incremental
Com base no diagnóstico estrutural:
{{passo_anterior}}

Defina um plano de refatoração passo a passo, aplicando padrões consolidados (ex.: Strangler Fig, Branch by Abstraction, Extract Method):
- Divida o trabalho em etapas pequenas que possam ser commitadas e deployadas independentemente.
- Para cada etapa, descreva:
  * Ação técnica exata.
  * Como validar que a funcionalidade foi mantida (teste de regressão).
  * Critério de aceite para avançar para a próxima etapa.
- Defina a estratégia de rollback caso algo falhe em produção.
```
