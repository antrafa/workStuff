# Perfil de equipe

Leva a sua configuração do painel para outra pessoa ou outro computador em um único arquivo: as verificações da tela Máquina, as conexões de repositório e o que está ativo no Catálogo. Quem chega no time importa o arquivo e já trabalha com a mesma configuração.

## Quando usar

- Uma pessoa nova entrou no time e você quer que o painel dela confira as mesmas versões, repositórios privados e endereços internos que o seu.
- Você trocou de computador e quer trazer a configuração do antigo.
- O time combinou uma configuração padrão e quer distribuí-la a todos.

## Conhecendo a tela

A tela tem dois cartões e, depois de escolher um arquivo, um terceiro:

- **Exportar**: gera o arquivo com a sua configuração, pelo botão **Baixar perfil**.
- **Importar**: lê um arquivo recebido, pelo botão **Escolher arquivo**.
- **O que muda com** `<nome do arquivo>`: aparece depois que você escolhe o arquivo. Mostra, parte por parte, o que vai mudar no seu painel, antes de aplicar qualquer coisa.

O arquivo do perfil é um JSON (um arquivo de texto com dados organizados, que o painel sabe ler) e leva três partes:

| Parte | O que leva | O que acontece ao importar |
|---|---|---|
| **Verificações do Máquina** | Repositórios Maven, escopos npm, endereços de rede e versões de Java, Maven e Node cadastrados na tela [Máquina](/maquina). | **Substitui** as listas que forem diferentes das suas. A tela diz quais. |
| **Conexões de repositório** | As conexões com GitLab ou GitHub da tela [Repositórios](/repositorios), sem token. | **Adiciona** as que você ainda não tem. |
| **Pastas do Catálogo** | As pastas de onde a tela [Catálogo](/catalogo) lê skills, prompts e regras. | **Adiciona** as que existem no seu computador. |

O arquivo também lista os itens que estavam ativos no Catálogo de quem exportou. Esses não são aplicados: a tela só mostra quais são, para você ativar à mão.

## Passo a passo: compartilhar a sua configuração

1. Abra a tela **Perfil de equipe**.
2. No cartão **Exportar**, clique em **Baixar perfil**. O navegador salva um arquivo chamado, por exemplo, `workstuff-perfil-2026-10-12.json`.
3. Envie esse arquivo para a pessoa, por e-mail ou pelo chat do time.

> **Dica:** antes de exportar, confira na tela [Máquina](/maquina), em **Personalizar verificações**, se o que está cadastrado é o que o time todo precisa.

### Importar um perfil recebido

1. No cartão **Importar**, clique em **Escolher arquivo** e selecione o arquivo `.json` que você recebeu.
2. Leia o cartão **O que muda com**. Cada parte mostra:
   - em **Verificações do Máquina**, as listas que serão substituídas, ou "igual ao que você já tem";
   - em **Conexões de repositório**, as conexões novas, as que **já existem** e as **ignoradas** (com o motivo);
   - em **Pastas do Catálogo**, as pastas novas e as que **não existem nesta máquina**.
3. Desmarque a caixa de uma parte que você não quer aplicar. Partes sem nada novo já vêm desmarcadas e apagadas.
4. Clique em **Importar o selecionado**. A tela mostra **Perfil importado** e recalcula o que ainda mudaria.
5. Se apareceram conexões sem token, abra a tela [Repositórios](/repositorios) e configure o token (a senha de acesso ao GitLab ou GitHub) de cada uma.
6. Se apareceu a lista **Itens ativos no perfil**, abra a tela [Catálogo](/catalogo) e ative esses itens nos agentes indicados.
7. Para conferir o efeito, abra a tela [Máquina](/maquina): ela já verifica com o que veio no perfil.

## Bom saber

- Token nunca vai no arquivo. Uma conexão cujo token foi digitado no painel sai como "sem token". Uma conexão que pega o token de uma variável de ambiente ou do login do `gh` (a ferramenta de linha de comando do GitHub) continua apontando para a mesma origem.
- A pasta de trabalho das conexões sai com `~` no lugar da sua pasta pessoal, para valer no computador de outra pessoa.
- O arquivo importado passa pelas mesmas validações das telas, como se você tivesse digitado cada valor. Um valor estranho é recusado.
- Importar de novo o mesmo arquivo não duplica conexões nem pastas. Uma conexão conta como a mesma quando tem o mesmo provedor, endereço e grupo base.
- Nada é instalado nem ativado sozinho. Depois de importar, a tela Máquina só mostra o que falta; quem instala é você.
- O painel lê no máximo 50 conexões e 50 pastas de um arquivo.

## Problemas comuns

- **"o arquivo não é um JSON válido".** O arquivo foi alterado ou cortado no caminho. Peça para a pessoa exportar de novo.
- **"arquivo não é um perfil do workStuff (ou é de uma versão que este painel não conhece)".** O arquivo não foi gerado pelo botão **Baixar perfil**, ou veio de uma versão diferente do painel. Peça um novo arquivo exportado pela tela.
- **Uma pasta aparece em "não existem nesta máquina (clone antes)".** A pasta do Catálogo da outra pessoa ainda não existe no seu computador. Clone o repositório para o mesmo caminho e escolha o arquivo de novo.
- **Uma conexão aparece como "ignorada".** O valor dela não passou na validação, por exemplo um endereço com `http://` em vez de `https://`. O motivo aparece ao lado. Crie a conexão à mão na tela [Repositórios](/repositorios).
- **O botão mostra "Nada a importar".** Tudo o que o arquivo traz já está igual no seu painel.
