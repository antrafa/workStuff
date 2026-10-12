# Vulnerabilidades

Mostra as falhas de segurança conhecidas e as versões desatualizadas nas bibliotecas que um projeto usa, lendo o `package.json` e o `pom.xml` e consultando a base pública OSV.

## Quando usar

- Antes de uma entrega, para saber se alguma biblioteca do projeto tem falha de segurança conhecida.
- Um alerta de segurança citou um CVE e você quer saber se o seu projeto é afetado.
- Você quer saber quais bibliotecas estão muito atrás da versão mais recente antes de planejar uma atualização.

Alguns termos desta página:

- **Dependência** é uma biblioteca de terceiros que o projeto usa, declarada no `package.json` (projetos Node) ou no `pom.xml` (projetos Java com Maven).
- **Lockfile** é o arquivo que fixa a versão exata instalada de cada dependência. Em projetos Node, é o `package-lock.json`.
- **OSV** é uma base pública e gratuita de falhas de segurança conhecidas ([osv.dev](https://osv.dev)).
- **CVE** é o código de identificação público de uma falha, como `CVE-2024-12345`.
- **Versão major** é o primeiro número da versão: de `4.2.1` para `5.0.0` mudou a major, o que costuma trazer mudanças incompatíveis.
- **Dependência transitiva** é a biblioteca que entra no projeto porque outra biblioteca precisa dela, sem você ter declarado.

Veja também [Conceitos e termos](/documentacao/conceitos).

## Antes de começar

- O projeto precisa estar numa pasta da sua máquina, com `package.json` ou `pom.xml` até 4 níveis abaixo dela.
- A máquina precisa de acesso à internet, para consultar a OSV, o registry do npm e o Maven Central.
- Opcional: com o programa `trivy` instalado, a tela ganha uma varredura completa. A tela [Máquina](/maquina) mostra como instalar; veja [Máquina](/documentacao/maquina).

## Conhecendo a tela

- **Campo do caminho**: a pasta do projeto, por exemplo `~/workspace/loja-web`. O botão **Escolher** abre o seletor de pastas do sistema e já começa a verificação.
- **Recentes**: botões com os últimos projetos verificados (até 8). O número em vermelho ao lado do nome soma as falhas críticas e altas.
- **Resumo**: um quadro por gravidade (crítica, alta, média e baixa) com a quantidade de falhas conhecidas, e um quadro **Desatualizadas** com quantas dependências estão uma ou mais versões major atrás.
- **Tabela de dependências**: uma linha por dependência, com a versão usada, a última publicada e as falhas. Dependências só de desenvolvimento ou de teste levam a etiqueta **dev** ou **test**.
- **Varredura completa (trivy)**: aparece quando o trivy está instalado; senão, aparece um aviso explicando o que ele acrescenta.

Os filtros da tabela:

| Filtro | O que mostra |
|---|---|
| **Com falhas** | Só as dependências com alguma falha conhecida. É o filtro inicial quando há falhas. |
| **Desatualizadas** | As que estão uma ou mais versões major atrás da última publicada. |
| **Todas** | Todas as dependências encontradas. |

Ao lado dos filtros, o campo **Filtrar por nome** procura uma dependência pelo nome.

## Passo a passo: verificar um projeto

1. Digite o caminho da pasta do projeto e clique em **Verificar**, ou clique em **Escolher** e selecione a pasta.
2. Espere a consulta. Projetos grandes fazem centenas de consultas e podem levar alguns segundos.
3. Olhe o resumo no topo: os quadros **crítica** e **alta** em vermelho pedem atenção primeiro.
4. Na tabela, as dependências aparecem da falha mais grave para a menos grave. Clique numa linha com falha para abrir os detalhes.
5. Em cada falha você vê a gravidade, o resumo, o identificador (com o CVE, quando houver) e a versão que corrige, em "corrigido em". O ícone de link abre a falha no site da OSV.
6. Atualize a dependência no projeto para a versão que corrige e clique em **Verificar de novo** para conferir.

### Reabrir um projeto já verificado

1. Em **Recentes**, clique no nome do projeto.
2. A tela mostra o resultado salvo da última verificação, sem consultar a internet de novo. Para atualizar, clique em **Verificar de novo**.

### Fazer a varredura completa com o trivy

1. Verifique um projeto primeiro.
2. Em **Varredura completa (trivy)**, clique em **Varrer o projeto inteiro**. O trivy lê também as dependências transitivas.
3. Para examinar uma imagem de container, digite o nome dela no campo (por exemplo, `nginx:1.27`) e clique em **Varrer imagem**.
4. O resultado vem numa tabela com gravidade, pacote, versão **Instalada**, versão em que foi **Corrigida em** e a falha.

> **Dica:** a primeira execução do trivy baixa a base de falhas dele e pode levar alguns minutos.

## Bom saber

- A tela só lê os arquivos. Nada é instalado, atualizado ou executado no projeto.
- Pastas como `node_modules`, `target`, `dist` e `build` são ignoradas na busca pelos arquivos.
- No Node, a versão exata vem do `package-lock.json`. Sem lockfile, só dá para consultar quando o `package.json` declara uma versão única (como `^1.2.3`); um intervalo como `>=1` fica como **não consultada**.
- No Maven, versões herdadas do parent ou de um BOM também ficam como **não consultada**. A varredura do trivy resolve as versões reais.
- Dependências apontando para pasta local, git ou URL não estão num registry público e não são consultadas.
- Um traço na coluna **Última** quer dizer que a biblioteca não está no registry público (é privada) ou que ele não respondeu.
- O painel guarda a última verificação de até 30 projetos.

## Problemas comuns

- **"nenhum package.json ou pom.xml encontrado até 4 níveis abaixo dessa pasta".** Confira se escolheu a pasta certa; aponte para a raiz do projeto ou para uma pasta mais próxima dos arquivos.
- **Aviso de dependências sem versão exata.** Gere o lockfile no projeto (`npm install`) ou use a varredura do trivy para ver as versões reais.
- **"use o caminho absoluto da pasta".** Digite o caminho completo, começando com `/` ou `~`.
- **A varredura do trivy demora muito.** Na primeira vez ele baixa a base de falhas. Espere terminar; as próximas são mais rápidas.
