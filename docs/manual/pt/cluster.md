# Cluster

Mostra o que está rodando num cluster Kubernetes (os pods, as máquinas e o que está falhando), com logs ao vivo e diagnóstico por IA. A aba Cluster Doctor é um chat em que a IA investiga o cluster por você.

## Quando usar

- Alguém avisa que a aplicação de homologação caiu e você quer ver quais pods estão com problema.
- Um pod reinicia sem parar e você precisa ler o log de antes do último reinício.
- Você quer saber se alguma máquina do cluster está sem memória ou sem disco.
- Você não sabe por onde começar e prefere descrever o problema para a IA investigar.

## Palavras que aparecem nesta tela

Se algum termo for novo, a página [Conceitos e termos](/documentacao/conceitos) explica com mais calma.

| Termo | O que é |
|---|---|
| **Cluster** | O conjunto de máquinas onde as aplicações rodam, gerenciado pelo Kubernetes. |
| **Kubeconfig** | O arquivo com o endereço e as credenciais de acesso a um ou mais clusters. Fica na pasta `~/.kube` do seu computador. |
| **Contexto** | Dentro de um kubeconfig, a combinação de cluster e usuário que será usada. Um arquivo pode ter vários. |
| **Namespace** | Uma divisão do cluster, como uma pasta, que separa as aplicações (por exemplo, `pedidos-hml`). |
| **Pod** | A menor unidade que roda no cluster: uma ou mais aplicações (containers) que sobem juntas. |
| **Node** | Uma das máquinas do cluster, onde os pods rodam. |
| **Deployment, StatefulSet, DaemonSet** | O "dono" do pod: o recurso que diz quantas cópias devem existir e recria os pods quando somem. |
| **Restart** | Quando o container de um pod morre e sobe de novo. Muitos reinícios costumam indicar erro. |
| **Evento** | Um aviso que o Kubernetes registra, como "não conseguiu baixar a imagem". O cluster guarda eventos por pouco tempo, em geral uma hora. |

## Antes de começar

- O `kubectl` precisa estar instalado. A tela [Máquina](/maquina) confere isso.
- Você precisa do arquivo kubeconfig do cluster. Quem administra o cluster costuma fornecer, ou ele pode ser baixado do Rancher.
- Para o diagnóstico por IA, configure o provedor em [Configurações](/configuracoes). O Cluster Doctor só funciona com o Claude Code.

## Passo a passo: conectar um cluster

1. Abra a tela **Cluster**. Sem nenhum cluster conectado, ela mostra **Nenhum cluster conectado**.
2. Clique em **Escolher kubeconfig**. Abre a lista dos kubeconfigs que estão em `~/.kube`, agrupados por ambiente.
3. Se o arquivo que você quer não estiver na lista, clique em **Adicionar kubeconfig** e escolha o arquivo no seu computador. O painel valida o arquivo com o `kubectl` antes de salvar em `~/.kube` e nunca sobrescreve um arquivo com o mesmo nome.
4. Confira a classificação do ambiente na lista ao lado do arquivo (veja a seção seguinte). Se estiver errada ou vazia, escolha **DES**, **ITG**, **HML** ou **PRO**.
5. Clique no nome do arquivo. Aparece o aviso **Conectado em** e o nome do arquivo.
6. Se o arquivo tiver mais de um contexto, escolha o certo no campo **Contexto** da barra do topo.

A conexão vale para todas as telas do grupo Kubernetes, como [Logs](/logs) e [Linha do tempo](/incidente). Para trocar, clique em **Trocar kubeconfig**; para esquecer o cluster, clique em **Desconectar**. Desconectar não muda nada no cluster.

> **Dica:** se o kubeconfig veio do Rancher, aparece o botão **Abrir no Rancher**, que abre o mesmo cluster no navegador.

## O carimbo e a moldura do ambiente

Cada kubeconfig recebe uma classificação de ambiente, e é ela que decide o que o painel deixa fazer:

| Ambiente | O que significa | O que o painel permite |
|---|---|---|
| **DES** | Desenvolvimento | Reiniciar, com confirmação. Apagar recursos nunca. |
| **ITG** | Integração | Reiniciar, com confirmação. |
| **HML** | Homologação | Reiniciar, com confirmação e o comando à vista. |
| **PRO** | Produção | Somente leitura. Nada é alterado. |
| **sem ambiente** | Não classificado | Vale como PRO: somente leitura até você classificar. |

