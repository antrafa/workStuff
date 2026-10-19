# Fábrica

Transforma um pedido de mudança no código ("exportar o relatório de pedidos em CSV") em código escrito, testado, revisado e documentado por oito agentes de IA, numa cópia isolada do repositório, e só entrega depois que você aprova. Com a aba **Ideias**, ela também ajuda a amadurecer uma ideia ainda crua até virar uma lista de tarefas prontas para essa esteira.

## Quando usar

- Você tem uma demanda clara (um bug, uma melhoria pequena ou média) e quer que os agentes façam o trabalho enquanto você só decide nos pontos importantes.
- Existe uma issue aberta no GitLab ou no GitHub e você quer transformá-la em código pronto para revisão, sem começar do zero.
- Você tem uma ideia de produto ainda vaga e quer refiná-la, ouvir as críticas a ela e quebrá-la em tarefas pequenas, em ordem, antes de escrever código.
- Você só quer uma opinião rápida de um especialista (arquitetura, testes, segurança, revisão) sobre um repositório, sem mudar nada nele.

## Antes de começar

- **Um CLI de IA instalado.** Os agentes rodam por um programa de linha de comando de IA, chamado aqui de **provedor**: Claude Code, Codex ou Antigravity. O provedor padrão fica em [Configurações](/configuracoes) (veja [Configurações](/documentacao/configuracoes)).
- **O bwrap instalado.** O bwrap (bubblewrap) é uma "jaula" do Linux: um ambiente fechado (sandbox) onde o código que o agente escreveu pode rodar sem conseguir mexer no resto da sua máquina. Sem ele, o planejamento roda, mas a construção e a verificação não. A tela [Máquina](/maquina) mostra o comando para instalar.
- **O repositório clonado na sua máquina.** A Fábrica trabalha sobre uma pasta local com Git (o sistema de controle de versão que guarda o histórico do código).
- **Para importar issues ou abrir o MR sozinha:** uma conexão com o seu GitLab ou GitHub cadastrada em [Repositórios](/repositorios).

> **Dica:** se algum termo desta página for novo para você, a página [Conceitos e termos](/documentacao/conceitos) explica o vocabulário do painel.

## Conhecendo a tela

No topo ficam os botões gerais:

| Botão | O que faz |
|---|---|
| **Runbooks da Fábrica** | Abre os [Runbooks de dev](/dev-runbooks) com os procedimentos manuais da Fábrica (por exemplo, limpar worktrees que sobraram). |
| **Atualizar** | Recarrega as tarefas e os projetos. |
| **Modo guiado** | Abre o assistente passo a passo para criar a primeira tarefa. |
| **Novo projeto** | Cria um projeto, que agrupa tarefas e ideias de uma pasta. |
| **Nova Tarefa** | Cria uma tarefa direto, digitada ou importada de uma issue. |

Logo abaixo:

- **Chips de projeto.** Aparecem quando existe pelo menos um projeto: **Todos**, um chip por projeto e **Avulsas** (tarefas sem projeto). Cada chip mostra quantas tarefas tem. O chip escolhido fica no endereço da página, então recarregar ou compartilhar o link abre o mesmo projeto.
- **Cabeçalho do projeto.** Com um projeto escolhido, mostra o nome, a pasta e os repositórios encontrados nela.
- **Abas.** **Quadro** (com o número de tarefas), **Ideias** (só aparece com um projeto escolhido) e **Agentes Especializados**.
- **Contadores.** À direita das abas: **Em andamento**, **Aguardando você** (tarefas paradas esperando uma decisão sua) e **Concluídas**.

## Como uma tarefa anda pela esteira

A **esteira** é a sequência fixa de passos por onde toda tarefa passa. Cada passo é feito por um agente de IA com um papel só:

| Agente | O que faz |
|---|---|
| **Analyst** | Lê o pedido e escreve os **critérios de aceite**: frases verificáveis que dizem quando a tarefa está pronta. Se faltar uma informação de negócio, para e pergunta a você. |
| **Architect** | Escreve o plano técnico: quais arquivos mudar, riscos e cenários de teste. |
| **Implementer** | Escreve o código numa worktree isolada. |
| **Tester** | Escreve pelo menos um teste automatizado por critério de aceite. |
| **Documenter** | Atualiza a documentação afetada e escreve a descrição do MR. |
| **Reviewer** | Revisa o código em busca de bugs e confere cada critério. |
| **Security** | Faz a auditoria de segurança, em paralelo com o Reviewer. |
| **Verifier** | Tenta provar que cada problema grave apontado na revisão não existe de fato. |

Alguns termos que aparecem a partir daqui:

- **Branch** é uma linha de trabalho separada dentro do Git. Cada tarefa ganha a sua.
- **Worktree** é uma segunda pasta de trabalho do mesmo repositório, apontando para outra branch. A Fábrica cria uma por tarefa em `~/.workstuff/worktrees`, então a sua pasta de trabalho nunca é alterada.
- **Commit** é um registro salvo de uma mudança no Git.
- **MR** (merge request, que o GitHub chama de PR, pull request) é o pedido, feito no GitLab ou no GitHub, para juntar uma branch à branch principal depois de revisada.
- **Portão** (em inglês, *gate*) é uma verificação feita por código comum, não por IA, que aprova ou reprova um passo. Por exemplo: "algum arquivo mudou?" ou "o build passou?".

