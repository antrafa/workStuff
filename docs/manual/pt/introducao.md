# O que é o workStuff

O workStuff é um painel que roda no seu próprio computador e reúne num lugar só o dia a dia de quem desenvolve e de quem cuida de servidores: conferir se a máquina está pronta, clonar código, acompanhar pipelines, olhar clusters Kubernetes e pedir ajuda a uma IA, sempre sob o seu controle.

## Para quem é

- Quem desenvolve e alterna o dia inteiro entre código, Git, pipelines e ambientes, e quer uma tela só para isso.
- Quem dá suporte a aplicações que rodam no Kubernetes e precisa olhar pods, logs e incidentes sem decorar comandos.
- Quem está chegando num time e precisa descobrir o que falta na máquina antes de começar a trabalhar.

É um painel **pessoal**: roda só no seu computador, abre só no seu navegador e usa as ferramentas que você já tem instaladas (`git`, `kubectl`, `docker` e os programas de IA `claude`, `codex` ou `agy`). Nada fica exposto na rede, e os dados do painel ficam na pasta `~/.workstuff` do seu computador.

Se alguma palavra desta página for nova para você, procure em [Conceitos e termos](/documentacao/conceitos).

## As áreas principais

O menu à esquerda divide as telas em grupos. Cada grupo responde a um tipo de pergunta.

### Visão Geral

Por onde você começa. O [Início](/) mostra de relance se algo precisa de você: tarefas da Fábrica de Software, o cluster conectado, a máquina e os serviços locais ([página do manual](/documentacao/inicio)). A **Documentação** é este manual.

### Desenvolvimento

A [Fábrica](/fabrica) transforma um pedido ("adicionar um filtro na tela de pedidos") em código escrito, testado e revisado por agentes de IA, numa cópia separada do repositório, e só envia alguma coisa depois que você aprova ([página do manual](/documentacao/fabrica)). Os [Runbooks de dev](/dev-runbooks) executam comandos prontos de Git, Docker e Node com confirmação ([página do manual](/documentacao/dev-runbooks)).

### Ferramentas

Ajudantes do dia a dia para a sua máquina. A [Máquina](/maquina) diz o que falta para trabalhar e como resolver ([página do manual](/documentacao/maquina)). O [Perfil de equipe](/perfil) leva a sua configuração para outra pessoa ([página do manual](/documentacao/perfil)). Os [Conversores](/conversores) cuidam de JWT, Base64, datas, JSON e mais ([página do manual](/documentacao/conversores)). Os [Serviços locais](/servicos) mostram portas, containers e as suas aplicações locais ([página do manual](/documentacao/servicos)). As [Verificações agendadas](/agenda) avisam quando uma pipeline, um certificado ou um pod muda de estado ([página do manual](/documentacao/agenda)). O [Gerador de dados](/gerador) cria CPF, CNPJ, pessoas e empresas de teste ([página do manual](/documentacao/gerador)).

### Deploy

O que acontece entre o seu código e o servidor. Os [Repositórios](/repositorios) conectam ao GitLab ou ao GitHub e clonam projetos ([página do manual](/documentacao/repositorios)). As [Pipelines](/pipelines) acompanham as execuções de CI e pedem à IA que explique uma falha ([página do manual](/documentacao/pipelines)). A [Revisão antes do MR](/revisao) faz a IA revisar a sua branch antes de você abrir o merge request ([página do manual](/documentacao/revisao)). As [Vulnerabilidades](/vulnerabilidades) listam as falhas conhecidas nas dependências de um projeto ([página do manual](/documentacao/vulnerabilidades)).

### Kubernetes

Tudo sobre um cluster conectado. O [Cluster](/cluster) mostra pods, nodes e problemas, com logs ao vivo, diagnóstico pela IA e o chat do Cluster Doctor ([página do manual](/documentacao/cluster)). O [Requests & Limits](/recursos) compara a memória e a CPU declaradas nos manifests com o uso real ([página do manual](/documentacao/recursos)). Os [Logs](/logs) acompanham vários pods ao mesmo tempo ([página do manual](/documentacao/logs)). A [Linha do tempo](/incidente) reconstrói um incidente ([página do manual](/documentacao/incidente)). O [Comparar ambientes](/comparar) mostra o que difere entre dois namespaces ([página do manual](/documentacao/comparar)). O [Upgrade](/upgrade) lista o que quebra antes de atualizar o Kubernetes ([página do manual](/documentacao/upgrade)). Os [Runbooks](/runbooks) executam procedimentos com passos de `kubectl` ([página do manual](/documentacao/runbooks)). A [Performance](/performance) acompanha CPU, memória e restarts ao longo do tempo ([página do manual](/documentacao/performance)).

### IA

O seu material de IA e a IA fazendo trabalho de análise. O [Catálogo](/catalogo) reúne as suas skills, prompts, rules e personas e ativa cada um nos agentes de IA ([página do manual](/documentacao/catalogo)). A [Análise](/analise) escreve um relatório da arquitetura de um projeto ([página do manual](/documentacao/analise)). Os [Playbooks](/playbooks) executam receitas guiadas em que a IA faz cada passo ([página do manual](/documentacao/playbooks)).

As [Configurações](/configuracoes), no pé do menu, escolhem o provedor de IA, o idioma, o tema e quais telas aparecem no menu ([página do manual](/documentacao/configuracoes)).

## Como a interface funciona

### O menu lateral e seus grupos

