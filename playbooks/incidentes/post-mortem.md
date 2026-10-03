# Rascunho de Post-Mortem de Incidente

Estruturação de relatório post-mortem blameless após a resolução de um incidente de produção, focando em aprendizado e resiliência sistêmica.

### Parâmetros
- `incidente`: Título ou código do incidente (ex.: `INC-2026-10-02 Queda do Gateway`)
- `tempo_indisponibilidade`: Duração total do impacto (ex.: `42 minutos`)
- `fatos`: Descrição cronológica do que aconteceu, ações tomadas e como o sistema se recuperou

### Procedimento

1. Estruturar sumário executivo e linha do tempo:
```prompt
# Sumário Executivo e Timeline
Você é um líder técnico e facilitador de post-mortems blameless.
Consolide os fatos fornecidos para o incidente {{incidente}}:

Duração do impacto: {{tempo_indisponibilidade}}
Relato dos fatos:
{{fatos}}

Estruture as primeiras seções do documento:
1. **Sumário Executivo:** Breve descrição do impacto no cliente e no negócio sem jargões desnecessários.
2. **Impacto Mensurado:** Tempo total de degradação, volume de requisições perdidas ou usuários afetados.
3. **Linha do Tempo (Timeline):** Eventos cronológicos com horário estimado (Detecção -> Triagem -> Mitigação -> Resolução).
```

2. Aplicar 5 Porquês e plano de ação preventiva:
```prompt
# Causa Raiz e Ações Preventivas
Com base na linha do tempo e sumário:
{{passo_anterior}}

Elabore a análise causal e as ações de melhoria contínua:
1. **Análise dos 5 Porquês (5 Whys):** Conduza a investigação até as causas fundamentais (falta de observabilidade, gaps em testes, timeouts curtos, etc.), mantendo tom blameless focado no sistema e processos.
2. **O que funcionou bem:** Reconhecer processos ou ferramentas que ajudaram na recuperação rápida.
3. **Onde tivemos sorte:** Falhas latentes descobertas que poderiam ter sido piores.
4. **Action Items (Plano de Ação):** Tabela de ações preventivas com Tipo (Prevenção / Detecção / Mitigação), Descrição e Prioridade (P0, P1, P2).
```
