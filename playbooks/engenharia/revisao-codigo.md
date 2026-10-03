# Revisão de Código e Boas Práticas

Procedimento guiado de revisão técnica com a IA para analisar alterações antes do merge request, com foco em corretude, casos de borda e padrões de projeto.

### Parâmetros
- `projeto`: Caminho da pasta do repositório (ex.: `~/workspace/projects/meu-app`)
- `contexto`: Descrição do objetivo da mudança, lista de arquivos ou diff

### Procedimento

1. Analisar lógica, potenciais bugs e concorrência:
```prompt
# Análise de Bugs e Lógica
Você é um revisor de código sênior e arquiteto de software.
Analise detalhadamente o código e as alterações fornecidas abaixo:

Projeto: {{projeto}}
Contexto da mudança / Diff:
{{contexto}}

Avalie criticamente:
1. Erros de lógica, condições de corrida (race conditions) e vazamento de memória/recursos.
2. Tratamento inadequado de erros e exceções não capturadas.
3. Casos de borda não cobertos (inputs nulos, coleções vazias, valores extremos).
4. Possíveis regressões em fluxos dependentes.

Forneça um parecer claro e liste cada ponto com arquivo/linha estimada e sugestão de correção.
```

2. Avaliar legibilidade, padrões e conformidade:
```prompt
# Padrões e Manutenibilidade
Com base nas análises levantadas no passo anterior:
{{passo_anterior}}

Agora avalie a qualidade do design e legibilidade:
1. Conformidade com os princípios SOLID e convenções idiomáticas da linguagem.
2. Nomenclatura de variáveis, funções e coesão de módulos.
3. Complexidade ciclomática: trechos excessivamente aninhados que merecem extração.
4. Clareza e necessidade de comentários/documentação.

Destaque o que foi bem feito e pontue o que deve ser refatorado antes do merge.
```

3. Rascunhar mensagem de revisão executiva:
```prompt
# Resumo Executivo da Revisão
Sintetize os achados das etapas anteriores:
{{passo_anterior}}

Escreva um resumo conciso pronto para ser colado como comentário geral no Merge Request:
- **Resumo:** 1-2 frases sobre o impacto da mudança.
- **Aprova com ressalvas ou requer mudanças:** indicação objetiva.
- **Pontos cruciais a ajustar:** lista com bullet points.
- **Melhorias opcionais:** sugestões não impeditivas para ciclos futuros.
```