Você decide em três momentos: responder às dúvidas do Analyst, aprovar o plano e aprovar a entrega. Tudo entre eles roda sozinho.

Cada tarefa mostra o seu estado num selo:

| Estado na tela | O que significa |
|---|---|
| **na entrada** | Criada, nada rodou ainda. |
| **planejando** | Analyst e Architect trabalhando. |
| **aguardando respostas** | O Analyst tem dúvidas que só você responde. |
| **aguardando aprovação** | O plano está pronto para você ler. |
| **construindo** | O Implementer está escrevendo o código. |
| **QA e segurança** | Testes, documentação e revisão rodando. |
| **aguardando revisão** | A entrega está pronta para a sua decisão. |
| **concluída** | O MR foi aberto ou o merge foi feito. |
| **falhou** | A execução parou com erro; a mensagem aparece no cartão. |

## Passo a passo: a primeira tarefa com o Modo guiado

O **Modo guiado** abre sozinho na primeira visita, quando ainda não há nenhuma tarefa. Depois, clique em **Modo guiado** no topo.

1. **Como funciona.** Lê o resumo do que cada agente faz e dos três momentos em que você decide. Clique em **Próximo**.
2. **Pré-requisitos.** A tela confere se o bwrap e cada provedor (Claude Code, Codex, Antigravity) estão instalados. Escolha o **Provedor desta tarefa**; os não instalados aparecem desabilitados. **Próximo** só libera com o bwrap e o provedor escolhido presentes.
3. **Repositório.** Digite a **Pasta do repositório** ou clique em **Escolher**. A tela mostra a branch atual e avisa se há alterações não commitadas (elas não entram na tarefa). Confira:
   - **Branch base**: de onde a worktree parte e para onde o MR volta (por exemplo, `main`).
   - **Comando de verificação**: o comando que prova que o código funciona, como `npm run build`. Se o painel detectou os comandos do projeto, deixe vazio para usá-los.
   - **Comando de smoke (opcional)**: um teste rápido de "fumaça", que roda por último: sobe a aplicação, faz uma chamada e derruba. Exemplo: `npm run dev & sleep 5; curl -fs localhost:5173 >/dev/null`.
4. **Demanda.** Escreva o **Título** e a **Descrição**: o problema, o comportamento esperado, onde mexer (se souber) e como saber que ficou pronto. Para partir de uma issue, abra **Importar de uma issue do GitLab ou GitHub** e clique na issue: título e descrição são preenchidos.
5. **Agentes e custo.**
   - **Abrir o MR sozinho quando tudo estiver verificado**: marque para o MR abrir sem você quando nada bloquear e nada pedir atenção.
   - Com Claude Code, **opus para julgar, sonnet para construir (recomendado)** usa um modelo mais forte (opus) para especificar, planejar e revisar e um mais barato (sonnet) para construir, testar e documentar.
   - **Teto de custo em US$**: o gasto máximo da tarefa (vem com 5). Só tem efeito com Claude Code, o único que informa o custo.
6. **Revisar.** Confira o resumo e clique em **Criar e começar**.

A tarefa é criada, o planejamento começa na hora e a tela abre a linha do tempo da tarefa para você acompanhar ao vivo.

## Criar uma tarefa com Nova Tarefa

**Nova Tarefa** cria a tarefa direto, com todas as opções à mão. Com um projeto escolhido nos chips, a tarefa entra nesse projeto e o campo do repositório sugere os repositórios dele.

### Tarefa digitada

1. Clique em **Nova Tarefa**. A aba **Tarefa manual** abre.
2. Preencha **Título da Demanda** e **Repositório Local (Pasta do clone)** (ou clique em **Escolher**). Os dois são obrigatórios.
3. Se quiser, ajuste:
   - **Branch Base**: vazio usa a branch padrão do repositório.
   - **Provedor de IA**: vem o de Configurações.
   - **Descrição dos Requisitos**: o que precisa ser feito, arquivos afetados, critérios.
   - **Comando de verificação (opcional)** e **Comando de smoke (opcional)**.
   - **Abrir o MR sozinho quando tudo estiver verificado**.
   - **Teto de custo em US$ (opcional)**.
4. Clique em **Adicionar à Entrada**. A tarefa aparece na coluna **Entrada** do quadro.
5. No cartão, clique em **Planejar** para começar.

> **Atenção:** se o bwrap não estiver instalado, a janela avisa no topo. O planejamento roda, mas a construção não; instale antes para não pagar o planejamento à toa.

### Importar uma issue

Uma **issue** é um pedido registrado no GitLab ou no GitHub.

