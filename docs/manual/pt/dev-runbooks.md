# Runbooks de dev

Reúne receitas prontas para tarefas do dia a dia de quem programa (limpar branches, desfazer um commit, reiniciar containers, limpar caches) e deixa você rodar cada comando da receita com um clique, vendo o resultado na própria tela.

## Quando usar

- Você quer apagar as branches locais que já foram incorporadas, mas não lembra os comandos do Git na ordem certa.
- Um container não sobe e você quer seguir um roteiro de investigação sem pular etapa.
- Você precisa desfazer um commit ou recuperar um trabalho perdido e prefere ver cada comando antes de rodar.
- O seu time escreveu os próprios procedimentos em arquivos Markdown e você quer executá-los pelo painel.

## Antes de começar

- Tenha na máquina a ferramenta que o runbook usa (Git, Docker, npm, Maven...). A tela [Máquina](/maquina) mostra o que está faltando.
- Saiba em qual pasta está o projeto em que você vai trabalhar, por exemplo `~/workspace/pedidos-api`.

## Conhecendo a tela

Um **runbook** é uma receita escrita em um arquivo de texto (no formato Markdown, o mesmo dos arquivos `README.md`): explica o problema e lista os comandos que resolvem, na ordem. Veja também [Conceitos e termos](/documentacao/conceitos).

A tela tem duas partes:

- **À esquerda, a lista de runbooks**, agrupada por assunto: **Fábrica de Software** (com a etiqueta **esteira**), **Git & Branches**, **Containers & Docker**, **Ambiente Local** e **Outros Procedimentos**. No topo aparece **Runbooks do projeto** (os que vêm com o painel) ou o caminho da pasta que você escolheu, e o botão **Trocar**.
- **À direita, o runbook aberto**, com dois cartões:
  - **Parâmetros da execução**: os campos que os comandos precisam, como `projeto` (a pasta onde os comandos rodam), `branch` ou `branch_base`. O campo `projeto` sempre aparece.
  - **O texto do runbook**, com cada comando numa linha própria, pronta para rodar.

Cada linha de comando mostra uma etiqueta que diz o que ela faz com a sua máquina:

| Etiqueta | O que significa | Botão |
|---|---|---|
| **leitura** | Só consulta, não muda nada (por exemplo, `git status`). | **Rodar**, que executa na hora. |
| **escrita** | Muda algo: apaga uma branch, reinicia um container, instala pacotes. | **Executar**, que pede confirmação antes. |
| **bloqueado** | O comando não pode rodar ainda. O motivo aparece logo abaixo. | Nenhum. |

Toda linha também tem o ícone de copiar, para levar o comando ao seu terminal.

## Passo a passo: rodar um runbook

1. Na lista da esquerda, clique no runbook. Exemplo: **Limpeza de branches locais já incorporadas**, em **Git & Branches**.
2. Leia o texto do início: ele diz quando usar e quais parâmetros preencher.
3. Em **Parâmetros da execução**, preencha `projeto`. Você pode digitar o caminho ou clicar no ícone de pasta ao lado do campo para escolher a pasta no computador.
4. Preencha os outros parâmetros que o runbook pedir, por exemplo `branch_base` com `main`. Os comandos da tela se atualizam com os valores que você digitou.
5. Nas linhas marcadas **leitura**, clique em **Rodar**. A saída do comando aparece logo abaixo da linha, como apareceria no terminal.
6. Nas linhas marcadas **escrita**, clique em **Executar**. Uma janela mostra o comando exato e o **Diretório de trabalho** (a pasta onde ele vai rodar). Confira e clique em **Executar** para confirmar, ou feche a janela para desistir.
7. Siga as linhas na ordem do texto. Leia as observações entre elas: muitas dizem o que conferir antes de passar ao próximo comando.

> **Dica:** o resultado de cada linha fica na tela enquanto o runbook estiver aberto. Assim você compara a saída de um passo com a do anterior.

