# Início

A primeira tela do painel: mostra de relance se algo precisa de você, passando pela Fábrica de Software, pelo cluster Kubernetes conectado, pela sua máquina e pelos serviços rodando nela, com atalhos para as telas que você mais usa.

## Quando usar

- Você acabou de abrir o painel e quer saber se alguma tarefa espera a sua aprovação ou se um cluster tem pods com problema.
- Você quer conferir se a máquina continua pronta para trabalhar depois de instalar ou atualizar alguma coisa.
- Você quer começar uma tarefa nova na Fábrica ou pular para uma tela que usa todo dia.

## Conhecendo a tela

A tela tem quatro partes, de cima para baixo.

**Cartões de status.** Quatro cartões, cada um é um link para a tela que ele resume:

| Cartão | O que mostra | Clique para abrir |
|---|---|---|
| **Fábrica de Software** | Quantas **tarefas em andamento**, e abaixo quantas esperam **Aprovação**, quantas estão em **Revisão** e quantas estão **Concluídas**. Enquanto um agente trabalha, aparece um contador verde de "rodando". | [Fábrica](/fabrica) |
| **Cluster Kubernetes** | Com um cluster conectado, quantos **pods com problema** (em vermelho quando há pelo menos um), o selo de ambiente e o **Contexto**. Sem cluster, **Desconectado**. | [Cluster](/cluster) |
| **Máquina & Doctor** | Quantas **pendências** obrigatórias a sua máquina tem, ou quantos **itens ok** quando não falta nada, mais a quantidade de avisos. **Apta** aparece quando não há pendência. | [Máquina](/maquina) |
| **Serviços Locais** | Quantas **portas em escuta** existem na sua máquina, se o Docker está **Ativo** ou **Inativo** e quantos containers existem. | [Serviços locais](/servicos) |

**Fábrica de Software e Agentes Autônomos.** As quatro tarefas mais recentes da Fábrica, cada uma com título, branch, data de criação e estado. Uma tarefa que espera você mostra **Aguardando aprovação**. Clique numa tarefa, ou em **Abrir Fábrica Completa**, para ir à [Fábrica](/fabrica).

**Cluster & Observabilidade** e **Ambiente de Desenvolvimento Local.** Dois cartões lado a lado. O primeiro mostra o kubeconfig conectado, o selo de ambiente, o contexto e quantos contextos o arquivo tem, e avisa quando há pods com problema; os botões dele abrem o [Cluster](/cluster), os [Logs](/logs), a [Linha do tempo](/incidente) e o [Requests & Limits](/recursos). O segundo diz se o diagnóstico da máquina está **Tudo pronto** ou quantas pendências há; os botões dele abrem os [Runbooks de dev](/dev-runbooks), os [Repositórios](/repositorios), a [Revisão antes do MR](/revisao) e as [Pipelines](/pipelines).

**Ferramentas de Engenharia & Produtividade.** Atalhos para os [Runbooks de dev](/dev-runbooks), o [Catálogo](/catalogo), os [Conversores](/conversores), o [Gerador de dados](/gerador), as [Vulnerabilidades](/vulnerabilidades) e os [Runbooks](/runbooks) de Kubernetes.

## Passo a passo: ver se algo precisa de você

1. Abra o painel, ou clique em **workStuff** no topo do menu para voltar para cá.
2. Olhe o cartão **Fábrica de Software**. Se **Aprovação** for maior que zero, uma tarefa espera você ler e aprovar o plano: clique no cartão para ir à Fábrica.
3. Olhe o cartão **Cluster Kubernetes**. Um número vermelho de **pods com problema** quer dizer que algo está falhando no cluster conectado: clique no cartão para ver quais pods.
4. Olhe o cartão **Máquina & Doctor**. Se ele mostrar **pendências**, clique nele, ou em **Resolver pendências agora** no cartão **Ambiente de Desenvolvimento Local**, para ver o que falta e como resolver.
5. Para ler tudo de novo sem esperar, clique em **Atualizar** no canto superior direito.

### Começar uma tarefa nova na Fábrica

1. Clique em **Nova Tarefa na Fábrica**, no canto superior direito.
2. A [Fábrica](/fabrica) abre. Siga a página dela no manual, [Fábrica](/documentacao/fabrica), para criar a tarefa.

Se nenhuma tarefa foi criada ainda, o cartão **Fábrica de Software e Agentes Autônomos** mostra **Iniciar Primeira Demanda**, que também leva à Fábrica.

## Bom saber

- A tela lê tudo de novo sozinha a cada 10 segundos, sem chamar atenção. **Atualizar** só força uma leitura agora.
- A tela só lê: nada aqui altera a sua máquina, o seu cluster ou as suas tarefas. Toda ação acontece na tela que o cartão abre.
- O cartão do cluster mostra o cluster conectado no [Cluster](/cluster). Para olhar outro, troque por lá.

## Problemas comuns

- **O cartão do cluster diz Desconectado.** Nenhum cluster está conectado. Vá ao [Cluster](/cluster) e escolha um kubeconfig; veja [Primeiros passos](/documentacao/primeiros-passos).
- **Todos os números estão zerados, mesmo com tarefas na Fábrica.** O servidor do painel pode não estar respondendo. Olhe a barra no pé da janela: se ela disser **servidor local não respondeu**, suba o painel de novo ([Primeiros passos](/documentacao/primeiros-passos)).
- **O Docker aparece Inativo, mas está instalado.** O painel pergunta o estado ao Docker e não teve resposta: o serviço do Docker está parado, ou o seu usuário não tem permissão para usá-lo. Suba o serviço e clique em **Atualizar**.