1. Em **Nova Tarefa**, clique na aba **Importar issue remota**. A tela busca as issues abertas nas conexões de [Repositórios](/repositorios).
2. Use **Filtrar issues por título ou repositório...** para achar a issue.
3. Clique em **Preencher**. A tela volta para **Tarefa manual** com o título (`[#42] Título da issue`) e a descrição vindos da issue, e mostra **Vinculada à issue #42 de ...**. **Desvincular** desfaz o vínculo.
4. Preencha o repositório local e clique em **Adicionar à Entrada**.

Quando o MR dessa tarefa for aberto, a descrição leva `Closes #42`, e o GitLab ou o GitHub fecham a issue quando o MR for aceito.

### Modelo por agente

Em **Modelo por agente (opcional)**, você escolhe o modelo de cada agente. **Claude: opus para julgar, sonnet para construir** preenche a combinação recomendada; **Limpar** volta tudo ao modelo da tarefa. O nome do modelo precisa existir no provedor escolhido.

## O Quadro

### As colunas

| Coluna | Estados que entram nela |
|---|---|
| **Entrada** | na entrada |
| **Planejamento** | planejando, aguardando respostas, aguardando aprovação e falhas antes da construção |
| **Construção e QA** | construindo, QA e segurança e falhas durante a construção |
| **Revisão** | aguardando revisão |
| **Concluído** | concluída |

O quadro se atualiza sozinho enquanto alguma tarefa está rodando. Se as colunas não couberem, role para o lado.

### O cartão da tarefa

Cada cartão mostra:

- O selo do estado, as linhas adicionadas e removidas (`+120/-8`) e o custo somado (`US$ 0.42`), quando o provedor informa.
- O título. Uma tarefa que veio de uma ideia mostra a chave dela (por exemplo, **M1.T2**) e, se depende de outra ainda não concluída, o selo **aguarda** com a chave da outra.
- Uma bolinha por agente: vazia quando ainda não rodou, cheia quando concluiu, piscando quando está trabalhando e vermelha quando falhou. Passe o mouse para ver o nome.
- A etapa de agora (ou a última): quem a executa, o nome da etapa, há quanto tempo e quantas ferramentas o agente chamou.
- A branch da tarefa.
- Em revisão: **QA ok** ou **QA pendente**, e **Revisão ok** ou **Achados**.
- A mensagem de erro, quando houver.

Clicar no cartão abre a linha do tempo da tarefa.

### Os botões do cartão

O botão muda com o estado:

| Estado | Botão |
|---|---|
| na entrada | **Planejar** |
| rodando | **Parar** |
| aguardando respostas | **Responder dúvidas** |
| aguardando aprovação | **Ler e aprovar o plano** |
| aguardando revisão | **Revisar entrega** |
| falhou | **Tentar de novo** e **Detalhes** |
| outros | **Detalhes** |

Os botões que não rodam nada abrem a janela da tarefa, onde você lê o que vai decidir.

### Descartar uma tarefa

1. Clique no ícone de lixeira (**Descartar tarefa**) no canto do cartão.
2. A confirmação lista o efeito: para a execução em andamento, remove a worktree e a branch e, se a tarefa veio de uma ideia, as tarefas que dependiam dela deixam de esperar por ela.
3. Clique em **Descartar**. A tarefa sai do quadro.

> **Atenção:** o código que não virou MR nem merge se perde, junto com o histórico das execuções.

## Acompanhar a execução na linha do tempo

Clique em qualquer cartão para abrir a linha do tempo. **Voltar** retorna ao quadro.

- **Barra do topo.** **Atualizar** busca os dados agora. **Ao vivo** / **Pausado** liga e desliga a atualização automática. Ao lado ficam os mesmos botões de ação do cartão e o indicador **executando em background** ou **inativo**.
- **Faixa da tarefa.** Título, estado, hora de início, tempo total, modelo e quantas ferramentas foram chamadas.
- **Atividade dos agentes.** Tudo o que cada agente escreve e cada ferramenta que chama (ler um arquivo, rodar um comando), na hora. Filtre por **Tudo**, **Ferramentas** ou **Etapas e erros**. **Seguir o fim** mantém a lista rolando para o mais recente; **Copiar** copia toda a atividade.
- **Raias.** Uma linha por ator: **Engenheiro** (você), **Workspace** (a worktree e os commits), um por agente e **Portões**. Cada bloco é uma fase, posicionada no tempo.
- **Detalhe de uma fase.** Clique num bloco para abrir uma janela com tudo dela: **Resultado** (critérios, plano, arquivos alterados, parecer do Tester, comando e saída do portão), **Saída do agente** e **Ferramentas**.
- **Rodapé.** **Worktree isolada** mostra a branch onde o trabalho acontece.

> **Dica:** a execução roda no servidor. Fechar a linha do tempo, a janela ou a aba do navegador só para de assistir; a tarefa continua. Para interromper de verdade, use **Parar**.

## Responder às dúvidas do Analyst

Quando o Analyst encontra uma pergunta de negócio que não consegue responder lendo o código, a tarefa para em **aguardando respostas**.

1. No cartão, clique em **Responder dúvidas**.
2. Leia o resumo e a lista numerada em **Dúvidas do Analyst**.
3. Responda na caixa de texto, na mesma ordem das perguntas.
4. Clique em **Responder e Planejar**. O planejamento roda de novo do começo, agora com as suas respostas.

