# Repositórios

Liga o painel ao GitLab ou ao GitHub da sua empresa para você navegar pelos grupos e projetos e baixar (clonar) um projeto ou um grupo inteiro de uma vez, com as pastas organizadas do mesmo jeito que no servidor.

## Quando usar

- Você chegou no time e precisa baixar os 30 projetos do grupo `minha-empresa/area` sem clonar um por um.
- Você quer achar um projeto pelo nome e ver se ele já está no seu computador.
- Você quer abrir no editor um projeto que já clonou, sem procurar a pasta.
- Você vai usar a tela [Pipelines](/pipelines), que depende de uma conexão criada aqui.
- Você quer saber em quais projetos uma variável, uma propriedade ou um comando aparece, por exemplo `DB_URL` ou `jboss-cli`.

## Antes de começar

Alguns termos usados nesta página:

- **Repositório** (ou projeto): a pasta de código guardada no GitLab ou no GitHub, com todo o histórico de mudanças.
- **Clonar**: baixar uma cópia do repositório para o seu computador, usando o programa `git`.
- **Grupo** e **subgrupo**: no GitLab, pastas que reúnem projetos, uma dentro da outra (`minha-empresa/area/produto`). No GitHub, o equivalente é a **organização** ou o seu usuário.
- **Token**: uma senha especial, criada por você no GitLab ou no GitHub, que dá ao painel permissão só para ler os seus grupos e projetos. Você pode apagá-lo lá quando quiser.
- **Workspace**: a pasta do seu computador onde os clones ficam, por exemplo `~/workspace`.

Mais termos em [Conceitos e termos](/documentacao/conceitos).

O que precisa estar pronto:

- O `git` instalado. Se faltar, a tela mostra isso, e a tela [Máquina](/maquina) mostra o que está instalado na máquina.
- Um token, se os projetos forem privados (o caso comum numa empresa). Veja como criar em **Criar o token**, mais abaixo.
- Para clonar por SSH, a sua chave SSH cadastrada no GitLab ou no GitHub. SSH é um jeito de o `git` se identificar com uma chave guardada no seu computador, em vez de senha.

## Conhecendo a tela

Sem nenhuma conexão, a tela mostra o cartão **Nenhuma conexão com GitLab ou GitHub**, com o que falta (git, token no ambiente, conexão) e o botão **Conectar GitLab ou GitHub**.

Com uma conexão salva, a tela tem:

| Parte | O que mostra |
|---|---|
| **Conexões** | Uma etiqueta por conexão, com o nome, o provedor (GitLab ou GitHub), o protocolo (SSH ou HTTPS) e o token (só os 4 últimos caracteres, ou **sem token**). Ao lado, os ícones de editar e remover. Clique numa conexão para navegar nela. |
| **Nova conexão** | Botão no topo para criar outra conexão. |
| **Caminho** | Onde você está dentro do grupo, a partir do grupo base (ícone de casa). Clique num trecho para voltar até ele. |
| **Filtrar subgrupos e projetos…** | Mostra só o que tem o texto digitado no nome, no caminho ou na descrição. |
| **Incluir arquivados** | Mostra os projetos arquivados (desativados no servidor) e os inclui no clone de subgrupo. |
| **destino:** | A pasta do seu computador onde o grupo atual vai parar. |
| **Lista** | Primeiro os subgrupos, depois os projetos. Cada linha mostra, depois da seta, a pasta de destino. |
| **Aba Meu Workspace** | Varre os repositórios git clonados no seu workspace local e mostra branch, arquivos modificados, stashes, commits à frente/atrás da origem, branches já mergeadas e peso de artefatos (`target/`, `node_modules/`, `dist/`, `build/`), com botões de 1 clique para **Editor**, **Revisar** (em [Revisão antes do MR](/revisao)), **Fetch**, poda de branches mergeadas e limpeza de artefatos. Mergeada quer dizer que os commits já estão na branch principal do remoto (`origin/HEAD`, ou `main`/`master`); a limpeza só apaga pasta que o git ignora e que não tem arquivo versionado. |
| **Aba Buscar nos clones** | Procura um texto em todos os clones do workspace de uma vez e mostra, por projeto, cada arquivo e linha onde ele aparece. Respeita o `.gitignore` de cada projeto, então `target/` e `node_modules/` ficam de fora. |

As marcas de cada projeto:

| Marca | Significado |
|---|---|
| **clonado** | Já existe um repositório git na pasta de destino. |
| **não clonado** | A pasta ainda não existe no seu workspace. |
| **pasta ocupada** | A pasta existe, tem arquivos e não é repositório git. O clone pula este projeto para não estragar nada. |
| **arquivado** | O projeto foi arquivado no servidor. |
| **atividade** | Há quanto tempo o projeto teve a última mudança. |

