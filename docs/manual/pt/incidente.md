# Linha do tempo

Junta numa única lista, em ordem de horário, tudo o que aconteceu num namespace durante um período: avisos do cluster, reinícios, publicações de versão e linhas de erro dos logs. Serve para reconstruir um incidente e, no fim, pedir à IA um rascunho do post-mortem.

## Quando usar

- A aplicação ficou fora do ar entre 14h e 14h20 e você precisa entender o que aconteceu primeiro.
- Você suspeita que uma versão nova causou o problema e quer ver se o erro começou logo depois da publicação.
- Você precisa escrever o relatório do incidente (o post-mortem) e quer um primeiro rascunho a partir dos fatos.

## Palavras que aparecem nesta tela

| Termo | O que é |
|---|---|
| **Namespace** | Uma divisão do cluster, como uma pasta, que agrupa as aplicações (por exemplo, `pedidos-hml`). |
| **Evento** | Um aviso que o Kubernetes registra, como "não conseguiu baixar a imagem" ou "o teste de saúde falhou". |
| **Restart** | Quando o container de um pod morre e sobe de novo. O motivo `OOMKilled` quer dizer que ele passou do limite de memória. |
| **Rollout** | A publicação de uma versão nova de uma aplicação (um Deployment), que troca os pods antigos pelos novos. |
| **Post-mortem** | O relatório escrito depois de um incidente: o que aconteceu, o impacto, a causa e o que fazer para não repetir. |

Mais termos em [Conceitos e termos](/documentacao/conceitos).

## Antes de começar

- Um cluster conectado na tela [Cluster](/cluster). Veja como em [Cluster](/documentacao/cluster). A tela usa o mesmo cluster e contexto, mostrados em **Cluster** no topo do formulário.
- Para o rascunho do post-mortem, um provedor de IA configurado em [Configurações](/configuracoes).

## Conhecendo a tela

- **Formulário**: o campo `namespace` (lembrado neste navegador), a janela de tempo (**últimas 1 h** até **últimas 24 h**), o campo **foco opcional** e o botão **Montar linha do tempo**.
- **Filtro de severidade**: **Só críticos**, **Avisos e críticos** (o padrão) e **Tudo**, além do campo **Filtrar** para procurar um texto.
- **Avisos azuis**: dizem o que não deu para coletar, por exemplo um log que não pôde ser lido.
- **Lista**: cada entrada tem o horário, a origem, a severidade, o objeto (como `Pod/api-7d9f-x2klm`), um título e o detalhe.

As origens são:

| Origem | De onde vem | Severidade |
|---|---|---|
| **evento** | Os eventos do namespace. Eventos de rotina (agendou, baixou a imagem, iniciou) ficam de fora. | **crítico** para falhas como BackOff, OOM, Failed, Unhealthy, Evicted e Kill; **aviso** para outros avisos; info para o resto. |
| **restart** | O último encerramento de cada container que reiniciou dentro da janela, com o motivo e o código de saída. | **crítico** se foi `OOMKilled` ou saiu com erro; **aviso** se não. |
| **rollout** | Cada versão nova de um Deployment publicada na janela, com a revisão e a imagem que entrou. | info |
| **log** | As últimas linhas de erro (ERROR, FATAL, Exception e parecidos) do log de antes do reinício, dos pods que reiniciaram. | **crítico** |

## Passo a passo: montar a linha do tempo

1. Digite o namespace, por exemplo `pedidos-hml`.
2. Escolha a janela de tempo. Ela conta para trás a partir de agora: **últimas 3 h** cobre as três últimas horas.
3. Opcional: em **foco opcional**, digite parte do nome do que caiu, como `api-pedidos`. Só entram as entradas de objetos com esse trecho no nome.
4. Clique em **Montar linha do tempo**. O botão mostra **Montando…** enquanto o painel lê o cluster.
5. Leia a lista de cima para baixo: a entrada mais antiga vem primeiro.
6. Troque para **Tudo** quando quiser ver também as publicações de versão e os eventos comuns, ou para **Só críticos** para ir direto ao que quebrou.

> **Dica:** um padrão comum é um **rollout** seguido, minutos depois, de **restart** com `OOMKilled` e linhas de **log** com erro. Isso aponta para a versão nova.

### Rascunhar o post-mortem

1. Com a linha do tempo montada, clique em **Rascunhar post-mortem**, no topo da tela.
2. Abre a janela **Rascunho do post-mortem**. O painel monta a linha do tempo de novo, com o mesmo namespace, janela e foco da que está na tela, e envia para a IA.
3. O texto chega aos poucos, com as seções Resumo, Linha do tempo, Impacto, Causa provável, Ações e O que falta saber.
4. Use **Parar** para interromper, **Copiar** para levar o texto e **Refazer** para pedir outra versão.
5. Revise antes de usar: confira cada afirmação com a lista.

## Bom saber

- A tela só lê: nada é alterado no cluster, e a IA não roda comandos.
- O cluster guarda eventos por pouco tempo, em geral uma hora. Numa janela maior, os eventos antigos já sumiram; a tela avisa quando isso acontece. Reinícios, publicações de versão e logs continuam aparecendo.
- O log de erro vem do container que morreu antes do último reinício, e só de até seis pods. Se mais pods reiniciaram, um aviso diz quantos ficaram de fora.
- A IA escreve só com o que está na linha do tempo e diz o que é hipótese. Ela recebe todas as severidades, não só as do filtro da tela, até 300 entradas (as mais graves e mais recentes, se houver mais).
- O rascunho sai sempre em português.
- O foco diferencia maiúsculas de minúsculas: digite o trecho como aparece no nome.

## Problemas comuns

- **Aparece "Nenhum cluster conectado".** Clique em **Conectar na tela Cluster** e escolha um kubeconfig.
- **A lista vem vazia ou aparece "Nada neste filtro".** Troque o filtro para **Tudo**, aumente a janela ou apague o foco.
- **Não há nenhum evento do horário do incidente.** O cluster já descartou os eventos. Os reinícios e as publicações de versão continuam na lista; para a próxima vez, monte a linha do tempo logo depois do incidente.
- **Um aviso azul diz que o log anterior de um pod não pôde ser lido.** O pod pode ter sido recriado e perdido o log antigo. O post-mortem recebe esse aviso e sabe que o dado faltou.
- **O botão Rascunhar post-mortem não aparece.** Ele só aparece quando a linha do tempo tem ao menos uma entrada.