### Usar uma pasta com os seus próprios runbooks

1. Clique em **Trocar**, no topo da lista.
2. Na janela **Pasta dos runbooks de dev**, digite o caminho da pasta (por exemplo, `~/meus-runbooks`) ou clique em **Escolher…** para selecioná-la no computador.
3. Clique em **Usar pasta**. A lista passa a mostrar os arquivos `.md` dessa pasta e das subpastas.
4. Para voltar aos runbooks que vêm com o painel, clique em **Trocar** e depois em **Voltar para runbooks do projeto**.

### Escrever um runbook

1. Crie um arquivo `.md`. A primeira linha que começa com `# ` vira o título na lista. Sem ela, o nome do arquivo é usado.
2. Escreva a explicação em texto normal.
3. Coloque os comandos dentro de um bloco de código marcado como `bash` (ou `sh`, `shell`, `console`). Cada linha do bloco vira uma linha executável na tela. Linhas que começam com `#` são tratadas como comentário e ignoradas, e um `$ ` no começo da linha é removido.
4. Para um valor que muda a cada uso, escreva `{{nome}}`, por exemplo `git branch -d {{branch}}`. O campo `nome` aparece em **Parâmetros da execução**.
5. Use subpastas para agrupar: o nome da primeira subpasta vira o grupo na lista.

## Bom saber

- Só rodam comandos destas ferramentas de desenvolvimento: `git`, `docker`, `docker-compose`, `npm`, `pnpm`, `yarn`, `cargo`, `mvn`, `gradle`, `go` e `make`. Qualquer outro comando aparece como **bloqueado**.
- Cada linha é um único comando. Recursos do terminal que juntam ou redirecionam comandos (`;`, `&&`, `|`, `>`, `$(...)`) deixam a linha **bloqueada**.
- Os valores dos parâmetros usados dentro dos comandos aceitam só letras, números e `. _ - / @ : =`. Isso impede que um valor digitado vire outro comando.
- Na dúvida, o painel trata o comando como **escrita** e pede confirmação. No Git, só rodam direto as consultas conhecidas, como `status`, `log`, `diff` e `branch` sem opção de apagar ou renomear.
- Comandos do Git têm até 1 minuto para terminar; os demais (build, testes, instalação) têm até 10 minutos.
- Toda execução, de leitura ou de escrita, fica registrada no arquivo `~/.workstuff/dev-runbook-audit.log`, com data, comando, pasta e se deu certo. Cada linha leva a impressão digital da anterior: se alguém apagar ou editar uma linha, o item **Trilhas de auditoria** da tela [Máquina](/maquina) avisa.
- A lista lê até três níveis de subpastas e ignora pastas ocultas, `node_modules` e arquivos com mais de 512 KB.

## Problemas comuns

- **A linha aparece como bloqueado com "preencha a variável".** Falta preencher um parâmetro em **Parâmetros da execução**. Assim que você digita, a linha é liberada.
- **"informe a pasta do projeto (parâmetro projeto) antes de executar este passo".** O comando precisa rodar dentro de um repositório. Preencha `projeto` com uma pasta que existe. Só comandos `docker` que não são `docker compose` rodam sem ela.
- **"valor inválido para ...".** O valor tem um caractere não aceito, como espaço ou acento. Use só letras, números e `. _ - / @ : =`.
- **"passo não encontrado; o arquivo pode ter mudado, recarregue".** O arquivo do runbook foi editado enquanto estava aberto. Recarregue a página.
- **"pasta não encontrada".** O caminho digitado em **Trocar** não existe nesta máquina. Confira o caminho ou use **Escolher…**.
- **O botão de escolher pasta não abre nada (Linux).** Falta um seletor de pastas no sistema. A tela [Máquina](/maquina) mostra o item **Seletor de pasta** e como instalar. Enquanto isso, digite o caminho.