- A classificação vem do nome do arquivo ou do contexto (por exemplo, `loja-hml` vira HML e `erp-prd` vira PRO). Na lista aparece **pelo nome**. Se você escolher à mão, aparece **classificado por você**.
- Em qualquer ambiente, o painel nunca isola, esvazia ou marca um node (as ações `cordon`, `drain` e `taint`).
- Nas telas do grupo Kubernetes, a janela inteira ganha uma moldura que fica mais pesada conforme o risco: fina em DES, tracejada em ITG, grossa em HML e hachurada em PRO e sem ambiente. Uma faixa diz o ambiente, como **HML · homologação · ações com confirmação**.
- No topo de toda tela do grupo aparece o carimbo do ambiente, o nome do kubeconfig e o contexto, com o botão **trocar**.

> **Atenção:** confira o carimbo antes de qualquer ação. Se um kubeconfig de produção tiver um nome que não indica o ambiente, ele fica sem classificação e, por isso, somente leitura. Nunca o classifique como HML só para liberar uma ação.

## Conhecendo a tela

Depois de conectar, a tela tem três abas:

| Aba | O que mostra |
|---|---|
| **Visão geral** | A tabela de pods e, abaixo, um cartão para cada node, com uso de CPU e memória. |
| **Problemas** | Só os pods com alerta, um cartão por pod, os críticos primeiro. O número em vermelho na aba é a quantidade. |
| **Cluster Doctor** | O chat com a IA que investiga o cluster. |

No topo ficam os totais (**Pods**, **Crítico** e **Atenção**) e o botão **Atualizar**. A tela já recarrega os pods sozinha a cada 30 segundos enquanto a aba do navegador está visível.

Cada pod recebe um estado:

- **◆ crítico**: por exemplo, reiniciou 3 vezes ou mais, não consegue baixar a imagem (`ImagePullBackOff`) ou reinicia em ciclo (`CrashLoopBackOff`).
- **▲ atenção**: reiniciou uma ou duas vezes, está em `Pending` (esperando um lugar para rodar) ou ainda não está pronto.
- **● ok**: nenhum sinal de problema.

A coluna **Fase** traz o motivo em texto, como "api reiniciou 14x (último motivo: Error)".

## Passo a passo: investigar um pod com problema

1. Na **Visão geral**, os pods que precisam de atenção aparecem primeiro, em **Precisam de atenção**. Os saudáveis ficam recolhidos em **Saudáveis**; clique na linha para **mostrar**.
2. Para ver só um namespace, escolha-o na lista ao lado de **Pods** (o padrão é **todos os namespaces**). Para achar um pod, use **Buscar pod por nome…**.
3. Clique na linha do pod. Ela se abre com os logs ao vivo e o cartão **Agente de IA**.
4. Nos logs, use **Erros** ou **Warns** para ver só essas linhas, ou **filtrar por texto…**. Se o pod já reiniciou, o botão **Atual** vira **Anterior** e mostra o log do container que morreu antes do último reinício, que é onde costuma estar o erro.
5. Para a opinião da IA, clique em **Investigar com IA**. Ela lê os logs recentes e os eventos e aponta a causa provável.
6. Para ver mais detalhes, clique em **Descrever** na coluna **Ações**. Abrem as abas **Visão geral** (node, IP, containers, memória), **Imagem e ConfigMaps** (a imagem exata e as configurações que o pod lê), **Eventos** e **Diagnóstico IA**.

> **Dica:** o seletor **últimas 500** nos logs busca mais linhas do fim do log (2000 ou 10000). **Baixar** salva só as linhas visíveis, com o filtro aplicado.

### Reiniciar uma aplicação

Reiniciar recria todos os pods do dono (o Deployment, StatefulSet ou DaemonSet), um de cada vez. É a única escrita que a tela faz.

1. Na linha do pod, clique em **Reiniciar…** (ou em **Reiniciar**, no cartão da aba **Problemas**).
2. Em DES, ITG ou HML, abre a confirmação com o carimbo do ambiente e três partes: **Comando** (o `kubectl rollout restart` exato que vai rodar), **Efeito** (o que acontece) e **Perde** (o que se perde, como os logs dos pods atuais).
3. Leia o comando. Se quiser guardar os logs, cancele e baixe-os antes.
4. Clique em **Reiniciar em HML** (o botão traz o nome do ambiente). A tecla Enter não confirma: só o clique. Esc cancela.
5. Aparece o aviso de que o recurso foi reiniciado, e os pods sobem de novo um a um.

