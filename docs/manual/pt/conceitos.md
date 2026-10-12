# Conceitos e termos

Um glossário das palavras que o painel usa, explicadas para quem não é especialista. Cada termo diz, quando ajuda, qual tela o usa.

## Git e revisão de código

### Repositório

A pasta que guarda o código de um projeto junto com todo o histórico de alterações. Ele fica no GitLab ou no GitHub, e você mantém uma cópia (um clone) no seu computador. Veja [Repositórios](/repositorios).

### Branch

Uma linha de trabalho separada dentro do mesmo repositório. Você altera o código na sua branch (por exemplo `feature/exportar-csv`) sem mexer na principal, em geral a `main`, até o trabalho ficar pronto.

### Commit

Um registro salvo de um conjunto de alterações, com uma mensagem dizendo o que mudou e por quê. Uma branch é uma sequência de commits.

### Diff

A lista de diferenças entre duas versões do código: quais linhas entraram, saíram ou mudaram. A [Revisão antes do MR](/revisao) e a [Fábrica](/fabrica) mostram o diff da sua branch contra a base.

### Merge

Levar os commits de uma branch para outra, por exemplo da sua branch para a `main`. A [Fábrica](/fabrica) pode fazer um merge local no seu computador, sem enviar nada.

### MR / PR

Merge request (GitLab) ou pull request (GitHub): o pedido para levar uma branch para outra, em que os colegas leem o diff e comentam antes do merge. A [Revisão antes do MR](/revisao) olha a sua branch antes de você abrir um.

### Worktree

Uma segunda pasta de trabalho do mesmo repositório, em outra branch, que não interfere na sua pasta. A [Fábrica](/fabrica) faz todo o trabalho em worktrees dentro de `~/.workstuff/worktrees`, então o seu checkout nunca é tocado.

### Pipeline de CI

A sequência de etapas automáticas (build, testes, deploy) que o GitLab CI ou o GitHub Actions roda a cada alteração. Cada etapa é um job. Veja [Pipelines](/pipelines).

### Token

Uma chave de acesso pessoal, criada no GitLab ou no GitHub, que deixa o painel agir em seu nome, como uma senha com permissões limitadas. O painel guarda o token só no seu computador e nunca o coloca no endereço do clone. Veja [Repositórios](/repositorios).

## Kubernetes

### Cluster

Um conjunto de máquinas que o Kubernetes administra como se fosse uma só, onde as aplicações rodam. A tela [Cluster](/cluster) conecta em um de cada vez.

### Kubeconfig

O arquivo que diz como chegar a um cluster: o endereço e as suas credenciais. Eles ficam na pasta `~/.kube`. O painel lista esses arquivos no [Cluster](/cluster) e permite adicionar um.

### Contexto

Dentro de um kubeconfig, uma combinação com nome de cluster, usuário e namespace padrão. Um arquivo pode ter vários contextos; você escolhe um ao conectar.

### Namespace

Uma divisão com nome dentro de um cluster, que agrupa as peças de uma aplicação, por exemplo `pedidos-hml`. A maioria das telas de Kubernetes pergunta qual namespace olhar.

### Pod

A menor coisa que roda no Kubernetes: um ou mais containers de uma aplicação rodando juntos. Quando uma aplicação tem problema, em geral é um pod que falha, reinicia ou não sobe.

### Node

Uma das máquinas do cluster, onde os pods rodam. A tela [Cluster](/cluster) lista os nodes.

### Deployment

A descrição de uma aplicação no Kubernetes: qual imagem rodar, quantas cópias e com quais configurações. O Kubernetes cria e substitui os pods para cumprir essa descrição. StatefulSet e DaemonSet são variações para outros tipos de aplicação.

### Réplica

Cada cópia do pod de uma aplicação. Três réplicas são três pods iguais dividindo o trabalho. O [Comparar ambientes](/comparar) mostra quando dois ambientes têm quantidades diferentes de réplicas.

### Requests e limits

Quanto de CPU e memória um pod reserva (request) e o máximo que ele pode usar (limit). Acima do limite de memória o pod é derrubado; acima do limite de CPU ele fica mais lento (throttling). Veja [Requests & Limits](/recursos).

### Restart

Quando um container para e o Kubernetes o sobe de novo. Muitos restarts indicam problema, como falta de memória. No [Cluster](/cluster), "reiniciar" também é a ação que recria os pods de um Deployment, StatefulSet ou DaemonSet, permitida só em DES, ITG e HML.

### Rollout

A troca para uma nova versão de um Deployment: o Kubernetes substitui os pods antigos por novos. A [Linha do tempo](/incidente) mostra cada rollout ao lado dos erros.

### Logs

As mensagens de texto que uma aplicação escreve enquanto roda. Veja por pod no [Cluster](/cluster), ou de vários pods ao mesmo tempo em [Logs](/logs).

### Eventos

Avisos curtos que o próprio Kubernetes registra sobre o que aconteceu com um pod ou node: "não consegui baixar a imagem", "derrubado por falta de memória", "agendado no node X". Ajudam a explicar uma falha.

### Certificado

O arquivo que comprova a identidade de um site ou serviço e criptografa a conexão (TLS). Ele tem data de validade; um certificado vencido derruba o serviço. O [Upgrade](/upgrade) e as [Verificações agendadas](/agenda) avisam antes disso acontecer.

### API depreciada

Um formato de recurso que o Kubernetes anunciou que vai abandonar e depois remove numa versão mais nova. Um manifest que ainda usa esse formato para de funcionar depois da atualização. O [Upgrade](/upgrade) lista essas APIs.

### Classe de ambiente

