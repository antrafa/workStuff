# Análise

Pede à IA um relatório completo da arquitetura de um projeto da sua máquina, com diagramas, riscos e recomendações, e deixa você conversar sobre o código e guardar o relatório dentro do próprio projeto.

## Quando usar

- Você vai começar a trabalhar num projeto que não conhece e quer entender como ele está organizado.
- Você precisa documentar a arquitetura de um sistema para o time ou para a gestão.
- Você quer saber onde estão os maiores riscos técnicos antes de planejar uma refatoração.
- Você tem uma dúvida pontual, como "o que quebra se eu mudar o banco de dados?", e quer uma resposta baseada no código.

Alguns termos desta página:

- **Arquitetura** é o desenho geral do sistema: as partes que existem, o que cada uma faz e como conversam.
- **Commit** é um ponto salvo no histórico do git. A tela usa o commit atual para saber se o projeto mudou desde a última análise.
- **Persona** é um papel que a IA assume, com um jeito próprio de pensar.

Veja também [Conceitos e termos](/documentacao/conceitos).

## Antes de começar

- O projeto precisa estar numa pasta da sua máquina.
- Um provedor de IA precisa estar configurado em [Configurações](/configuracoes). Veja [Configurações](/documentacao/configuracoes).
- Opcional: se o [Catálogo](/catalogo) tiver uma persona chamada `arquiteto-software`, a IA usa o raciocínio dela ao escrever o relatório. Sem ela, o relatório sai do mesmo jeito. Veja [Catálogo](/documentacao/catalogo).

## Conhecendo a tela

- **Campo do caminho**: a pasta do projeto, por exemplo `/home/voce/workspace/loja-api`. Apertar Enter abre o relatório já salvo, se houver. O botão **Selecionar pasta** abre o seletor do sistema. A tela lembra o último projeto e o abre sozinha.
- **Gerar relatório**: começa a análise. Quando o projeto já tem relatório, o botão vira **Atualizar relatório**.
- **Análises geradas**: no topo da tela, lista os relatórios já feitos nesta máquina.
- **Relatório em andamento**: enquanto a IA trabalha, mostra os arquivos que ela está lendo e o texto que começa a sair.

Com um relatório aberto, a tela tem três abas:

| Aba | O que mostra |
|---|---|
| **Relatório** | O relatório completo, com data, commit, provedor e tempo que levou. |
| **Grafo** | O grafo de conhecimento do projeto, quando ele existe (veja abaixo). |
| **Conversar** | Um chat para perguntar sobre o código. |

## Passo a passo: gerar o relatório

1. Digite o caminho da pasta do projeto ou clique em **Selecionar pasta**.
2. Clique em **Gerar relatório**.
3. Acompanhe o andamento: primeiro a IA explora o projeto (a tela conta as leituras), depois escreve o relatório.
4. Quando terminar, o relatório aparece na aba **Relatório**. Ele traz um sumário executivo e as seções de visão geral, componentes, fluxo principal, dados, decisões, padrões, dependências, dívida técnica, recomendações e perguntas em aberto.
5. Use os botões do topo do relatório:
   - **Copiar** copia o texto.
   - **Baixar .md** baixa o relatório como arquivo Markdown.
   - **Gravar no projeto** salva o relatório em `docs/arquitetura/arquitetura-AAAA-MM-DD.md` dentro do projeto, para versionar junto do código.
   - **Refazer** refaz a análise inteira, mesmo sem mudanças no projeto.

> **Dica:** se o projeto não recebeu commits desde a última análise, **Atualizar relatório** mostra o relatório salvo na hora, sem chamar a IA e sem gastar de novo.

### Conversar sobre o código

1. Abra a aba **Conversar**.
2. Escreva a pergunta e clique em **Enviar**, ou clique numa das sugestões, como "Qual é o fluxo principal de ponta a ponta?".
3. A IA parte do relatório e confirma lendo os arquivos. Abaixo da resposta aparece quantas leituras ela fez.
4. Faça outras perguntas na sequência: ela lembra as últimas trocas da conversa.
5. Para começar do zero, clique em **Nova conversa**.

### Ver o grafo do projeto

1. Abra a aba **Grafo**.
2. Se o projeto tiver o arquivo `graphify-out/graph.html`, o grafo aparece na tela. **Abrir em aba** abre numa aba separada do navegador.
3. Se não tiver, a aba explica como gerar: rode `/graphify` no Claude Code dentro do projeto, ou `graphify extract .`. O painel não gera o grafo.

### Reabrir ou apagar uma análise antiga

1. Clique em **Análises geradas**.
2. Cada projeto mostra se o relatório está **atualizado**, **desatualizado** (com quantos commits atrás) ou com **pasta ausente**. A etiqueta **versionado** indica que o relatório foi gravado no projeto, e **grafo** indica que há grafo.
3. Clique num projeto para abrir o relatório dele.
4. Para tirar uma análise do histórico, clique na lixeira e confirme em **Remover**. O arquivo gravado em `docs/arquitetura/`, se houver, continua no projeto.

## Bom saber

- A IA só lê o código: não escreve, não executa comandos.
- O relatório só é gravado dentro do projeto quando você clica em **Gravar no projeto**. Gravar de novo no mesmo dia sobrescreve o arquivo do dia.
- Quando o projeto recebe commits depois da análise, a aba **Relatório** mostra o botão **Desatualizado: gerar de novo**.
- Projeto sem git sempre gera um relatório novo, porque não há commit para comparar.
- Se você clicar em **Parar** durante a análise, nada é salvo.
- O relatório é escrito em português.
- A análise tem um limite de 30 minutos, e é encerrada se a IA passar 5 minutos sem dar sinal.

## Problemas comuns

- **"use o caminho absoluto da pasta".** Digite o caminho completo, começando com `/` ou `~`.
- **"pasta não encontrada".** Confira o caminho; a pasta pode ter sido movida.
- **"o agente terminou sem produzir relatório".** Tente de novo com **Gerar relatório**. Se repetir, confira o provedor em [Configurações](/configuracoes).
- **O progresso mostra "sem persona".** O [Catálogo](/catalogo) não tem a persona `arquiteto-software`. O relatório sai normalmente; cadastre a persona se quiser o raciocínio dela.
- **A aba Grafo diz que o projeto não tem grafo.** Gere o grafo com o graphify no projeto e abra a aba de novo.