## Passo a passo: conectar o GitLab ou o GitHub

A conexão é criada num assistente de seis passos. O botão **Próximo** só libera quando o passo atual está preenchido, e **Voltar** retorna sem perder nada.

1. Clique em **Conectar GitLab ou GitHub** (ou em **Nova conexão**, se já tiver uma).
2. **Provedor**: escolha **GitLab** ou **GitHub**. Em **Endereço**, deixe `https://gitlab.com` ou `https://github.com`, ou troque pelo endereço da empresa, como `https://gitlab.suaempresa.com.br`. O endereço precisa começar com `https://`.
3. **Token**: escolha de onde vem o token.

   | Opção | Quando usar |
   |---|---|
   | **Usar GITLAB_TOKEN do ambiente** (ou **GITHUB_TOKEN**) | O token já está numa variável de ambiente do computador quando o painel é iniciado. Só fica disponível se o painel encontrar a variável. |
   | **Usar o login do gh** | Só no GitHub: você já entrou com o programa `gh` (`gh auth login`). |
   | **Colar um token** | Você cola o token no campo **Token**. É o caminho mais simples. |
   | **Sem token** | Só projetos públicos aparecem. |

4. Clique em **Testar conexão**. A tela confere o endereço e o token sem salvar nada e responde, por exemplo, "Conectado como maria: 4 grupo(s) e 0 projeto(s) visíveis na raiz". Se der erro, a mensagem diz o motivo.
5. **Protocolo**: escolha como o `git` vai baixar o código.
   - **SSH (recomendado)**: usa a sua chave em `~/.ssh`. Depois, `git pull` e `git push` funcionam sem pedir nada. Clique em **Testar SSH** para ver se a chave é aceita.
   - **HTTPS**: clona com o token, sem chave. O token não fica gravado no repositório, então para `pull` e `push` depois você vai precisar das suas próprias credenciais do `git`.
6. **Grupo base**: informe o grupo a partir do qual a navegação começa, como `minha-empresa/area`. Você pode colar a URL inteira do grupo, e o endereço do site é tirado sozinho. No GitHub, o campo se chama **Organização ou usuário**. Veja abaixo como o grupo base define as pastas.
7. **Workspace**: em **Pasta do workspace**, escreva o caminho (começando com `/` ou `~`) ou clique em **Selecionar pasta**. A pasta é criada se não existir.
8. **Revisar**: confira o resumo, dê um **Nome da conexão** (opcional) e clique em **Salvar conexão**.

### Como o grupo base vira pastas

O grupo base é a parte do caminho que **não** vira pasta. Tudo abaixo dele é recriado no workspace com a mesma hierarquia.

Exemplo: com o grupo base `minha-empresa/area` e o workspace `~/workspace`, o projeto `minha-empresa/area/produto/backend/api` vai para `~/workspace/produto/backend/api`.

No GitHub, se a base for a organização `minha-org`, o repositório `minha-org/meu-repo` vai para `~/workspace/meu-repo`. Deixe a base vazia para manter a organização como pasta.

### Criar o token

No GitLab:

1. Entre no GitLab e abra a página de tokens de acesso pessoal do seu perfil. No gitlab.com, o link aparece no próprio passo **Token** do assistente, ao escolher **Colar um token**.
2. Crie um token com os escopos (permissões) `read_api` e `read_repository`.
3. Copie o token, que começa com `glpat-`, e cole no campo **Token**.

No GitHub:

1. Abra `github.com/settings/tokens` (o link também aparece no assistente).
2. Crie um token com os escopos `repo` e `read:org`.
3. Copie o token, que começa com `ghp_` ou `github_pat_`, e cole no campo **Token**.

> **Dica:** dê ao token só esses escopos de leitura. Assim, mesmo que ele vaze, ninguém consegue alterar nada com ele.

## Passo a passo: navegar e clonar um projeto

1. Clique na conexão. A lista abre no grupo base.
2. Clique num subgrupo (ou no botão **Abrir** dele) para entrar. Use o caminho no topo para voltar.
3. Se não achar o projeto, digite parte do nome em **Filtrar subgrupos e projetos…**.
4. Na linha do projeto, confira a pasta de destino depois da seta.
5. Clique em **Clonar**. Um painel de progresso aparece no fim da lista.
6. Quando terminar, a marca muda para **clonado** e o botão vira **Abrir no editor**.

### Clonar um subgrupo inteiro