## Aprovar o plano

Quando a tarefa chega em **aguardando aprovação**:

1. No cartão, clique em **Ler e aprovar o plano**.
2. Leia **Critérios de aceite do Analyst** (com o que ficou **Fora do escopo**) e o **Plano Técnico do Architect**.
3. Para mudar alguma coisa, clique em **Editar plano antes de aprovar**, edite o texto e siga. **Descartar edição** volta ao plano original.
4. Clique em **Aprovar e Construir na Worktree**.

A partir daqui roda sozinho: o Implementer escreve o código, os portões conferem e, se um reprovar (nada mudou, um arquivo declarado não existe, a verificação falhou), ele recebe a falha e corrige, em até 3 tentativas. Depois vêm o Tester, o Documenter, as ferramentas de segurança instaladas (gitleaks, semgrep, npm audit), o Reviewer e o Security. O Verifier tenta derrubar cada problema grave; o que resiste volta para o Implementer corrigir, em até 2 rodadas. No fim, a branch é atualizada com a versão mais recente da base (um **rebase**: reaplicar as mudanças da tarefa sobre a base atual) e verificada de novo.

**Repositório com testes que já falhavam.** Quando uma etapa da verificação falha, a Fábrica roda a mesma verificação no commit de onde a tarefa saiu e compara as falhas. Se tudo o que falhou já falhava antes, a etapa fica marcada como **já falhava na base** e a esteira segue. Se apareceu uma falha nova, ela volta para o Implementer corrigir, com a lista do que é novo. Essa comparação só roda quando algo falha: uma suíte verde não paga nada a mais.

**Lições de tarefas anteriores.** Quando uma tarefa chega à revisão, a Fábrica guarda o que aprendeu: os problemas que a revisão confirmou, os falsos alarmes que o Verifier derrubou e os ajustes que você precisou pedir. Na próxima tarefa do mesmo repositório, essas lições vão para o Architect, o Implementer e o Reviewer, para não repetirem o mesmo erro. Se você usa o Mentat (um cofre de memória compartilhado entre agentes, em `~/.mentat`), elas vão para lá; sem ele, ficam em `~/.workstuff/factory/learnings.jsonl`. A tela [Máquina](/maquina) mostra qual dos dois está em uso, e a linha do tempo da tarefa mostra o que foi lembrado e gravado.

## Revisar a entrega

Quando a tarefa chega em **aguardando revisão**, clique em **Revisar entrega**. O topo da janela mostra a branch, o repositório, o provedor, o estado e o custo (com o teto, se houver).

### O que bloqueia e o que pede o seu olhar

Na seção **Sua decisão: ajustes e entrega**:

- **Tudo verificado: nada bloqueia e nada pede atenção.** Pode entregar.
- **Bloqueia a entrega** (em vermelho): por exemplo, nenhum comando de verificação, verificação falhando, conflito com a base atual, achado grave que o Verifier não derrubou, critério de aceite não atendido ou revisão que não rodou.
- **Pede o seu olhar** (em amarelo): por exemplo, critério sem teste automático, achado que o Verifier refutou, achado de severidade média, ferramenta de segurança não instalada, mudança com mais de 400 linhas, alteração em caminhos sensíveis (CI, Docker, migração, autenticação) ou verificação que só passou porque as falhas já existiam na base.

Essa lista é calculada por código a partir dos relatórios, não pela opinião de um agente.

### As abas da revisão

| Aba | O que mostra |
|---|---|
| **Diff de Código** | As diferenças entre o código antes e depois (o **diff**), agrupadas em **Lógica central**, **Integração & API**, **Testes** e **Docs & Metadados**. Tem busca por arquivo, **Expandir todos**, **Recolher todos** e o **Raio de Impacto** de cada arquivo: quantos outros módulos o usam e se eles têm testes. |
| **QA & Testes** | Cada etapa da verificação (passou ou o código de saída), o teste de cada critério de aceite (**testado**, **sem teste automático** ou **faltando**) e a saída da verificação. |
| **Revisão e Segurança** | **Sem bloqueios** ou **Há bloqueios**, cada critério (**atendido** ou **não atendido**), as ferramentas de segurança e os **Achados**, com severidade, arquivo e confiança. Um achado refutado aparece riscado com o motivo. |
| **Linha do Tempo (Trace)** | A cascata de todas as fases com duração e ferramentas. |

### Pedir um ajuste

1. Escreva o que mudar em **Precisa de alterações? Digite o ajuste para o Implementer...**, ou clique em **Pedir correção** ao lado de um achado para preencher o pedido com ele.
2. Clique em **Solicitar Ajuste**.

O ajuste passa pelo mesmo caminho da construção (portões, Tester, revisão). Se falhar ou for parado, o código volta ao ponto revisado e a tarefa continua em **aguardando revisão**.

### Entregar como MR

1. Clique em **Criar MR/PR Remoto**.
2. A Fábrica envia a branch para o servidor Git (um **push**) e abre o MR pela conexão de [Repositórios](/repositorios), com a descrição escrita pelo Documenter.
3. O MR abre numa aba nova e a tarefa vai para **concluída**. A worktree é removida; a branch continua no servidor.

