# Playbooks

Roda procedimentos de engenharia guiados pela IA, passo a passo: você preenche os dados do seu caso, e cada passo do roteiro vira um pedido que a IA responde na hora, com a resposta aparecendo enquanto é escrita.

## Quando usar

- Você precisa escrever um ADR e quer um roteiro que conduza contexto, alternativas e decisão.
- Você quer fazer a triagem de um erro ou um post-mortem de incidente seguindo sempre as mesmas etapas.
- Você quer revisar código, planejar uma refatoração, gerar testes ou modelar ameaças com um procedimento pronto.
- Você tem um procedimento próprio que repete com frequência e quer transformá-lo em roteiro.

Alguns termos desta página:

- **Playbook** é um arquivo Markdown (`.md`) com um procedimento. Os blocos de pedido dentro dele viram os passos que a IA executa.
- **Prompt** é o texto do pedido enviado à IA em cada passo.
- **Variável** é um espaço no prompt, escrito como `{{projeto}}`, que você preenche antes de rodar.
- **ADR** (registro de decisão de arquitetura) é um documento curto que registra uma decisão técnica, o motivo e o que se perde com ela.

Veja também [Conceitos e termos](/documentacao/conceitos).

## Antes de começar

- Um provedor de IA precisa estar configurado em [Configurações](/configuracoes). Veja [Configurações](/documentacao/configuracoes).
- O painel já traz playbooks prontos, organizados nas pastas `arquitetura`, `engenharia`, `incidentes` e `seguranca`. Você não precisa preparar nada para começar.

## Conhecendo a tela

- **Lista lateral**: os playbooks da pasta em uso, com o título e o caminho do arquivo. No topo aparece **Playbooks do projeto** (com a etiqueta **projeto**) quando são os que vêm com o painel, ou o caminho da sua pasta. O botão **Trocar** muda a pasta.
- **Linha da IA**: mostra o provedor e o modelo que vão rodar. **Alterar modelo** leva a [Configurações](/configuracoes).
- **Executar todos em sequência**: aparece quando o playbook tem mais de um passo.
- **Parâmetros da execução**: um campo para cada variável do playbook. Variáveis com nome de pasta (como `projeto`, `pasta`, `repo`) ganham um botão para escolher a pasta no computador.
- **Corpo do playbook**: o texto explicativo e, entre ele, os passos. Cada passo tem o título, o botão **Executar com IA** e **Ver prompt**, que mostra o pedido exato.

## Passo a passo: executar um playbook

1. Na lista lateral, clique no playbook, por exemplo **Documentação de Decisão de Arquitetura (ADR)**.
2. Leia o texto do playbook: ele explica o que cada parâmetro espera.
3. Em **Parâmetros da execução**, preencha todos os campos. Por exemplo, em `titulo`, escreva "Adoção de Kafka para mensageria de pedidos".
4. No primeiro passo, clique em **Executar com IA**. A resposta aparece aos poucos.
5. Quando o passo termina, ele ganha a etiqueta **concluído** e o tempo que levou. Clique em **Copiar resposta** para levar o resultado.
6. Siga para o próximo passo e clique em **Executar com IA** de novo.

> **Dica:** passos que usam `{{passo_anterior}}` recebem sozinhos a resposta do passo de cima. Rode os passos na ordem.

### Executar todos os passos de uma vez

1. Preencha os parâmetros.
2. Clique em **Executar todos em sequência**. Os passos rodam um depois do outro, e cada um recebe a resposta do anterior.

### Interromper ou repetir um passo

1. Enquanto um passo roda, clique em **Interromper**. O que já chegou fica na tela.
2. Para rodar o passo de novo, clique em **Executar de novo**. A resposta anterior é substituída.

### Usar a sua própria pasta de playbooks

1. Clique em **Trocar**, no topo da lista lateral.
2. Digite o caminho da pasta e clique em **Usar pasta**, ou clique em **Escolher…** para usar o seletor do sistema.
3. A lista passa a mostrar os `.md` dessa pasta e das subpastas (até 3 níveis).
4. Para voltar aos playbooks que vêm com o painel, clique em **Trocar** e depois em **Voltar para playbooks do projeto**.

### Escrever um playbook

1. Crie um arquivo `.md` na sua pasta. A primeira linha `# Título` vira o nome na lista.
2. Escreva o texto explicativo normalmente, em Markdown.
3. Para cada passo, abra um bloco de código com a marcação `prompt` (ou `ai`) e escreva o pedido dentro. Use `{{nome}}` para cada dado que a pessoa deve preencher.
4. Para dar título ao passo, comece o bloco com uma linha `# Título do passo`, ou escreva `ai:Título do passo` na abertura do bloco.
5. Use `{{passo_anterior}}` onde quiser a resposta do passo de cima.

Exemplo de um passo:

````markdown
```prompt
# Analisar o erro
Analise o erro abaixo no projeto {{projeto}} e liste as causas prováveis:
{{erro}}
```
````

## Bom saber

- A IA roda em modo leitura: ela pode ler arquivos, mas não altera nada.
- Se você preencher uma variável chamada `projeto`, `pasta`, `diretorio`, `repo` ou `repositorio` com uma pasta que existe, a IA trabalha dentro dessa pasta e pode ler o código dela.
- As respostas não ficam salvas: trocar de playbook ou sair da tela as descarta. Copie o que quiser guardar.
- Cada passo tem um limite de 15 minutos e é encerrado se a IA passar 3 minutos sem dar sinal.
- Arquivos maiores que 512 KB não aparecem na lista.

## Problemas comuns

- **"preencha a variável ...".** Um campo de **Parâmetros da execução** ficou vazio. Preencha e rode o passo de novo.
- **"passo não encontrado; o arquivo pode ter mudado".** O arquivo do playbook foi editado enquanto estava aberto. Clique em outro playbook e volte para recarregá-lo.
- **"pasta não encontrada".** Ao trocar a pasta, confira o caminho digitado.
- **"Nenhum .md nesta pasta".** A pasta escolhida não tem arquivos Markdown. Escolha outra pasta ou volte para os playbooks do projeto.
