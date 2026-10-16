# Conversores

Junta em uma tela as pequenas conversões do dia a dia de quem desenvolve (ler um token JWT, decodificar Base64, entender uma data em número, testar uma expressão regular) e faz tudo no próprio navegador, sem enviar o que você cola para lugar nenhum.

## Quando usar

- Uma API recusou o seu acesso e você quer ver o que está dentro do token e se ele já expirou.
- Um log mostra a data como `1758153600` e você quer saber que dia e hora é isso.
- Você precisa formatar um JSON ilegível ou transformá-lo em YAML para um arquivo de configuração.
- Você quer saber quando um agendamento como `0 8 * * 1-5` vai rodar.
- Você quer comparar duas versões de um texto ou testar uma expressão regular antes de usá-la no código.

## Conhecendo a tela

A tela tem um cartão para cada ferramenta. O resultado aparece no próprio cartão enquanto você digita, e quase sempre vem com o ícone de copiar ao lado.

| Cartão | O que faz |
|---|---|
| **JWT** | Abre um token JWT (o "crachá" que muitos sistemas usam para provar quem você é) e mostra as duas partes legíveis, **Header** e **Payload**, e se o token está **válido** ou **expirado**. |
| **SQL Bind** | Junta uma query SQL parametrizada (`?`) com as linhas de bind de log do Hibernate, JDBC ou MyBatis e devolve a query formatada com os valores preenchidos. Aceita também `$1` do Postgres e linhas com o prefixo de log do Spring Boot; `?` dentro de texto entre aspas ou de comentário não conta como parâmetro. |
| **Memória JVM & K8s** | Calcula se o Heap do Java (`MaxRAMPercentage` ou `-Xmx`) somado ao Non-Heap (`Metaspace`, `Direct`, pilhas de threads e code cache) cabe no limite de memória do pod no Kubernetes sem causar `OOMKilled` (código 137). O code cache conta como 240 MiB, o padrão da JVM. Quando nenhum heap cabe, a tela diz isso em vez de sugerir flags. |
| **X.509 PEM** | Decodifica um certificado `-----BEGIN CERTIFICATE-----` no navegador e mostra Subject, Issuer, número de série, datas de validade e SANs (domínios, IPs, e-mails e URIs cobertos). Numa cadeia (`fullchain.pem`), lê o primeiro certificado e diz quantos há. |
| **Base64** | Codifica texto em Base64 (um jeito de escrever qualquer dado só com letras e números) e decodifica de volta. Aceita também a variante base64url. |
| **URL** | Troca caracteres especiais pelos códigos com `%` usados em endereços web (por exemplo, espaço vira `%20`), e desfaz essa troca. |
| **Timestamp** | Converte um timestamp (a data contada em segundos ou milissegundos desde 1970) em data legível, no seu fuso e em UTC. |
| **UUID** | Gera identificadores únicos aleatórios (UUID versão 4), um ou vários de uma vez. |
| **Cron** | Mostra as próximas 5 execuções de uma expressão cron (o formato de agendamento com 5 campos: minuto, hora, dia, mês e dia da semana). |
| **JSON** | Formata, compacta e valida JSON, apontando a linha e a coluna do erro, e converte de e para YAML. |
| **Diff** | Compara dois textos linha a linha e marca o que saiu e o que entrou. |
| **Regex** | Testa uma expressão regular (um padrão de busca em texto) e lista cada trecho encontrado e seus grupos. |
| **Hash** | Calcula o resumo SHA-256, SHA-1 e SHA-512 de um texto. |

## Passo a passo: usar uma ferramenta

1. Encontre o cartão da ferramenta.
2. Se o cartão tiver uma chave de direção, escolha o que quer fazer, por exemplo **Decodificar** ou **Codificar**.
3. Cole ou digite o conteúdo na caixa de texto. O resultado aparece logo abaixo.
4. Clique no ícone de copiar ao lado do resultado para levá-lo à área de transferência.

### Ler um token JWT

1. No cartão **JWT**, cole o token. Para ver como funciona, clique em **usar um exemplo**.
2. Confira a etiqueta **válido** ou **expirado** e as datas **expira em** e **emitido em**.
3. Leia **Header** (o tipo do token) e **Payload** (os dados, como usuário e permissões).

### Codificar ou decodificar Base64 e URL