1. Na linha do subgrupo, clique em **Clonar subgrupo**. Ou, já dentro dele, clique em **Clonar este subgrupo** no topo.
2. Leia a confirmação: ela diz para qual pasta tudo vai e lembra que os projetos já clonados são pulados.
3. Se quiser os projetos arquivados também, ligue **Incluir arquivados** antes de clicar.
4. Clique em **Clonar**. O painel de progresso mostra quantos já foram ("12 de 30") e conta cada resultado: **clonado**, **já existia**, **pulado** e **falhou**. Passe o mouse num resultado para ver o detalhe.
5. Para interromper, clique em **Parar**. O que já estava sendo baixado termina, e clones pela metade são apagados.

> **Dica:** só um clone roda por vez na tela. Espere o atual terminar (ou pare ele) antes de começar outro.

### Abrir um projeto clonado

1. Na linha de um projeto **clonado**, clique em **Abrir no editor**.
2. A pasta abre no VS Code (o comando `code`). Se ele não estiver instalado, a pasta abre no programa padrão do sistema para pastas.

### Procurar um texto em todos os projetos

1. Abra a aba **Buscar nos clones**.
2. Digite o texto, por exemplo `DB_URL`. Se quiser restringir, escreva em **Arquivos** um ou mais padrões separados por espaço ou vírgula, como `*.yml` ou `src/`.
3. Marque **diferenciar maiúsculas** ou **expressão regular** se precisar.
4. Clique em **Procurar**. O resultado vem por projeto, do que tem mais ocorrências para o que tem menos, com cada arquivo e o número da linha.
5. Clique no nome de um projeto para abrir ou fechar a lista dele, e em **Abrir no editor** para abrir a pasta.

> **Dica:** o endereço da tela guarda a busca. Copie o link para repetir a mesma busca depois ou mandar para um colega.

### Editar ou remover uma conexão

1. Clique no ícone de lápis da conexão para refazer o assistente com os dados atuais. Se o token foi colado, marque **Manter o token atual** para não precisar colar de novo.
2. Clique no ícone de lixeira para remover a conexão e confirme em **Remover**. Sai a conexão e o token colado, se houver. Os clones no disco não são tocados.

## Bom saber

- Clonar nunca sobrescreve nada: o que já está clonado é pulado, e pastas com arquivos não são tocadas.
- O token colado fica só neste computador, num arquivo que só o seu usuário consegue ler (permissão 600). Ele nunca vai para o navegador nem aparece inteiro na tela.
- Com HTTPS, o token é usado só durante o clone e não fica gravado no repositório.
- Num subgrupo, até 3 projetos são clonados ao mesmo tempo, para não saturar o disco e a rede.
- Só dá para clonar o que está dentro do grupo base, porque é dele que sai a pasta de destino.
- A busca nos clones procura nos arquivos versionados e nos arquivos novos ainda sem commit, pula arquivo binário e mostra no máximo 200 linhas por projeto. Quando passa disso, o projeto ganha a marca **cortado**: restrinja o texto ou os arquivos.
- Estas conexões também servem à tela [Pipelines](/pipelines). Ao exportar o seu [Perfil de equipe](/perfil), as conexões vão sem o token.

## Problemas comuns

- **O botão Próximo não libera.** Falta algo no passo: o endereço precisa começar com `https://`, o token precisa estar colado (na opção **Colar um token**) e a pasta do workspace precisa começar com `/` ou `~`.
- **A opção de variável de ambiente ou do gh está apagada.** O painel não achou a variável `GITLAB_TOKEN`/`GITHUB_TOKEN`, ou o `gh` não está logado. Escolha **Colar um token**, ou defina a variável e reinicie o painel.
- **"nenhum token encontrado nessa origem".** A origem escolhida não entregou token. Confira a variável ou o login do `gh`, ou cole o token.
- **"Grupo vazio" ou poucos projetos aparecem.** O token não enxerga esses projetos. Confira se ele tem os escopos certos e se o seu usuário tem acesso ao grupo.
- **"a chave SSH não foi aceita".** Cadastre a sua chave pública no GitLab ou no GitHub e use **Testar SSH**, ou edite a conexão e troque para HTTPS.
- **"o token não tem permissão de leitura de repositório".** No HTTPS, o token precisa de `read_repository` (GitLab) ou `repo` (GitHub). Crie outro token com esse escopo.
- **O projeto aparece como pasta ocupada e o Clonar fica apagado.** Já existe uma pasta com arquivos no destino que não é repositório git. Mova ou renomeie essa pasta e clique em **Atualizar**.
- **Algum projeto não aparece.** Ele pode estar arquivado: ligue **Incluir arquivados**.
