# Performance

Acompanha o consumo de CPU e memória, os reinícios e o estrangulamento de CPU de até 20 pods ao longo de horas, mostra tudo em gráficos e, no fim, pede à IA um relatório dizendo se a aplicação aguenta a carga e o que ajustar.

## Quando usar

- Uma aplicação fica lenta em certos horários e você quer ver se é falta de CPU ou de memória.
- Você desconfia de vazamento de memória: o consumo sobe aos poucos até a aplicação reiniciar.
- Vai rodar um teste de carga e quer registrar o comportamento dos pods durante o teste.
- Precisa justificar um aumento (ou uma redução) dos limites de CPU e memória com dados.

## Antes de começar

- Os arquivos de acesso aos clusters (kubeconfigs) precisam estar na sua pasta `~/.kube`. Veja como adicionar um em [Cluster](/documentacao/cluster).
- Para o relatório com IA, escolha o provedor de IA em [Configurações](/configuracoes). Veja [Configurações](/documentacao/configuracoes).
- Os termos usados aqui estão em [Conceitos e termos](/documentacao/conceitos).

Algumas palavras desta tela:

- **Pod**: a unidade que roda a aplicação no cluster. Uma aplicação costuma ter vários pods iguais.
- **Container**: cada programa dentro de um pod. Muitos pods têm um container da aplicação e um `istio-proxy`, o programa auxiliar que cuida do tráfego de rede.
- **Limite (limit)**: o máximo de CPU ou memória que o container pode usar. Se a memória passa do limite, o container é encerrado (o famoso OOMKilled) e reinicia.
- **Throttling**: quando o container bate no limite de CPU, o sistema o segura por alguns instantes. A aplicação fica lenta mesmo com o uso médio de CPU baixo.
- **Observação**: uma gravação. Você escolhe os pods e de quanto em quanto tempo medir, e o painel guarda cada medida (uma "coleta").

## Conhecendo a tela

De cima para baixo:

| Parte | O que é |
|---|---|
| **Kubeconfig** (no topo, à direita) | Qual cluster observar, e o contexto quando o arquivo tem mais de um. É separado da tela [Cluster](/cluster): começa com o mesmo kubeconfig de lá, mas você pode trocar sem afetar a outra tela. |
| **Nova observação** | Escolha do namespace, do intervalo entre coletas e dos pods. Tem as listas **Disponíveis** e **Selecionados**. |
| **Observações** | Todas as observações, com o estado (**rodando**, **parada** ou **falhou**), quando começaram e o intervalo. Uma bolinha verde pulsando indica que a coleta está em dia; amarela, que está atrasada ou ainda esperando a primeira coleta. |
| Detalhe da observação | Aparece ao clicar numa observação: um cartão por container, o gráfico no tempo e a tabela da malha Istio. |
| **Relatório com IA** | Gera e guarda relatórios da observação escolhida. |

Namespace é a "pasta" do cluster que agrupa as aplicações de um sistema, por exemplo `pedidos-hml`.

## Passo a passo: criar uma observação

1. No topo, em **Kubeconfig**, escolha o cluster. Se aparecer a lista de contextos, escolha o certo.
2. No cartão **Nova observação**, escolha o namespace. A tela já sugere o primeiro namespace de aplicação, pulando os do sistema.
3. Escolha o intervalo: **a cada 15s**, **a cada 30s**, **a cada 60s** ou **a cada 120s**. Intervalo curto mostra picos rápidos; intervalo longo serve para observar por muitas horas.
4. Na lista **Disponíveis**, marque os pods que quer acompanhar (até 20). Use **filtrar pods…** para achar pelo nome.
5. Em **Selecionados**, confira os containers de cada pod. O `istio-proxy` vem desmarcado, porque o que interessa é o consumo da aplicação. Se você desmarcar todos, todos os containers são coletados.
6. Clique em **Iniciar observação**. A observação aparece na lista **Observações** como **rodando** e já fica aberta.
7. Deixe rodar pelo tempo que quiser observar. A primeira coleta acontece dentro do intervalo escolhido.

> **Dica:** a lista de pods não se atualiza sozinha. Se um pod novo subiu, clique no botão **Pods** para recarregar a lista.

### Ler os gráficos

1. Clique numa observação da lista **Observações**.
2. Cada cartão mostra um container, com o nome do pod embaixo:
   - **CPU**: o uso em milicores (`250m` é um quarto de um processador) e quanto isso é do limite. Se não houver limite, aparece **sem limite**.
   - **MEM**: a memória em Mi (mebibytes, cerca de um megabyte) e quanto isso é do limite.
   - **throttle**: em quantos por cento do tempo o container foi segurado por bater no limite de CPU.
   - A tendência da memória: **memória estável**, ou quanto ela sobe por hora, como `+12 MiB/h, bate no limite em ~6h`. Isso aparece quando há pelo menos seis pontos e a subida passa de 1 MiB por hora.
   - Um selo vermelho com o número de **restarts** quando o container reiniciou.
