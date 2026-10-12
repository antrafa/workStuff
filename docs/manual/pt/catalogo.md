# Catálogo

Junta numa tela só os arquivos que orientam os agentes de IA (skills, prompts, rules, personas, templates e notas) espalhados pelas suas pastas, e liga ou desliga cada um nos agentes instalados na máquina com um clique.

## Quando usar

- Você tem várias skills e regras em pastas diferentes e quer ver tudo num lugar só.
- Você quer que o Claude Code passe a seguir uma regra sua, por exemplo `rule-clean-code.md`, sem editar o arquivo de instruções à mão.
- Você quer ativar a mesma skill no Claude, no Codex e no Gemini de uma vez.
- Você quer procurar uma skill pronta no catálogo público skills.sh e instalá-la.

## Antes de começar

Alguns termos desta página:

- **Agente de IA** é o programa de linha de comando que conversa com o modelo e trabalha no seu código: Claude Code, Codex, Gemini/Antigravity ou OpenCode.
- **Skill** é uma pasta com um arquivo `SKILL.md` que ensina o agente a fazer uma tarefa específica. O agente só a carrega quando o assunto aparece.
- **Rule** é uma regra de trabalho que o agente deve seguir, como um guia de estilo de código.
- **Persona** é um papel que o agente assume, como "arquiteto de software", com o jeito de pensar dele.
- **Prompt** é um texto pronto para pedir algo ao agente. **Template** é um modelo de documento. **Nota** é um texto livre, sem cabeçalho de metadados.
- **Arquivo de instruções** é o arquivo que o agente lê sempre que começa, como o `~/.claude/CLAUDE.md`.
- **Frontmatter** é o bloco de metadados no topo de um arquivo Markdown, entre linhas `---`, com campos como `description`.

Veja também [Conceitos e termos](/documentacao/conceitos).

Você precisa ter pelo menos uma pasta com esses arquivos, por exemplo `~/workspace/pessoal/skills`.

## Conhecendo a tela

- **Atualizar**: varre as pastas de novo, para mostrar arquivos que você criou ou mudou fora do painel.
- **Novo item**: cria um arquivo novo numa das pastas e abre no editor.
- **Pastas**: as pastas lidas, com quantos itens cada uma tem. Uma pasta que não existe mais aparece com **pasta sumiu**. O botão **Gerenciar pastas** adiciona ou tira pastas.
- **Agentes**: os agentes que o painel sabe ativar. A etiqueta **referência @** quer dizer que o agente importa o arquivo direto; **ponteiro** quer dizer que o agente recebe o caminho e lê o arquivo quando precisa. Passe o mouse para ver o arquivo de instruções e a pasta de skills de cada um.
- **Abas por tipo**: **Skills**, **Prompts**, **Rules**, **Personas**, **Templates** e **Notas**, com a quantidade de cada. A aba Skills sempre aparece; as outras, só quando há itens.
- **Filtros**: a busca por nome, descrição ou gatilho, o filtro de pasta e o filtro de status.
- **Lista** ou **Cartões**: dois jeitos de ver os itens.

Na **Lista**, cada agente tem uma coluna com o estado do item nele:

| Estado | O que quer dizer | Ao clicar |
|---|---|---|
| **ausente** | O item não está ativo neste agente. | Ativa. |
| **ativo** | O item está ativo. | Desativa. |
| **desatualizado** | A ativação existe mas não bate mais com o item: o link sumiu ou a descrição mudou depois da ativação. | Reativa. |
| **gerenciado fora** | Já existe algo com o mesmo nome que o painel não criou. | Nada: o painel não mexe. |

Nos **Cartões**, os mesmos estados aparecem como botões com o nome do agente. Um cartão com **também em** avisa que há outro item do mesmo tipo e nome em outra pasta.

## Passo a passo: cadastrar as pastas

1. Na primeira vez, clique em **Escolher pastas**. Depois, use **Gerenciar pastas**.
2. Na janela **Pastas do catálogo**, digite o caminho e clique em **Adicionar**, ou clique em **Selecionar pasta** para usar o seletor do sistema.
3. Para tirar uma pasta, clique no X ao lado dela. Os arquivos continuam na pasta; ela só deixa de ser lida.
4. Clique em **Salvar pastas**. O catálogo varre as pastas e mostra os itens.

O painel classifica cada arquivo assim, nesta ordem:

1. Uma pasta com `SKILL.md` é uma skill.
2. Um arquivo que começa com `rule-`, `persona-`, `template-` ou `prompt-` é desse tipo.
3. Um arquivo dentro de uma pasta chamada `rules`, `personas`, `templates` ou `prompts` é desse tipo.
4. Um `.md` com frontmatter é um prompt; sem frontmatter, é uma nota.

Arquivos `README.md`, `CHANGELOG.md`, `LICENSE.md`, `AGENTS.md` e `CLAUDE.md` são ignorados, e a busca desce até 4 níveis em cada pasta.

## Passo a passo: ativar um item num agente