Se nenhuma conexão corresponder ao repositório, ou se o servidor recusar, a branch fica publicada e a janela avisa para abrir o MR à mão.

### Fazer merge local

O **merge** junta a branch da tarefa à branch base. Use quando não quer MR, só o código na sua máquina.

1. Clique em **Merge Local**.
2. A confirmação mostra o comando (`git merge --no-ff ...`): a Fábrica troca para a branch base no seu repositório, junta, e volta para a branch em que você estava. Não faz push.
3. Clique em **Mesclar**. A worktree e a branch da tarefa são removidas.

> **Atenção:** o merge local exige o seu repositório sem alterações pendentes. Faça commit ou guarde as mudanças antes.

### Entregar mesmo com bloqueios

Com algum item em **Bloqueia a entrega**, os botões de MR e de merge ficam travados.

1. Em **Entregar mesmo assim: por quê?**, escreva o motivo com pelo menos 10 caracteres (por exemplo, "o teste que falha também falha na main").
2. Os botões liberam. O motivo e a lista de bloqueios entram na descrição do MR, para quem for revisar.

### Outros botões

- **Abrir no Editor** abre a worktree no VS Code ou no editor padrão, para você olhar ou mexer à mão.
- **Descartar** descarta a tarefa, como no cartão.
- **Abrir MR/PR** aparece no topo depois que o MR foi aberto.

## Quando algo falha ou precisa parar

- **Parar.** O botão **Parar** (no cartão, na linha do tempo ou na janela) interrompe a execução e volta a tarefa ao último ponto de decisão: um planejamento volta para **na entrada** (ou para o plano anterior, se já havia um), uma construção volta para **aguardando aprovação** e um ajuste volta para **aguardando revisão**.
- **Tentar de novo.** Com a tarefa em **falhou**, clique em **Tentar de novo** no cartão (ou **Tentar Novamente** na janela). Se já havia plano, a construção recomeça do zero com ele; sem plano, o planejamento roda de novo.
- **Trocar o provedor ou o teto.** Na janela de uma tarefa com erro, use **Alterar Provedor** e **Teto US$** e clique em **Salvar** antes de tentar de novo.
- **Teto de custo.** É conferido antes de cada agente, somando todas as execuções da tarefa. Ao atingir, a tarefa para com erro. Uma execução pode passar um pouco do teto, porque o custo só chega quando ela termina.

## Projetos

Um **projeto** é uma pasta que agrupa tarefas e ideias. Os repositórios Git dentro dela (até dois níveis abaixo) são encontrados sozinhos. Ideias e tarefas ficam guardadas nos dados do painel, nunca dentro da pasta.

### Criar um projeto

1. Clique em **Novo projeto**.
2. Escolha:
   - **Usar pasta existente**: informe a **Pasta do projeto** (ou **Escolher**).
   - **Criar pasta nova**: informe a **Pasta pai** e o **Nome da pasta nova**. Deixe marcado **Iniciar repositório git (git init + primeiro commit vazio)** para a pasta já nascer como repositório.
3. Se quiser, dê um **Nome (opcional)**; sem ele, vale o nome da pasta.
4. Clique em **Criar projeto**. O projeto fica escolhido nos chips.

### Filtrar o quadro por projeto

Clique num chip: **Todos** mostra tudo, o chip do projeto mostra só as tarefas dele e **Avulsas** mostra as que não têm projeto. Uma tarefa criada com **Nova Tarefa** enquanto um projeto está escolhido entra nele.

### Trazer tarefas avulsas

Com um projeto escolhido, clique em **Trazer tarefas avulsas**. As tarefas sem projeto cujo repositório fica dentro da pasta do projeto passam para ele, e um aviso diz quantas foram.

### Excluir um projeto

1. Com o projeto escolhido, clique em **Excluir projeto**.
2. Se o projeto tem tarefas, decida se marca **Descartar também as N tarefa(s) dele**. Sem marcar, elas viram avulsas, com worktrees e branches intactas; marcando, são descartadas.
3. Digite o nome do projeto para confirmar e clique em **Excluir projeto**.

A pasta no disco não é tocada. As ideias do projeto, com conversas e planos, se perdem.

## Ideias: da ideia às tarefas

A aba **Ideias** existe dentro de um projeto. Ela leva uma ideia crua por cinco fases, sempre nesta ordem: **Explorar**, **Desafiar**, **Refinar**, **Plano** e **Quebrar**. No fim, as tarefas vão para o quadro. Os agentes de ideação só leem a pasta do projeto; nada é escrito nela.

### Criar uma ideia

1. Escolha o projeto nos chips e abra a aba **Ideias**.
2. Clique em **Nova ideia**.
3. Preencha **Título** e **A ideia, com as suas palavras**: o que você quer, para quem e por que agora. Pode ser crua.
4. Clique em **Começar**. A ideia abre.

A lista de ideias mostra a fase de cada uma, um ponto piscando quando um agente está rodando e a data da última mudança.

