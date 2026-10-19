# Máquina

Confere o que falta neste computador para você trabalhar (programas, versões, credenciais e acesso à rede) e mostra, para cada item, como resolver, com o comando certo para o seu sistema: Linux, macOS ou Windows.

## Quando usar

- Você acabou de receber o computador e quer saber o que instalar antes do primeiro dia de trabalho.
- Um build falhou com "versão do Java errada" ou "pacote não encontrado" e você quer descobrir o que está faltando.
- Uma tela do painel não funciona (por exemplo, as telas de IA não respondem) e você quer saber se falta alguma ferramenta.
- Você conectou na VPN e quer confirmar que os endereços internos do time respondem.

## Conhecendo a tela

No topo ficam quatro quadros de resumo:

| Quadro | O que mostra |
|---|---|
| **Tudo certo** | Quantos itens estão ok. |
| **Pendências** | Quantos itens faltam e impedem o trabalho. |
| **Avisos** | Quantos itens funcionam, mas com limitação. |
| **Sistema** | O sistema detectado. Os comandos sugeridos são para ele. |

Logo abaixo, uma chave escolhe o que listar: **Pendências e avisos** (o padrão) ou **Tudo**. Os itens aparecem em cartões por grupo: **Base**, **Credenciais**, **Java**, **Maven**, **Node**, **Docker**, **workStuff** (o próprio painel), **Kubernetes**, **Segurança**, **IA**, **IDEs** (os editores de código), **Sistema** e **Rede**.

Cada item tem uma etiqueta de situação:

| Etiqueta | O que significa |
|---|---|
| **ok** | Está instalado ou configurado. |
| **falta** | Impede o trabalho. Resolva primeiro. |
| **aviso** | Funciona, mas alguma coisa fica limitada. A descrição diz o quê. |

Ao lado do nome vem um detalhe (a versão encontrada, ou o motivo da pendência) e, embaixo, a correção sugerida. Ela pode aparecer de quatro jeitos:

- **Comando com o botão Executar**: o painel pode rodar a correção por você, porque ela instala só na sua pasta pessoal e não precisa de senha de administrador.
- **Comando com o aviso "rode no terminal"**: precisa de `sudo` (a senha de administrador) ou de um terminal interativo. Copie e rode você mesmo.
- **Botão Abrir página de download**: a correção é baixar um instalador no site oficial.
- **Uma instrução em texto**: algo que só você pode fazer, como "conecte-se à rede corporativa".

Todo comando e toda instrução têm o ícone de copiar ao lado.

## Passo a passo: deixar a máquina pronta

1. Abra a tela. A verificação roda sozinha e lista primeiro o que está pendente.
2. Comece pelos itens com **falta**. Leia o detalhe para entender o motivo.
3. Se o item tiver o botão **Executar**, clique nele. Uma janela mostra o comando que vai rodar. Confira e clique em **Executar** para confirmar.
4. Acompanhe a saída do comando, que aparece logo abaixo do item. Se precisar interromper, clique em **Parar**.
5. Quando a correção termina bem, o painel verifica tudo de novo sozinho e o item passa para **ok**.
6. Para os itens sem o botão, clique no ícone de copiar, cole no seu terminal e rode. Depois volte e clique em **Verificar de novo**.
7. Quando não sobrar nenhuma pendência, a tela mostra **Máquina apta: nenhuma pendência obrigatória.**

> **Dica:** alguns itens dependem de outros. Por exemplo, as versões de Java só são conferidas depois que o SDKMAN (o instalador de versões de Java e Maven) estiver instalado. Clique em **Verificar de novo** depois de cada instalação.

### Cadastrar o que é do seu time

O painel não sabe quais repositórios privados, endereços internos ou versões o seu time usa. Você informa isso uma vez:

1. Clique em **Personalizar verificações**.
2. Preencha as seções que fazem sentido para você:
   - **Repositórios Maven privados**: um **Nome** (por exemplo, `Nexus da empresa`) e o **Texto no settings.xml**, normalmente o endereço do repositório (`nexus.exemplo.com`). O painel confere se o arquivo `~/.m2/settings.xml`, onde o Maven guarda essas configurações, cita esse texto.
   - **Escopos npm privados**: o prefixo dos pacotes internos, como `@minha-empresa`. O painel confere se o arquivo `~/.npmrc` diz de onde baixar esses pacotes.
   - **Endereços que precisam responder**: VPN, proxy ou serviços internos, com nome e URL (por exemplo, `Intranet` e `https://intranet.exemplo.com`).
   - **Versões exigidas**: as versões de Java e Maven pelo identificador do SDKMAN (por exemplo, `21.0.8-zulu`), e as de Node só pelo número principal (por exemplo, `22`).
3. Use **Adicionar** para incluir uma linha e o ícone de lixeira para remover.
4. Clique em **Salvar**. A verificação roda de novo com os itens novos.

> **Dica:** os servidores Git de cada conexão da tela [Repositórios](/repositorios) já entram sozinhos no teste de rede. Você não precisa cadastrá-los aqui.

## Bom saber

- No grupo **workStuff**, **Memória da Fábrica** diz onde a Fábrica guarda as lições das tarefas: no cofre do Mentat, se ele estiver instalado, ou num arquivo local. Os dois funcionam; o Mentat só divide as lições com os seus outros agentes. **Trilhas de auditoria** confere os registros do Cluster Doctor e dos runbooks: um aviso ali quer dizer que alguém apagou ou editou uma linha depois de gravada.
- A verificação só lê. Nada é instalado sem você clicar em **Executar** e confirmar.
- O botão **Executar** existe só para o que instala na sua pasta pessoal sem senha de administrador: SDKMAN, NVM (o instalador de versões do Node), versões de Java, Maven e Node, e as dependências do próprio painel (`npm install`). No Windows, só o `npm install` roda pelo painel.
- O painel não mostra o conteúdo do `settings.xml` nem do `.npmrc`, porque esses arquivos costumam guardar senhas. Ele só confere se o texto cadastrado está lá.
- O que você cadastra em **Personalizar verificações** fica em `~/.workstuff/doctor-config.json`. Para levar isso a outra pessoa, use a tela [Perfil de equipe](/perfil).
- Sem nada cadastrado, as versões padrão são Java 17 e 21, Maven 3.9.6 e Node 20 e 22. O botão **Voltar às versões padrão** restaura esses valores.
- O painel precisa do Node 22.18 ou mais novo no terminal para funcionar. O item **Node no PATH** confere isso.
- Menos de 20 GB livres na sua pasta pessoal geram um aviso em **Espaço em disco**.
- Um endereço só é marcado como fora do ar depois de duas tentativas sem resposta.
- Para desfazer uma instalação de Java, Maven ou Node feita pelo painel, remova a versão pelo mesmo gerenciador (`sdk` ou `nvm`).

## Problemas comuns

- **Um endereço aparece com "sem resposta após 2 tentativas".** Confira se você está na VPN, se o endereço está certo e se há um proxy no caminho. Depois clique em **Verificar de novo**.
- **"chave não aceita por ..." em Rede.** A sua chave SSH (o arquivo que identifica você no servidor Git) não está cadastrada lá. Copie o conteúdo de `~/.ssh/*.pub` e cadastre nas configurações de SSH do seu perfil no GitLab ou GitHub.
- **A correção falhou.** Leia a saída embaixo do item: em geral é falta de internet ou de um programa anterior (por exemplo, `curl` ou `unzip`, do grupo **Base**). Resolva o anterior e tente de novo.
- **Docker aparece com "usuário fora do grupo docker" (Linux).** Rode no terminal o comando sugerido e saia e entre de novo na sua sessão para a mudança valer.
- **Uma versão cadastrada foi recusada ao salvar.** Java e Maven usam o identificador do SDKMAN (veja com `sdk list java`), Node só aceita o número principal, e o escopo npm precisa começar com `@`. Cada lista aceita no máximo 30 itens.