Em PRO ou sem ambiente, o mesmo botão abre uma janela **somente leitura · nada será executado**, com o comando em **Seria rodado** e o botão **Copiar comando**, para você levar ao processo de mudança da equipe.

### Conversar com o Cluster Doctor

1. Abra a aba **Cluster Doctor**. O cabeçalho mostra o cluster e o carimbo do ambiente.
2. Descreva o problema na caixa de texto (Enter envia, Shift+Enter quebra a linha) ou clique numa sugestão, como "Quais pods estão com problema neste cluster?".
3. A IA roda comandos de leitura do `kubectl` sozinha. Cada comando aparece na conversa; clique nele para ver a saída.
4. Quando a IA achar que precisa alterar algo, ela não altera: aparece um cartão **Ação de escrita (…): confirmar?** com o comando exato.
5. Leia o comando. Clique em **Confirmar e executar** para o painel rodar o comando, ou em **Recusar**. O resultado aparece como **Executado** ou **Falhou**.
6. Use **Histórico** para reabrir conversas antigas e **Nova** para começar outra. **Parar** interrompe a IA no meio.

## Como as alterações no cluster são confirmadas

- A tela só lê o cluster por conta própria. Toda alteração passa por você.
- O reinício mostra o comando exato antes e só roda depois do clique no botão de confirmação.
- No Cluster Doctor, a IA não consegue escrever: ela só propõe. Quando você confirma, o próprio painel confere o comando de novo contra as regras do ambiente e o executa. A IA recebe um acesso restrito ao cluster e ao contexto escolhidos, e cada comando passa por uma trava antes de rodar.
- Se a proposta não for permitida no ambiente (por exemplo, apagar algo em DES ou qualquer escrita em PRO), o cartão vira **Ação bloqueada**, com o motivo e o botão **Copiar comando**: se tiver certeza, você roda por conta própria.
- Algumas operações a IA nunca faz, em nenhum ambiente: ler Secrets (onde ficam senhas), entrar num container (`exec`), copiar arquivos, abrir portas ou criar recursos.
- Cada tentativa do Cluster Doctor fica registrada em `~/.workstuff/doctor-audit.log`.

## Bom saber

- Secrets nunca são lidos pela tela.
- A IA de **Investigar com IA** e **Diagnóstico IA** só lê: recebe as últimas linhas de log, os eventos e os problemas detectados, e nada roda no cluster. Use **Parar** para interromper e **Reanalisar** para pedir de novo.
- Trocar de kubeconfig ou de contexto começa uma conversa nova no Cluster Doctor: cada conversa fica presa ao cluster em que nasceu.
- O botão de lixeira na lista de kubeconfigs apaga o arquivo de `~/.kube`, depois de confirmar. O cluster não é afetado. O `~/.kube/config` nunca é apagado pelo painel, porque é o padrão de todo `kubectl` da máquina.
- Sem o `metrics-server` (o serviço do cluster que mede o uso), aparece **sem métricas**: CPU e memória mostram só o limite ou o que está reservado.

## Problemas comuns

- **A lista de pods pede um namespace.** O usuário do kubeconfig não tem permissão para listar todos os namespaces. Digite o nome do namespace no campo ao lado de **Pods** e clique em **Ver**.
- **O botão de reiniciar está travado.** O kubeconfig está como PRO ou sem ambiente. Se for mesmo um ambiente de teste, classifique-o em **Trocar kubeconfig**. Se for produção, use **Copiar comando** e o processo de mudança da equipe.
- **Aparece o aviso de que o kubeconfig autentica por um comando externo (exec).** As leituras falham até você fazer o login no terminal com o comando que esse kubeconfig usa.
- **O Cluster Doctor mostra um aviso no lugar do chat.** Ele só roda com o Claude Code. Clique em **Abrir Configurações** e troque o provedor.
- **A aba Eventos está vazia.** O Kubernetes descarta eventos depois de cerca de uma hora. Para olhar um período maior, use a [Linha do tempo](/incidente).
- **Arquivo ignorado na lista de kubeconfigs.** Ele aparece em **Ignorados por não serem kubeconfig válido**. Confira se é mesmo um kubeconfig com pelo menos um contexto.
