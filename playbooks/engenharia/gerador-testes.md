# Geração de Testes Unitários

Roteiro para gerar testes automatizados abrangentes, cobrindo fluxos felizes, erros esperados e cenários de borda para uma função, classe ou componente.

### Parâmetros
- `projeto`: Pasta do projeto
- `alvo`: Nome do arquivo, classe ou função que será testada
- `codigo`: Código-fonte ou descrição detalhada do comportamento esperado

### Procedimento

1. Mapear cenários de teste e casos de borda:
```prompt
# Mapeamento de Cenários
Você é um especialista em qualidade de software e TDD.
Analise o componente ou função a seguir:

Alvo: {{alvo}}
Código / Especificação:
{{codigo}}

Identifique e estruture uma matriz completa de cenários de teste:
1. **Caminho Feliz (Happy Path):** Casos padrão com entradas válidas e saídas esperadas.
2. **Casos de Borda (Edge Cases):** Listas vazias, valores limites, caracteres especiais, timeouts.
3. **Casos de Falha e Exceção:** Entradas inválidas, dependências externas indisponíveis, erros mapeados.
4. **Dependências a isolar:** Quais dependências externas devem receber mock ou stub.
```

2. Escrever a suíte de testes com mocks:
```prompt
# Implementação da Suíte de Testes
Com base no plano de testes detalhado anteriormente:
{{passo_anterior}}

Escreva a suíte de testes completa e funcional, utilizando o framework padrão da stack do projeto {{projeto}} (ex.: Vitest/Jest, JUnit 5, PyTest, Go testing):
- Use nomes expressivos (`describe` / `it` / `test` no padrão "deve fazer X quando Y").
- Isole dependências com mocks limpos (sem mock excessivo de objetos puros).
- Assegure assertions precisas tanto para retorno quanto para lançamento de exceções.
- Inclua helpers ou fixtures se necessário.
```