A etiqueta que o painel dá a cada kubeconfig: **DES** (desenvolvimento), **ITG** (integração), **HML** (homologação) ou **PRO** (produção). Ela decide o que o painel deixa você fazer: PRO é somente leitura, DES nunca apaga, e um cluster sem classe vale como PRO.

## IA e agentes

### Provedor de IA

O programa de IA instalado no seu computador que o painel chama: **Claude Code** (`claude`), **OpenAI Codex** (`codex`) ou **Google Antigravity** (`agy`). Você escolhe nas [Configurações](/configuracoes).

### Modelo

O "cérebro" de IA que o provedor usa, como `opus` ou `sonnet` no Claude Code. Modelos maiores são mais cuidadosos e mais caros; os menores são mais rápidos e mais baratos.

### Prompt

O texto com as instruções dadas à IA. Algumas telas deixam você escrever o seu; outras montam o prompt por você.

### Agente

Uma IA com um papel definido, instruções próprias e um conjunto de ferramentas que pode usar, por exemplo o Reviewer, que lê um diff e aponta problemas. A [Fábrica](/fabrica) e o Cluster Doctor, no [Cluster](/cluster), usam agentes.

### Skill

Um pacote de instruções para um tipo específico de tarefa, que a IA carrega quando precisa. O [Catálogo](/catalogo) ativa as suas skills nos agentes de IA.

### Persona

Uma descrição de como a IA deve se comportar ou de qual ponto de vista ela deve assumir, por exemplo "revisor experiente". Gerenciada no [Catálogo](/catalogo).

### Rule

Uma instrução permanente que a IA deve seguir em toda resposta, como um padrão de código. Gerenciada no [Catálogo](/catalogo).

### Playbook

Uma receita em Markdown cujos passos são prompts que a IA executa um depois do outro. Veja [Playbooks](/playbooks).

### Runbook

Um procedimento em Markdown cujos passos são comandos. Nos [Runbooks](/runbooks) são comandos `kubectl` no cluster; nos [Runbooks de dev](/dev-runbooks), comandos locais de Git, Docker e Node. Cada passo roda pelo painel, com confirmação quando altera alguma coisa.

### Modo leitura

O jeito como o painel sempre chama a IA sobre o seu código e os seus clusters: ela pode ler e pesquisar, mas não pode gravar arquivos nem rodar comandos que alteram algo. Alterações no cluster são propostas pela IA e executadas pelo painel só depois que você confirma.

### Sandbox (jail do bwrap)

Um espaço isolado em que um programa roda enxergando o resto do computador como somente leitura. O painel usa o `bwrap` (bubblewrap, só no Linux) para rodar o Antigravity e, na [Fábrica](/fabrica), os agentes que escrevem código e os testes que eles escreveram.

## Fábrica de Software

### Tarefa da Fábrica

Um pedido feito à [Fábrica](/fabrica) ("exportar o relatório de pedidos em CSV") e tudo o que acontece com ele: critérios, plano, código, testes, revisão e entrega.

### Portão

Uma verificação feita por código, não pela IA, que aprova ou reprova a entrega de um agente: algo mudou, os arquivos declarados existem, a verificação do projeto passa. Um portão reprovado devolve a falha ao agente para ele corrigir.

### Critérios de aceite

A lista de condições que dizem quando o pedido está pronto, escrita pelo agente Analyst antes de qualquer código. Cada critério precisa de pelo menos um teste.

### Cenário Gherkin

Um jeito de escrever um critério como exemplo em linguagem comum: "Dado … Quando … Então …". As tarefas que vêm de uma ideia trazem os critérios nesse formato.

### Walking skeleton

A versão mais fina de uma funcionalidade que já funciona de ponta a ponta, atravessando todas as camadas. Na aba Ideias da [Fábrica](/fabrica), a primeira tarefa master é sempre o walking skeleton.

### Projeto

Uma pasta que agrupa repositórios relacionados e as tarefas e ideias da Fábrica sobre eles. Na [Fábrica](/fabrica), os chips acima do quadro filtram por projeto.

### Ideia

Uma ideia ainda crua que a aba Ideias da [Fábrica](/fabrica) transforma em tarefas, em fases: explorar, desafiar, refinar, planejar e dividir. Cada fase só fecha quando o portão dela, conferido em código, está aberto.

### Red team / blue team

Na fase de desafio de uma ideia, o red team ataca (onde ela pode falhar?) e o blue team defende ou propõe uma mitigação. Você decide o que fazer com cada ataque.

### Tarefa master

Uma etapa grande do plano de uma ideia, escrita pelo agente Planner, com objetivo, escopo e cenários Gherkin. Chaves como `M1`, `M2`.

### Divisão (split)

Quebrar cada tarefa master em tarefas executáveis, cada uma em um único repositório e uma única stack (backend, frontend, mobile, infra ou docs), trabalho do agente Splitter. Chaves como `M1.T2`.

### Dependência

Uma tarefa que precisa estar concluída antes de outra começar. Na [Fábrica](/fabrica), uma tarefa que depende de outra mostra "aguarda" e só começa o planejamento depois que a outra termina.

## Painel

### Pasta de dados

A pasta `~/.workstuff`, onde o painel guarda configurações, conexões, tokens, histórico e worktrees. Ela nunca fica dentro da pasta do código do workStuff.

### Barra de status

A barra no pé da janela, que mostra se o servidor local está respondendo e quais ferramentas estão instaladas. Veja [O que é o workStuff](/documentacao/introducao).

### Favorito

Uma tela fixada no topo do menu e aberta com **Alt** mais um número. Veja [O que é o workStuff](/documentacao/introducao).
