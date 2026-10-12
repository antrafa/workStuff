# Verificações agendadas

Confere sozinha, de tempos em tempos, coisas que você não quer ficar olhando: uma pipeline que quebrou, um certificado perto de vencer, pods com problema ou uma falha grave nas dependências de um projeto. Quando o estado muda, você recebe uma notificação do sistema.

## Quando usar

- Você quer saber na hora em que a pipeline da branch principal quebrar, sem deixar a tela [Pipelines](/pipelines) aberta.
- O certificado HTTPS de `app.exemplo.com` vence em breve e ninguém pode esquecer de renovar.
- Você quer ser avisado se algum pod do namespace `pedidos-hml` entrar em estado crítico.
- Você quer acompanhar se apareceu uma falha de segurança crítica nas bibliotecas de um projeto.

## Antes de começar

Cada tipo de verificação usa algo que já precisa estar configurado em outra tela:

| Tipo | O que precisa antes |
|---|---|
| **Pipeline quebrada** | O projeto acompanhado na tela [Pipelines](/pipelines). Veja [Pipelines](/documentacao/pipelines). |
| **Certificado vencendo** | Só o endereço do site. |
| **Pods com problema** | Um kubeconfig cadastrado na tela [Cluster](/cluster). Veja [Cluster](/documentacao/cluster). |
| **Falha crítica nas dependências** | O projeto numa pasta do seu computador. |

No Linux, a notificação usa o programa `notify-send`. Sem ele, o aviso fica só no histórico da tela.

## Conhecendo a tela

Alguns termos:

- **Verificação**: uma conferência que você cadastra, com um alvo e um intervalo (por exemplo, "o certificado de `app.exemplo.com`, a cada 6 h").
- **Certificado**: o arquivo que dá o cadeado do HTTPS a um site. Ele tem data de validade.
- **Pod**: a unidade que roda a aplicação dentro de um cluster Kubernetes. **Kubeconfig** é o arquivo com o endereço e o acesso ao cluster, e **namespace** é uma divisão do cluster (como uma pasta).
- **Dependências**: as bibliotecas de terceiros que o projeto usa.

Mais termos em [Conceitos e termos](/documentacao/conceitos).

A tela tem duas partes:

| Parte | O que mostra |
|---|---|
| **Lista de verificações** | Cada verificação com o tipo, o **Estado**, quando rodou pela **Última** vez e o intervalo (**A cada**). Verificações pausadas aparecem esmaecidas. |
| **Avisos recentes** | O histórico das mudanças de estado: quando, se foi **problema** ou **recuperado**, o resumo e se a notificação saiu (**notificado**) ou ficou **só no histórico**. Só aparece depois do primeiro aviso. |

Os estados de uma verificação:

| Estado | Significado |
|---|---|
| **ok** | Tudo certo na última conferência. |
| **problema** | A conferência encontrou o que você pediu para vigiar (pipeline falhou, certificado perto de vencer...). |
| **erro** | Não deu para conferir: rede fora, VPN desligada, endereço inacessível. O resumo abaixo do estado diz o motivo. |
| **ainda não rodou** | A verificação foi criada, mas ainda não conferiu nada. |

A tela se atualiza sozinha a cada 30 segundos.

## Passo a passo: criar uma verificação

1. Clique em **Nova verificação**.
2. Em **O que conferir**, escolha o tipo.
3. Preencha o alvo, que muda conforme o tipo:

   | Tipo | Campo | Exemplo |
   |---|---|---|
   | **Pipeline quebrada** | **Projeto**: escolha da lista de projetos acompanhados. | `grupo/pedidos-api` |
   | **Certificado vencendo** | **Host**: só o endereço, sem `https://`. | `app.exemplo.com` |
   | **Pods com problema** | **Kubeconfig**, o contexto (só aparece quando o arquivo tem mais de um) e **Namespace**. | `pedidos-hml` |
   | **Falha crítica nas dependências** | **Pasta do projeto**: caminho completo ou começando com `~`. | `~/workspace/pedidos-api` |

4. Em **A cada**, escolha o intervalo: 5 min, 15 min, 30 min, 1 h, 6 h ou 24 h.
5. Clique em **Criar e rodar agora**. A verificação é salva e roda uma vez na hora, para você ver se funciona sem esperar o primeiro intervalo.
6. Confira o estado na lista. Se aparecer **erro**, leia o resumo e corrija o alvo.

### O que cada tipo considera problema

- **Pipeline quebrada**: a última pipeline do projeto falhou.
- **Certificado vencendo**: faltam 30 dias ou menos para vencer, ou já venceu.
- **Pods com problema**: algum pod do namespace está em estado crítico, como reiniciando sem parar (CrashLoop), sem conseguir baixar a imagem ou com 3 ou mais reinícios.
- **Falha crítica nas dependências**: alguma biblioteca tem falha de segurança conhecida de gravidade crítica ou alta, segundo a base pública OSV.

### Pausar, rodar agora e apagar

Na linha de cada verificação há três ícones:

1. **Rodar agora** (setas em círculo): confere na hora, fora do intervalo.
2. **Pausar**: a verificação para de rodar e fica esmaecida. O mesmo botão vira **Retomar**.
3. **Apagar** (lixeira): pede confirmação. A verificação deixa de ser conferida, mas o histórico de avisos continua.

## Bom saber

- As verificações só rodam enquanto o servidor do painel está no ar. Com o computador desligado ou o painel fechado, nada é conferido.
- O aviso sai só quando o estado muda. Um problema que continua avisa uma vez; quando ele se resolve, chega um segundo aviso dizendo que voltou ao normal.
- Um **erro** (como a VPN fora do ar) não conta como mudança de estado. Assim você não recebe "problema" e "recuperado" a cada queda de rede.
- As verificações rodam uma por vez. Uma conferência lenta não é repetida por cima de si mesma.
- Tudo é só leitura: nenhuma verificação altera a pipeline, o cluster ou o projeto.
- O limite é de 30 verificações. A tela mostra os 50 avisos mais recentes.
- No Windows não há notificação do sistema: o aviso fica só no histórico da tela.

## Problemas comuns

- **A lista de projetos em Pipeline quebrada está vazia.** Acompanhe o projeto antes na tela [Pipelines](/pipelines).
- **"host inválido".** Escreva só o endereço, como `app.exemplo.com`, sem `https://` e sem caminho.
- **"use o caminho absoluto da pasta" ou "pasta não encontrada".** Em **Pasta do projeto**, informe o caminho completo, como `/home/voce/workspace/projeto`, ou começando com `~`.
- **O estado fica em erro.** Leia o resumo abaixo do estado. Costuma ser rede, VPN ou acesso ao cluster. Resolva e clique em **Rodar agora**.
- **O estado mudou, mas nenhuma notificação apareceu.** Veja em **Avisos recentes**: **só no histórico** quer dizer que o sistema não mostrou a notificação. No Linux, instale o programa `notify-send`.