- A coluna da esquerda é o menu. Clique no nome de um grupo (por exemplo **Kubernetes**) para abrir ou fechar; o número ao lado é quantas telas ele tem. O grupo da tela em que você está fica sempre aberto.
- Pare o mouse sobre o nome de uma tela para ler, em uma linha, o que ela faz.
- Clique em **workStuff**, no topo do menu, para voltar ao [Início](/).
- Numa janela estreita (no celular, por exemplo), o menu se esconde: clique no ícone de menu no canto superior esquerdo para abri-lo. Ele fecha sozinho quando você troca de tela.

### Favoritos e Alt + número

1. Abra uma tela que você usa muito.
2. Clique na estrela ao lado do nome dela, no topo da página.
3. A tela aparece em **Favoritos**, no topo do menu, com um número de 1 a 9.
4. A partir daí, aperte **Alt** mais esse número (por exemplo **Alt+1**) para abri-la de qualquer lugar.

Você pode ter até nove favoritos. Clique na estrela de novo para tirar um.

### A paleta de comandos (Ctrl+K)

Aperte **Ctrl+K** (**Cmd+K** no Mac), ou clique em **Buscar tela** no menu, para abrir uma caixa de busca sobre a página.

- Digite parte do nome ou do que a tela faz: "logs", "certificado", "cpf". Acentos e maiúsculas não importam.
- Use as setas para mover, **Enter** para abrir e **Esc** para fechar.
- **Ctrl+D** coloca a tela destacada nos favoritos, ou tira.
- Com a caixa vazia, ela mostra **Precisa de você agora** (quando o cluster conectado tem pods com problema), **Favoritos · Alt 1–9**, **Recentes** e **Todas as telas**.

### A trilha no topo

No topo da página aparecem o grupo e a tela em que você está, por exemplo **Kubernetes > Logs**. A estrela de favoritos fica logo ao lado.

### O selo de ambiente

No canto superior esquerdo há um selo que diz onde as suas ações caem.

- **LOCAL** com "esta máquina": a tela trabalha no seu próprio computador.
- Nas telas de Kubernetes, com um cluster conectado, o selo mostra a classe de ambiente do cluster (**DES**, **ITG**, **HML** ou **PRO**), o nome do kubeconfig e o contexto, mais um botão **trocar** que leva ao [Cluster](/cluster).
- Nessas telas, a janela inteira também ganha uma moldura e uma etiqueta que repete a regra: em desenvolvimento, integração e homologação, as ações pedem confirmação; em **PRO** (produção), tudo é somente leitura. Um cluster sem classe vale como **PRO** até você classificá-lo.

> **Dica:** se você vê a moldura de produção, pode olhar, mas não pode alterar nada. É de propósito.

Quando o cluster conectado tem pods com problema, aparece no topo de todas as telas um link vermelho com a contagem, que leva à lista de problemas.

### A barra de status

A barra fina no pé da janela mostra que o servidor local está respondendo (e em qual porta), a versão do `kubectl`, do `docker` e do `git`, e quais programas de IA estão instalados (`claude ok`, por exemplo). Uma ferramenta que falta aparece como **ausente**. Se a barra disser **servidor local não respondeu**, o servidor do painel está parado: veja [Primeiros passos](/documentacao/primeiros-passos).

### A ajuda de cada tela

Cada tela tem um ícone **?** ao lado do título e um link **Como usar esta tela** logo abaixo. Os dois abrem a página da tela neste manual numa janela por cima, sem você perder o que estava fazendo. O botão **Abrir na documentação** leva à página completa.

### A tela Documentação

A **Documentação** (no grupo **Visão Geral**) é o manual inteiro.

- A coluna da esquerda lista as páginas por seção, na mesma ordem do menu. A caixa **Buscar na documentação** filtra as páginas que contêm a palavra digitada.
- **Nesta página**, à direita, lista os títulos da página que você está lendo; clique num deles para pular até lá.
- Na página de uma tela, **Abrir esta tela** leva à própria tela.
- No fim, **Anterior** e **Próxima** percorrem o manual em ordem.

### Tema claro ou escuro

O ícone de sol ou de lua no canto superior direito troca na hora entre o tema claro e o escuro. Nas [Configurações](/configuracoes) você também encontra o **Automático**, que segue o sistema operacional, e a cor de destaque.

### Idioma

O painel fala português e inglês. Troque nas [Configurações](/configuracoes), em **Aparência** > **Idioma**. A página recarrega no novo idioma.

### Encerrar o painel

1. Clique no ícone vermelho de desligar, no canto superior direito.
2. Leia o aviso e clique em **Encerrar**.
3. Quando aparecer **workStuff encerrado**, clique em **Fechar aba**.

O painel se recusa a encerrar enquanto houver execução da Fábrica de Software em andamento: pare a execução antes. Para abrir de novo, use o atalho do aplicativo **workStuff** ou rode `npm run dev` (veja [Primeiros passos](/documentacao/primeiros-passos)).

## Bom saber

- Os provedores de IA sempre rodam em modo leitura sobre o seu código e os seus clusters. O único lugar em que uma IA escreve código é a [Fábrica](/fabrica), e mesmo assim numa cópia separada do repositório, nunca na sua pasta.
- Tema, cor de destaque, favoritos e itens escondidos do menu ficam salvos neste navegador. O provedor de IA e o idioma ficam salvos no seu computador, em `~/.workstuff`.
