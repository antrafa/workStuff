# Documentação de Decisão de Arquitetura (ADR)

Elaboração guiada de um Architecture Decision Record (ADR) para documentar escolhas técnicas significativas, o contexto do problema e os trade-offs assumidos.

### Parâmetros
- `titulo`: Título da decisão técnica (ex.: `Adoção de Kafka para mensageria assíncrona de pedidos`)
- `contexto`: Contexto técnico, dores da arquitetura atual e requisitos não-funcionais
- `decisao`: Solução técnica escolhida e alternativas que foram descartadas

### Procedimento

1. Formalizar contexto e critérios de avaliação:
```prompt
# Contexto e Alternativas
Você é o arquiteto de software responsável pela documentação técnica.
Estruture o contexto para o ADR: {{titulo}}

Contexto do problema:
{{contexto}}

Proposta e alternativas:
{{decisao}}

Elabore a primeira parte do documento ADR:
1. **Status:** Proposto / Aceito.
2. **Contexto:** Explique a necessidade técnica, as forças operacionais, requisitos de latência, escala e custo que motivaram a mudança.
3. **Alternativas Consideradas:** Liste cada alternativa avaliada e a razão objetiva pela qual foi rejeitada ou preterida.
```

2. Detalhar decisão, consequências e trade-offs:
```prompt
# Decisão e Consequências
Com base no contexto e alternativas analisadas:
{{passo_anterior}}

Complete o ADR com a decisão formal e análise de consequências:
1. **Decisão:** Declaração clara e inequívoca do que a equipe decidiu adotar e como será arquitetado.
2. **Consequências Positivas (Ganhos):** Benefícios técnicos tangíveis para a arquitetura, equipe ou produto.
3. **Consequências Negativas e Trade-offs (Custos):** Débitos técnicos aceitos, nova complexidade operacional, curva de aprendizado ou custos de infraestrutura adicionados.
4. **Plano de Conformidade / Validação:** Como a equipe vai garantir que a decisão está sendo seguida na prática.
```