### A tela da ideia

- **Fases.** Uma faixa numerada com as cinco fases e a atual em destaque. Passe o mouse sobre uma fase para ver para que ela serve.
- **O que fazer agora.** Uma caixa azul diz para que serve a fase atual e o que você faz nela, passo a passo.
- **Para seguir.** Lista o que ainda falta para a fase fechar, dizendo como resolver cada item. Quando não falta nada, aparece **Tudo o que a fase pede está lá. Leia o documento ao lado e, se ele diz o que você quer, aprove.** e o botão **Aprovar e ir para** (seguido do nome da próxima fase) libera. **Voltar uma fase** reabre a fase anterior.
- **Conversa.** O diálogo com os agentes. Passe o mouse sobre o nome de um agente para ver o papel dele.
- **Documento vivo.** O resumo da ideia, organizado em seções (problema real, público, premissas e riscos, versão refinada e outras), que a conversa vai preenchendo. É a partir dele que o plano é feito.

Se você ainda não sabe responder algo que a fase pede, diga isso ao facilitador: ele registra a seção como um palpite a conferir depois ("hipótese — verificar"), e a fase pode seguir.

### Conversar com o facilitador

O **facilitador** é o agente que conduz a conversa. Em cada rodada, ele reescreve a ideia como problema e faz até três perguntas, cada uma com a resposta que ele recomenda.

1. Clique em **Começar** (depois da primeira vez, o botão vira **Próxima rodada**).
2. Cada pergunta (Q1, Q2, Q3) vem com a resposta que o facilitador recomenda, em **Recomendado:**. Clique em **Usar esta resposta** para copiá-la para a sua resposta, ou escreva a sua.
3. Clique em **Enviar** (ou Ctrl+Enter).
4. Quando quiser pular as perguntas restantes, clique em **Completar com as recomendações**: o facilitador preenche o que falta na fase com as respostas que ele recomendou, marcadas como premissas a confirmar depois.

Enquanto um agente roda, **Parar** interrompe. Só um agente roda por ideia de cada vez.

### Piloto automático

Para uma ideia que você não precisa discutir pergunta a pergunta, clique em **Piloto automático**, na caixa **Para seguir**. Ele roda as fases sozinho, da fase atual até a quebra em tarefas, aceitando as recomendações dos agentes:

- Em Explorar e Refinar, o facilitador preenche o que falta com as respostas que ele recomenda, marcadas como premissas a confirmar depois.
- Em Desafiar, roda uma rodada e decide cada ataque pela resposta do blue team: **Defende** vira descartar, **Mitiga** vira mitigar e **Concorda** vira risco aceito. Na conversa, cada decisão leva a nota "decidido pelo piloto automático".
- O plano e a quebra rodam em seguida.

O piloto para e chama você quando:

- um ataque de gravidade alta não foi rebatido pelo blue team: decida esse ataque no cartão e rode o piloto de novo;
- o facilitador recomenda mudar o rumo (pivot) ou parar (stop);
- uma fase não fecha mesmo depois de o agente tentar;
- a quebra fica pronta. Ele **nunca envia à fábrica**: revise as premissas no documento vivo, os ataques decididos e as tarefas, e clique em **Enviar à fábrica**.

O motivo da parada aparece na conversa e numa caixa amarela abaixo de **Para seguir**. **Parar** interrompe o piloto, e **Voltar uma fase** desfaz o que ele assumiu numa fase.

### Explorar

Descobre o problema real, quem o tem e o que essa pessoa faz hoje para contorná-lo. O portão pede as seções de problema, público, "job to be done" (a tarefa que a pessoa quer cumprir) e contorno atual preenchidas.

### Desafiar

O **red team** ataca a ideia e o **blue team** defende cada ataque. Os dois nunca conversam entre si: quem decide é você.

1. No painel **Críticas e defesas**, clique em **Rodar o desafio**.
2. Cada ataque aparece com um código (A1, A2...), a gravidade (alta, média ou baixa), o quanto há de evidência e o assunto atacado; abaixo vem a resposta do blue team (**Defende**, **Mitiga** ou **Concorda**) e, quando houver, a mitigação proposta.
3. Para cada ataque, escreva por que decidiu assim (opcional) e escolha:
   - **Adotar a mitigação**: o jeito que o blue team propôs para reduzir o risco vira um requisito da ideia.
   - **Aceitar o risco**: você segue sabendo do risco, que fica registrado no documento.
   - **Não procede**: a crítica não vale para esta ideia.
   - **Encerra a ideia**: a crítica é fatal; a ideia é encerrada com esse ataque como motivo.
4. Se quiser, depois de decidir todos, clique em **Rodada 2: atacar a versão mitigada**. São no máximo 2 rodadas.

As decisões vão para a seção "Decisões do desafio" do documento. O portão pede pelo menos uma rodada, nenhum ataque de severidade alta sem decisão e as seções de premissas e pre-mortem (o exercício de imaginar que a ideia já fracassou e perguntar por quê) preenchidas.

### Refinar