1. Nos cartões **Base64** ou **URL**, escolha **Decodificar** (o padrão) ou **Codificar**.
2. Cole o texto. Se ele não puder ser convertido naquela direção, o cartão diz por quê.

### Converter um timestamp

1. No cartão **Timestamp**, cole o número, por exemplo `1758153600`. Para usar o instante atual, clique em **Agora**.
2. Veja a **Unidade** que o painel reconheceu (segundos ou milissegundos), a data no seu fuso e a data em **ISO (UTC)**, o formato padrão internacional.

### Gerar UUIDs

1. No cartão **UUID**, clique em **Gerar 1**, **Gerar 5** ou **Gerar 20**.
2. Copie um por um ou, quando houver mais de um, clique em **copiar todos**.

### Ver quando um cron vai rodar

1. No cartão **Cron**, digite a expressão ou clique em um dos exemplos prontos, como `0 8 * * 1-5` (às 8h, de segunda a sexta).
2. Leia a lista com as próximas 5 execuções, no horário do seu computador.

### Trabalhar com JSON e YAML

1. No cartão **JSON**, escolha o modo:
   - **Formatar**: organiza o JSON com recuo, fácil de ler.
   - **Compactar**: tira espaços e quebras de linha, deixando tudo em uma linha.
   - **Para YAML**: converte o JSON em YAML, o formato usado em muitos arquivos de configuração.
   - **De YAML**: converte YAML em JSON. Aceita vários documentos separados por `---`.
2. Cole o conteúdo. Se o JSON estiver errado, a tela mostra a linha, a coluna e o caractere do problema.

### Comparar dois textos

1. No cartão **Diff**, cole a versão antiga na caixa **antes** e a nova na caixa **depois**.
2. Leia o resultado: linhas com `-` saíram, linhas com `+` entraram. A tela também diz quantas linhas são diferentes, ou que os dois textos são iguais.

### Testar uma expressão regular

1. No cartão **Regex**, digite o padrão entre as barras, por exemplo `(\w+)@(\w+)\.com`.
2. No campo pequeno à direita, ajuste as opções (flags): `g` (todas as ocorrências), `i` (ignora maiúsculas e minúsculas), `m`, `s`, `u` ou `y`.
3. Cole o texto em que quer buscar. Cada ocorrência aparece com a posição (`@0`, `@15`...) e os grupos capturados (`$1`, `$2`...).

### Calcular um hash

1. No cartão **Hash**, cole o texto.
2. Copie o resumo do algoritmo que você precisa: **SHA-256**, **SHA-1** ou **SHA-512**.

## Bom saber

- Nada do que você cola sai da máquina: todas as conversões rodam no navegador, sem passar pelo servidor do painel.
- O JWT só é decodificado. A assinatura não é verificada, então a tela não prova que o token é autêntico.
- No **Timestamp**, números com 11 dígitos ou mais são lidos como milissegundos; os menores, como segundos.
- No **Cron**, se você restringir ao mesmo tempo o dia do mês e o dia da semana, vale qualquer um dos dois, como no cron de verdade: `0 0 1 * 0` roda todo dia 1 e também todo domingo. O `7` no dia da semana também é domingo.
- O **Diff** compara até 4000 linhas de cada lado.
- O **Regex** mostra no máximo 500 ocorrências.
- O **Hash** não calcula MD5, porque o navegador não oferece esse algoritmo.
- Nada fica salvo: ao sair da tela, os campos voltam vazios.

## Problemas comuns

- **"Um JWT tem três partes separadas por ponto".** O texto colado não é um token completo. Copie o token inteiro, com as três partes.
- **"Entrada inválida para decodificar".** O texto não é Base64 (ou URL codificada) válido, ou a direção está trocada. Confira se escolheu **Decodificar** ou **Codificar** certo.
- **"JSON inválido na linha 3, coluna 12".** Vá até essa posição: costuma ser uma vírgula sobrando no fim de uma lista, aspas simples em vez de duplas ou uma chave sem fechar.
- **"esperados 5 campos" no Cron.** A expressão tem campos a mais ou a menos. Expressões com segundos (6 campos) ou atalhos como `@daily` não são aceitas.
- **"texto grande demais" no Diff.** Um dos lados passa de 4000 linhas. Compare em partes menores.