1. Escolha a aba do tipo, por exemplo **Rules**.
2. Ache o item pela busca, por exemplo digitando `clean-code`.
3. Na coluna do agente, clique em **ausente**. O estado vira **ativo** e uma mensagem confirma.
4. Para desativar, clique em **ativo**.

O que a ativação faz no disco:

- Uma **skill** vira um link na pasta de skills do agente, por exemplo `~/.claude/skills/<nome>`. O link aponta para o arquivo original: editar a skill na sua pasta já vale para o agente.
- Os outros tipos entram num bloco marcado do arquivo de instruções do agente (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md` ou `~/.config/opencode/AGENTS.md`). O painel só mexe dentro desse bloco.

> **Dica:** notas não se ativam em agentes; elas ficam no catálogo só para consulta.

### Ativar vários itens de uma vez

1. Na **Lista**, marque a caixa de cada item, ou a caixa do cabeçalho para marcar todos os visíveis.
2. Na barra que aparece embaixo, escolha o agente.
3. Confira a prévia do que vai acontecer: os links de skill e quantas referências entram no arquivo de instruções.
4. Clique em **Ativar N no** e o nome do agente. Itens já ativos ou gerenciados fora são pulados.

### Ver, acompanhar e revisar um item

1. Clique no item para abrir os detalhes.
2. Na aba **Conteúdo**, leia o arquivo. **Copiar conteúdo** copia o texto.
3. Na aba **Acompanhamento**, marque o status (**ideia**, **em andamento**, **finalizado** ou **precisa melhoria**) e escreva notas. As notas são salvas sozinhas enquanto você digita.
4. Na aba **Revisão com IA**, clique em **Pedir revisão**. A IA lê o item (e as suas notas) e aponta pontos fortes, o que melhorar e o próximo passo. Use **Copiar revisão** para guardar o texto e **Revisar de novo** para outra rodada.
5. No rodapé, **Abrir no editor** abre o arquivo no seu editor, e **Copiar prompt** copia uma frase pedindo ao agente que leia o arquivo e o aplique.

### Criar um item novo

1. Clique em **Novo item**.
2. Escolha a **Pasta** e o **Tipo**.
3. Em **Nome**, use letras minúsculas, números e hífen, sem acento, por exemplo `revisar-pr`. Embaixo aparece o nome do arquivo que será criado, como `rule-revisar-pr.md` ou `revisar-pr/SKILL.md`.
4. Em **Descrição**, diga quando o agente deve usar o item. É o que o agente lê para decidir se o item se aplica.
5. Clique em **Criar e abrir**. O arquivo é criado e abre no editor.

### Instalar uma skill do skills.sh

O skills.sh é um catálogo público de skills mantido pela Vercel.

1. Na aba **Skills**, clique em **Buscar no skills.sh**.
2. Digite pelo menos 2 letras ou clique numa sugestão, como `react` ou `kubernetes`. Termos em inglês costumam trazer mais resultados.
3. Em **Instalar para:**, marque os agentes que vão receber a skill.
4. Antes de instalar, use **repositório** para revisar o código da skill: o conteúdo é de terceiros e vira instrução para o agente.
5. Clique em **Instalar**. A confirmação mostra o comando exato que vai rodar na máquina. Confirme em **Instalar**.
6. Acompanhe a saída da instalação. No fim, clique em **Voltar à busca**.

> **Dica:** com um agente só, a skill vai direto para a pasta dele. Com vários, ela fica em `~/.agents/skills` e ganha um link em cada um; nesse caso, clique em **Adicionar ~/.agents/skills às pastas** para ela aparecer no catálogo.

## Bom saber

- O painel nunca altera o que não criou. Um link ou pasta com o mesmo nome feito por outra ferramenta aparece como **gerenciado fora** e bloqueia a ativação.
- Na primeira vez que o painel escreve num arquivo de instruções, ele guarda uma cópia do original ao lado, com o final `.workstuff.bak`.
- Se o arquivo de instruções do agente ainda não existe, ele é criado na primeira ativação.
- Status e notas ficam guardados no painel, nunca no arquivo do item.
- A revisão com IA só lê: não altera nenhum arquivo. Ela usa o provedor e o modelo de [Configurações](/configuracoes).
- Instalar do skills.sh precisa de internet e do `npx` (que vem com o Node.js).
- A aba e a vista escolhidas ficam no endereço da página: recarregar ou compartilhar o link volta para o mesmo lugar.

## Problemas comuns

- **A pasta aparece com "pasta sumiu".** A pasta foi movida ou apagada. Mova de volta ou tire do catálogo em **Gerenciar pastas**.
- **O item aparece como "gerenciado fora".** Passe o mouse para ver o motivo, por exemplo uma pasta real com o mesmo nome em `~/.claude/skills`. Remova ou renomeie esse item fora do painel se quiser que o catálogo assuma.
- **Um arquivo novo não aparece.** Clique em **Atualizar**. Confira também se o nome ou a pasta seguem as regras de classificação acima.
- **"item não encontrado".** A pasta mudou desde a última leitura. Clique em **Atualizar**.
- **O botão Novo item está desativado.** Nenhuma pasta do catálogo existe. Cadastre uma em **Gerenciar pastas**.
