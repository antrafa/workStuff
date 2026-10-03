# Modelagem de Ameaças (STRIDE)

Avaliação sistemática de segurança para novos fluxos, APIs ou arquiteturas, identificando vulnerabilidades de design antes da implementação.

### Parâmetros
- `sistema`: Nome da aplicação ou fluxo avaliado
- `arquitetura`: Descrição dos componentes, bancos, integrações e dados manipulados

### Procedimento

1. Mapear fluxos de dados e fronteiras de confiança:
```prompt
# Mapeamento de Fronteiras de Confiança
Você é um especialista em AppSec e segurança ofensiva/defensiva.
Analise a arquitetura do sistema {{sistema}}:

Arquitetura e Fluxo:
{{arquitetura}}

1. **Fronteiras de Confiança (Trust Boundaries):** Onde os dados cruzam entre zonas de confiança diferente (usuário -> API, API -> banco, API -> serviço terceiro).
2. **Dados Sensíveis:** Identifique dados PII, credenciais, tokens, segredos e informações de negócio em trânsito e em repouso.
3. **Mecanismos de Autenticação e Autorização:** Como identidades são verificadas e privilégios são impostos.
```

2. Aplicar a metodologia STRIDE e mitigações:
```prompt
# Análise STRIDE e Mitigações
Com base no mapeamento anterior:
{{passo_anterior}}

Execute a análise de ameaças usando o framework STRIDE:
- **S (Spoofing):** Como um atacante poderia se passar por outro usuário ou serviço?
- **T (Tampering):** Onde dados em trânsito ou no banco podem ser adulterados sem detecção?
- **R (Repudiation):** Há logs suficientes e imutáveis para comprovar ações críticas?
- **I (Information Disclosure):** Onde pode haver vazamento de dados, logs verbosos ou erros com stack trace?
- **D (Denial of Service):** Há proteção contra esgotamento de conexões, CPU ou memória (rate limit, limites de payload)?
- **E (Elevation of Privilege):** Usuários comuns conseguem acessar recursos administrativos (IDOR, Broken Object Level Auth)?

Para cada ameaça identificada, determine a severidade (Alta/Média/Baixa) e forneça a recomendação técnica de mitigação.
```
