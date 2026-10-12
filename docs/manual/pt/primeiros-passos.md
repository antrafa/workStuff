# Primeiros passos

Uma primeira sessão guiada: abrir o painel, conferir se a máquina tem o que precisa, escolher a IA, conectar o seu código e o seu cluster, e experimentar uma primeira tarefa na Fábrica de Software. Siga os passos na ordem; cada um diz como saber que deu certo.

## Abrir o painel

O workStuff são dois programas que rodam juntos no seu computador: o servidor (que conversa com as suas ferramentas) e a página web que você abre no navegador.

**Pelo atalho do aplicativo.** Se alguém já instalou o atalho no seu computador, abra o **workStuff** pelo menu de aplicativos (Linux) ou pela pasta Aplicativos (macOS). Ele sobe o painel em segundo plano e abre o navegador sozinho. Se o painel já estiver rodando, ele só abre o navegador.

**Pelo terminal.** Na pasta do workStuff:

```bash
npm install     # só na primeira vez
npm run dev
```

Depois abra <http://localhost:5180> no navegador.

> **Dica:** para ganhar o atalho do aplicativo, rode uma vez `npm run launcher:install` na pasta do workStuff. Acrescente `-- --desktop` para ter também um ícone na área de trabalho.

**Como saber que deu certo:** a tela [Início](/) abre, e a barra no pé da janela diz **servidor local :3101**. Se ela disser **servidor local não respondeu**, o servidor não está rodando: suba de novo com `npm run dev` e veja no terminal se apareceu algum erro.

## Passo 1: conferir a máquina

**Por quê:** a maioria das telas chama programas instalados no seu computador (`git`, `kubectl`, `docker`, um programa de IA). Se faltar um, a tela falha sem motivo claro. A tela [Máquina](/maquina) descobre isso antes.

1. Abra a [Máquina](/maquina), no grupo **Ferramentas**.
2. Clique em **Verificar máquina** (ou **Verificar de novo**, se ela já rodou uma vez). A verificação só lê versões e configurações; não altera nada.
3. Olhe os contadores de **Pendências** e **Avisos**. Cada item diz o que falta e como resolver.
4. Quando um item tem correção automática, clique em **Executar**. Itens que precisam de permissão de administrador (`sudo`) mostram o comando para você rodar no terminal.

**Como saber que deu certo:** a tela diz **Máquina apta: nenhuma pendência obrigatória.** Avisos podem ficar: funcionam, mas com limitação. O guia completo está em [Máquina](/documentacao/maquina).

## Passo 2: escolher a IA e o idioma

**Por quê:** várias telas pedem ajuda a uma IA (diagnosticar um pod, explicar uma pipeline que falhou, revisar uma branch). O painel precisa saber qual programa de IA chamar e qual modelo usar.

1. Clique em **Configurações**, no pé do menu.
2. Em **Provedor de IA**, clique no programa que você tem instalado: **Claude Code**, **OpenAI Codex** ou **Google Antigravity**. Os que não estão instalados aparecem como **não detectado** e não podem ser escolhidos.
3. Escolha um modelo (o marcado como **recomendado** é um bom começo) e o **Esforço**.
4. Clique em **Salvar alterações**.
5. Se preferir o painel em inglês, abra **Aparência** e escolha **English** em **Idioma**. A página recarrega.

> **Dica:** salve a escolha da IA antes de trocar o idioma: a recarga descarta o que não foi salvo.

**Como saber que deu certo:** o botão vira **Salvo**, e **Provedor de IA** mostra o nome do programa escolhido. O guia completo está em [Configurações](/documentacao/configuracoes).

## Passo 3: conectar o GitLab ou o GitHub

**Por quê:** com uma conexão, você navega nos seus grupos e projetos, clona mantendo a estrutura de pastas, acompanha pipelines e deixa a Fábrica abrir o merge request por você.

1. Abra os [Repositórios](/repositorios), no grupo **Deploy**.
2. Clique em **Conectar GitLab ou GitHub**. Um assistente pede, um passo por vez, o **Provedor**, o **Token** (uma chave de acesso pessoal criada no GitLab ou no GitHub), o **Protocolo**, o **Grupo base** e o **Workspace** (a pasta onde os clones vão ficar).
3. Clique em **Próximo** em cada passo e, no fim, em **Salvar conexão**.

**Como saber que deu certo:** aparece a mensagem **Conexão criada**, e a tela lista os grupos e projetos do grupo base. O guia completo está em [Repositórios](/documentacao/repositorios).

## Passo 4: conectar um cluster (se você usa Kubernetes)

**Por quê:** as telas do grupo **Kubernetes** trabalham todas sobre o cluster que você conecta aqui. Se você não trabalha com Kubernetes, pule este passo.

1. Abra o [Cluster](/cluster), no grupo **Kubernetes**.
2. Clique em **Escolher kubeconfig**. A lista mostra os arquivos de `~/.kube`. Se o seu não estiver lá, clique em **Adicionar kubeconfig** e escolha o arquivo: o painel confere o arquivo antes de salvar.
3. Antes de conectar, confira a classe de ambiente no seletor ao lado do arquivo (**DES**, **ITG**, **HML** ou **PRO**). O painel deduz pelo nome do arquivo; escolha outra classe para corrigir. Um arquivo sem classe vale como produção e fica somente leitura.
4. Clique no arquivo para conectar. Se ele tiver mais de um contexto (mais de um cluster ou usuário dentro do mesmo arquivo), escolha o contexto no seletor que aparece no topo.

**Como saber que deu certo:** a tela mostra **Conectado**, os pods aparecem em **Visão geral**, e o selo no canto superior esquerdo das telas de Kubernetes mostra a classe e o contexto. O guia completo está em [Cluster](/documentacao/cluster).

## Passo 5: experimentar uma primeira tarefa na Fábrica

**Por quê:** a [Fábrica](/fabrica) é onde agentes de IA escrevem código por você, numa cópia separada do repositório. Experimentar uma tarefa pequena mostra o fluxo inteiro sem risco: nada chega ao GitLab ou ao GitHub sem a sua aprovação.

1. Abra a [Fábrica](/fabrica), no grupo **Desenvolvimento**.
2. Clique em **Modo guiado**. Ele confere a máquina primeiro: a Fábrica precisa do `bwrap` (o pacote bubblewrap) para isolar os agentes, e a tela [Máquina](/maquina) mostra como instalar.
3. Escolha a **Pasta do repositório** e a **Branch base**, e confira o **Comando de verificação** (por exemplo `npm run build`).
4. Escreva um pedido pequeno e claro em **Título** e **Descrição**, por exemplo "Corrigir o erro de digitação no título do README".
5. Defina um **Teto de custo em US$** se quiser um limite, e clique em **Criar e começar**.
6. Acompanhe o cartão no quadro. Quando o plano fica pronto, a tarefa espera você: leia, edite se quiser e aprove.

**Como saber que deu certo:** a tarefa chega na revisão com as alterações, os testes e os achados à mostra, e você escolhe se ela vira merge request. O guia completo está em [Fábrica](/documentacao/fabrica).

## Para onde ir depois

- Dê uma volta pela tela [Início](/): ela resume tudo o que você configurou nesta sessão ([página do manual](/documentacao/inicio)).
- Aprenda os atalhos e as partes da interface em [O que é o workStuff](/documentacao/introducao).
- Deixe [Conceitos e termos](/documentacao/conceitos) à mão para qualquer palavra que você não conheça.