3. Clique num cartão para ver aquele container no gráfico.
4. Use **CPU no tempo** e **Memória no tempo** para trocar o gráfico. A linha tracejada é o limite. As bolinhas no alto marcam reinícios e eventos de memória esgotada (OOMKilled); passe o mouse para ver o detalhe.
5. Em **Malha (Istio)**, veja por serviço quantas requisições por segundo chegaram (**req/s**), o tempo de resposta típico e o dos 5% mais lentos (**p50 · p95**) e a porcentagem de **erro**. Esses números aparecem a partir da segunda coleta, e só para serviços que recebem tráfego pelo gateway do Istio.

### Ver o que aconteceu antes de começar a observar

1. No detalhe da observação, clique em **Histórico Prometheus**.
2. O painel reconstrói as últimas 24 horas a partir do Prometheus do cluster, o sistema que guarda o histórico de métricas. Uma mensagem informa quantos pontos foram reconstruídos.
3. No gráfico, uma linha vertical separa o histórico (à esquerda) da coleta da observação (à direita).

### Gerar o relatório com IA

1. Com a observação aberta, vá ao cartão **Relatório com IA**.
2. Ajuste **De** e **Até** para o período que interessa. Por padrão, vai do início da observação até agora (ou até quando ela parou).
3. Em **Histórico do Prometheus**, escolha **não incluir** ou **incluir 6h**, **incluir 24h** ou **incluir 72h** para somar horas anteriores reconstruídas do Prometheus.
4. Clique em **Gerar relatório**. O texto aparece enquanto a IA escreve. Para interromper, clique em **Parar**.
5. Ao terminar, o relatório abre numa janela e fica salvo em **Relatórios desta observação**. Clique em **Abrir** para ler de novo, ou no ícone de lixeira para apagar.

O relatório traz um resumo, os horários com sinal de problema e a causa provável, os horários sem anomalia e uma recomendação de request e limit para os containers que chegaram perto do limite.

### Parar, retomar e apagar

- **Parar**: interrompe a coleta. Os pontos já coletados continuam salvos.
- **Retomar**: volta a coletar na mesma observação.
- Ícone de lixeira: abre **Apagar a observação?**. Ao clicar em **Apagar**, a observação e todos os pontos coletados são apagados, sem como desfazer. Os relatórios já gerados continuam salvos.

## Bom saber

- A tela só lê o cluster. Nada é alterado.
- A coleta roda no servidor do painel, não no navegador: você pode fechar a aba. Se o servidor reiniciar, as observações que estavam rodando continuam sozinhas.
- O uso de CPU e memória vem do serviço de métricas do cluster (o metrics-server). Sem ele, os cartões mostram **sem métrica**.
- O throttling precisa do Prometheus do cluster (por exemplo, o do Rancher Monitoring). Sem ele, aparece **throttle indisponível** com o motivo.
- A tabela da malha precisa do Istio com o `istio-ingressgateway`. Sem ele, aparece **indisponível** com o motivo.
- O pod é acompanhado pelo nome. Se ele for substituído por outro (numa nova versão, por exemplo), o pod novo tem outro nome e não entra na observação: crie uma nova.
- Para o relatório, as coletas são resumidas em blocos de 5 minutos e enviadas ao provedor de IA de [Configurações](/configuracoes). A IA não executa comandos, só lê esses números.
- Observações, pontos e relatórios ficam em `~/.workstuff/performance`.

## Problemas comuns

- **A observação aparece como "falhou".** O cluster recusou a leitura: a credencial venceu ou o seu usuário não tem permissão. O motivo aparece ao lado da data de início. Resolva o acesso e clique em **Retomar**.
- **Aparece "Nenhum kubeconfig em ~/.kube".** Adicione um kubeconfig pela tela [Cluster](/cluster).
- **No lugar da lista de namespaces aparece um campo de texto.** O seu usuário não pode listar namespaces. Digite o namespace e tecle Enter.
- **Aparece "no máximo 20 pods por observação".** Tire pods da seleção ou divida em duas observações.
- **Os cartões mostram "sem métrica".** O cluster não tem o metrics-server, ou o pod ainda não tem medida. Espere a próxima coleta; se continuar, fale com quem administra o cluster.
- **Ao clicar em Histórico Prometheus, aparece "sem Prometheus neste cluster".** O cluster não tem um Prometheus que o painel encontre. Só a coleta da observação fica disponível.
- **O relatório diz "sem amostras no período selecionado".** O intervalo entre **De** e **Até** não tem nenhuma coleta. Amplie o período ou inclua horas do Prometheus.