O facilitador propõe três opções de solução (uma delas sem software), a menor versão que testa a premissa mais arriscada e uma recomendação: **go** (seguir), **pivot** (mudar o rumo) ou **stop** (parar). O botão de seguir acompanha a recomendação:

- **Aprovar e ir para Plano**, com go: segue para o Plano.
- **Mudar o rumo (pivot): voltar a Explorar**: volta à primeira fase, com o documento preservado.
- **Parar (stop): encerrar a ideia**: a ideia vai para **Encerrada**.

Uma ideia encerrada pode voltar com **Reabrir**, que a leva para Desafiar (ou para Refinar, se ela não passou pelo desafio), com tudo guardado.

### Plano

O **Planner** escreve as **etapas do trabalho**, chamadas de **tarefas master**: entregas grandes, em ordem (M1, M2...). A primeira é o **walking skeleton**: a menor versão do sistema que já funciona de ponta a ponta, mesmo que quase vazia, para provar que as partes se conectam. Cada etapa traz objetivo, repositórios, o que está no escopo e fora dele e, em **Quando está pronta (cenários de aceite)**, os cenários em **Gherkin**: exemplos escritos no formato "Dado... Quando... Então..." que dizem como conferir que ficou pronto.

1. Se quiser, escreva instruções para o Planner (por exemplo, "o admin fica para depois").
2. Clique em **Gerar o plano** (depois, **Refazer o plano**).
3. Para corrigir à mão, clique em **Editar (YAML)**, altere o texto e clique em **Salvar**. YAML é um formato de texto estruturado, com uma linha por campo.

O código confere o plano: exatamente um walking skeleton, sem depender de outra master; toda master com repositório e cenário; nenhuma dependência circular; e repositórios que existem no projeto (ou declarados como novos). Se o Planner errar, ele recebe os erros e tenta de novo, até 3 vezes; o que ainda estiver errado aparece em **Ainda falta corrigir antes de seguir**, para você pedir a correção nas instruções ou editar à mão.

> **Atenção:** refazer ou editar o plano apaga as tarefas que tinham sido quebradas a partir dele.

### Quebrar em tarefas

O **Splitter** quebra cada etapa em **tarefas para a fábrica**, cada uma num repositório só e numa stack só. **Stack** é o tipo de trabalho: `backend`, `frontend`, `mobile`, `infra` ou `docs`. Uma tarefa que mexeria nas duas pontas vira duas.

1. Se quiser, escreva instruções para o Splitter.
2. Clique em **Quebrar as etapas em tarefas**. Depois, **Quebrar todas as etapas de novo** refaz tudo, e **Refazer M1** refaz só uma etapa.
3. Abra cada tarefa para ver objetivo, escopo, **Combinado com as outras tarefas (contratos)** (por exemplo, o endpoint que uma cria e a outra usa), cenários e o **Comando que confere** sugerido.
4. **Editar (YAML)** permite corrigir à mão.

O código confere que todo cenário de cada etapa ficou em alguma tarefa, que nenhuma etapa ficou sem tarefa e que as dependências existem e não formam um círculo.

### Enviar à fábrica

1. Quando **Para seguir** não listar mais nada na fase Quebrar, clique em **Enviar à fábrica**.
2. Cada tarefa vira uma tarefa no quadro do projeto, na coluna **Entrada**, com o título `[M1.T1] ...` e os cenários em Gherkin como critérios de aceite, que chegam ao Analyst como CA1, CA2... e ficam primeiro, sem alteração.
3. As tarefas são criadas na ordem das dependências.
4. Uma tarefa cujo repositório ainda não existe (porque outra tarefa vai criá-lo) fica para depois, assim como as que dependem dela. Elas aparecem em **Aguardando um próximo envio:**. Clique em **Enviar à fábrica** de novo quando o repositório existir; o que já foi enviado não é enviado duas vezes.

Quando tudo foi enviado, a ideia passa para **Na fábrica** e o painel **No quadro** mostra o estado de cada tarefa.

### Dependências: o selo "aguarda"

Uma tarefa que depende de outra mostra no cartão o selo **aguarda** com a chave da outra (por exemplo, **aguarda M1.T1**). O planejamento dela só começa quando a outra estiver **concluída**; antes disso, **Planejar** é recusado com a mensagem para concluir (e fazer o merge) da anterior.

### Voltar uma fase

**Voltar uma fase** reabre a anterior sem apagar o que veio depois. As fases seguintes ganham a marca ⟲: o que está nelas fica guardado, mas pode estar desatualizado, e deve ser refeito quando você chegar lá de novo.

### Exportar e excluir

- **Exportar** baixa o documento vivo como um arquivo Markdown (`.md`, texto simples com formatação leve).
- **Excluir**, na tela da ideia ou pela lixeira na lista, para o agente que estiver rodando e apaga a conversa, o documento vivo, o plano e as tarefas quebradas. As tarefas já enviadas continuam no quadro.

## Agentes Especializados

Esta aba chama um agente sozinho, fora da esteira, para uma consulta rápida. O agente sempre roda em modo leitura, direto na pasta que você indicar: nada é alterado.

### Consultar um agente

