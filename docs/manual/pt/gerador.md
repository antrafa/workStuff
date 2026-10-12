# Gerador de dados

Gera dados brasileiros de teste (pessoa, CPF, CNPJ, nome, endereço e empresa) que passam nas validações dos sistemas, mas não pertencem a ninguém.

## Quando usar

- Você precisa preencher um cadastro em homologação e não pode usar o CPF de uma pessoa real.
- Um teste automatizado precisa de um CNPJ válido, inclusive no novo formato com letras.
- Você quer um endereço coerente com o estado escolhido para testar uma regra regional.

## Conhecendo a tela

A tela tem um cartão para cada tipo de dado:

| Cartão | O que gera |
|---|---|
| **Pessoa completa** | Nome, CPF, idade e endereço coerentes entre si. |
| **CPF** | Um CPF com dígitos verificadores válidos. O 9º dígito segue a região fiscal do estado escolhido. |
| **CNPJ** | Um CNPJ numérico ou no novo formato alfanumérico da Receita. |
| **Nome** | Nome e sobrenomes, com o gênero. |
| **Endereço** | Logradouro, bairro, cidade e CEP. |
| **Empresa completa** | Razão social, CNPJ, CNAE (o código da atividade econômica), porte e endereço. |

## Passo a passo: gerar um dado

1. Encontre o cartão do tipo de dado que você quer.
2. Se o cartão tiver a lista de estados, escolha um (por exemplo, **SC**) ou deixe **qualquer estado**.
3. Nos cartões de CNPJ e empresa, marque **alfanumérico** se o sistema que você testa já aceita o novo formato, com letras.
4. Clique em **Gerar**. O resultado aparece no próprio cartão, um campo por linha.
5. Clique no ícone de copiar ao lado de um campo para copiar só ele, ou em **copiar tudo** para levar todos os campos de uma vez.

> **Dica:** depois do primeiro, o botão vira **Gerar outro**: cada clique troca o resultado por um dado novo.

## Bom saber

- Os documentos são válidos pelo dígito verificador, mas fictícios: use só em teste, nunca em produção ou em cadastro real.
- Tudo é gerado no navegador. Nada é enviado ao servidor nem fica salvo.
- O CNPJ alfanumérico segue a norma da Receita Federal (IN RFB 2.229/2024) no cálculo dos dígitos verificadores. Sistemas que ainda não foram atualizados podem recusá-lo.

## Problemas comuns

- **O sistema recusou o CNPJ.** Se você marcou **alfanumérico**, o sistema ainda pode não aceitar letras. Desmarque e gere de novo.
- **O CPF não bate com o estado do endereço.** Em **Pessoa completa**, escolha o estado antes de gerar: CPF e endereço saem da mesma região.