1. Clique no cartão do agente: Analyst, Architect, Implementer, Tester, Reviewer, Security, Documenter, Red team ou Planner.
2. Preencha **Repositório Alvo** (ou **Escolher**) e escolha o **Provedor de IA**.
3. Escreva a instrução em **Instrução para o <agente>**. O exemplo na caixa mostra o tipo de pedido que ele atende.
4. Clique em **Executar <agente>**. A resposta aparece em **Resposta do <agente>**, enquanto é escrita. **Interromper** para.

Implementer, Tester e Documenter, aqui, descrevem em texto o que fariam, sem mexer na pasta.

### Red team e Planner sozinhos

Os dois agentes da aba Ideias também estão aqui, para quando você quer só uma opinião, sem abrir uma ideia:

- **Red team**: o advogado do diabo. Descreva a ideia como contaria a um colega e ele aponta onde ela pode falhar, que custo esconde e o que você está dando como certo.
- **Planner**: diga o que quer construir e o que fica de fora, e ele devolve um plano de etapas grandes, em ordem, começando pela menor versão que já funciona.

### Runbooks do agente

Abaixo do formulário, a maioria dos agentes traz **Runbooks do <agente>**: procedimentos prontos para o momento em que ele ajuda (por exemplo, **Pre-flight do repositório** antes de delegar, **Conflitos de rebase** quando o rebase para). Clique num deles para abri-lo numa janela. Os comandos rodam na pasta do **Repositório Alvo**: leitura roda direto, e o que altera o repositório pede confirmação. **Todos os runbooks** abre os [Runbooks de dev](/dev-runbooks).

## Bom saber

- Todo código é escrito em worktrees em `~/.workstuff/worktrees`. A sua pasta de trabalho só muda se você escolher **Merge Local**.
- O agente que escreve código e a verificação rodam dentro do bwrap, porque executam código escrito pela IA. Só a worktree e as pastas de cache do build ficam graváveis.
- A verificação roda todas as etapas que o projeto tem, uma de cada vez (lint, typecheck, test, check e build num projeto Node; `mvn -q verify` em Maven; `go vet` e `go test` em Go), mais o comando de smoke. Sem nenhuma, nada é verificado e a entrega fica bloqueada até você justificar.
- O veredito da revisão é calculado em código: bloqueia achado de severidade high ou critical com confiança 75 ou mais e critério de aceite não atendido.
- Custo e tokens (as unidades de texto que a IA cobra) aparecem quando o provedor informa: Claude informa os dois, Codex só os tokens e Antigravity nenhum.
- **Abrir o MR sozinho** nunca faz merge local sozinho, só abre MR, e só quando nada bloqueia nem pede atenção.
- Ao clicar em **Criar MR/PR Remoto** ou **Merge Local**, se a base andou desde a revisão, a Fábrica faz o rebase e verifica de novo antes. O clique pode levar alguns minutos.
- Reiniciar o servidor do painel no meio de uma execução a interrompe: a tarefa vai para **falhou** e pode ser retomada com **Tentar de novo**.

## Problemas comuns

- **O wizard não deixa passar de Pré-requisitos.** Falta o bwrap ou o provedor escolhido não está instalado. Instale o bubblewrap (a tela [Máquina](/maquina) mostra o comando) ou escolha outro provedor.
- **O QA aparece reprovado dizendo que o bwrap não está instalado.** Sem o bwrap, a verificação não roda. Instale e use **Tentar de novo**.
- **A entrega está bloqueada com "Nada foi verificado".** O projeto não tem comando de verificação que o painel reconheça. Para esta tarefa, escreva em **Entregar mesmo assim: por quê?** o motivo de seguir sem ele; nas próximas, preencha o **Comando de verificação** ao criá-las.
- **A tarefa parou com "Teto de custo atingido".** Abra **Detalhes**, aumente o **Teto US$**, clique em **Salvar** e depois em **Tentar Novamente**.
- **Aparece "Falha de Autenticação no Provedor".** A sessão do CLI de IA expirou. Faça login de novo no terminal (por exemplo, `claude login`) ou troque o provedor em **Alterar Provedor**.
- **A branch foi enviada, mas o MR não abriu.** Nenhuma conexão de [Repositórios](/repositorios) corresponde ao repositório, ou o GitLab/GitHub recusou. A mensagem traz o motivo; abra o MR à mão.
- **O merge local foi recusado.** O seu repositório tem alterações pendentes. Faça commit ou guarde as mudanças e tente de novo.
- **Planejar foi recusado com "esta tarefa espera ...".** Ela depende de outra tarefa da mesma ideia. Conclua (e faça o merge) da tarefa indicada primeiro.
- **A aba Ideias não aparece.** Ideias vivem num projeto: escolha um projeto nos chips ou crie um com **Novo projeto**.
- **Enviar à fábrica deixou tarefas em "Aguardando um próximo envio".** O repositório delas ainda não existe. Conclua a tarefa que o cria e clique em **Enviar à fábrica** de novo.
- **Descartar diz que a execução ainda está parando.** Espere alguns segundos e tente de novo.
