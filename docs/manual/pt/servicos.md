# Serviços locais

Mostra o que está rodando no seu computador agora: quem ocupa cada porta, o que o Docker guardou e as aplicações que você cadastrou. Daqui você libera uma porta presa, limpa o Docker e sobe os seus projetos sem abrir um terminal.

## Quando usar

- Você tenta subir a API e recebe "porta 8080 já em uso", e não sabe que programa está nela.
- O disco está enchendo e você suspeita das imagens e volumes antigos do Docker.
- Você quer parar ou reiniciar o banco que roda num container sem lembrar o comando.
- Você sobe sempre os mesmos projetos (por exemplo, o front com `npm run dev` e a API com `./run.sh`) e quer fazer isso com um clique, vendo o log na tela.

## Antes de começar

- A parte do Docker só aparece se o Docker estiver instalado e respondendo. Se não estiver, a tela avisa, e a tela [Máquina](/maquina) mostra o que falta.
- Nenhuma configuração é necessária para ver as portas.

## Conhecendo a tela

A tela tem duas abas no topo: **Portas e Docker** e **Aplicações**.

Alguns termos que aparecem nela:

- **Porta**: um número (como `5432` ou `8080`) pelo qual um programa recebe conexões. Só um programa pode ocupar cada porta ao mesmo tempo.
- **Processo**: um programa em execução. O **PID** é o número que o sistema dá a cada processo.
- **Container**: um programa empacotado pelo Docker, rodando isolado do resto da máquina. Ele nasce de uma **imagem** (o pacote baixado ou construído) e pode guardar dados num **volume** (uma pasta gerenciada pelo Docker que continua existindo mesmo se o container for apagado).
- **Compose**: um arquivo que descreve vários containers juntos (por exemplo, banco e fila). Cada um vira um **projeto compose**.

Mais termos em [Conceitos e termos](/documentacao/conceitos).

### Aba Portas e Docker

| Parte | O que mostra |
|---|---|
| **Portas em escuta** | Cada porta aberta, o endereço, o processo dono e o PID. Ao lado do título aparece o sistema operacional. |
| **Docker** | Quatro abas: **Containers**, **Imagens**, **Volumes** e **Compose**, cada uma com a quantidade entre parênteses e um campo **Filtrar por nome**. |
| **Atualizar** | Lê tudo de novo. Esta aba não se atualiza sozinha. |

Marcas que você pode ver na lista de portas:

| Marca | Significado |
|---|---|
| **ok** | Um só processo na porta. |
| **conflito** | Mais de um processo escuta na mesma porta: um deles pode estar respondendo no lugar do outro. |
| **rede** | A porta aceita conexão de outras máquinas da rede, e não só deste computador. |
| **este painel** | O processo é do próprio workStuff. Ele não pode ser encerrado daqui. |
| **outro usuário** | Processo do sistema ou de root (o administrador). O seu usuário não consegue encerrá-lo, e o sistema nem informa o PID. |

### Aba Aplicações

Lista as **Aplicações cadastradas**: projetos seus que o painel sobe com uma pasta e um comando. Cada linha mostra o estado, o nome, a pasta, o comando, a porta e o PID.

| Estado | Significado |
|---|---|
| **rodando** | O processo que o painel iniciou está vivo. |
| **iniciando** | O processo está vivo, mas a porta cadastrada ainda não abriu. |
| **porta ocupada** | A aplicação está parada, mas outro processo, que o painel não iniciou, está na porta dela. |
| **parado** | Nada rodando. |

Esta aba se atualiza sozinha a cada 3 segundos enquanto está visível.

## Passo a passo: liberar uma porta ocupada

1. Na aba **Portas e Docker**, digite no campo **Filtrar por porta, processo ou PID** o número da porta, por exemplo `8080`.
2. Confira na linha qual processo está nela.
3. Clique em **Encerrar**. Abre uma confirmação com o comando exato que será executado (`kill` no Linux e no macOS, `taskkill` no Windows), o efeito e o que se perde.
4. Clique em **Encerrar** na confirmação. Um aviso diz se o processo parou e a porta ficou livre.
5. Se o aviso disser que o processo ainda está vivo, repita marcando **Forçar** na confirmação. O botão vira **Forçar encerramento**.

> **Atenção:** **Forçar** encerra o processo na hora, sem dar chance de ele fechar arquivos e conexões. Dados que ele ainda não salvou se perdem. Use só se o encerramento normal não resolver.

### Limpar o que o Docker acumulou

1. Na seção **Docker**, abra a aba **Containers**, **Imagens** ou **Volumes**.
2. Clique em **Apagar** na linha do item.
3. Leia a confirmação: ela mostra o comando (`docker rm`, `docker image rm` ou `docker volume rm`) e o que se perde.
4. Para volume, digite o nome dele no campo da confirmação. Depois clique em **Apagar**.

O botão **Apagar** fica desligado quando não é possível apagar:

- Container rodando: pare o container antes.
- Imagem ou volume com a marca **em uso**: algum container, rodando ou parado, depende dele. Apague o container antes.

### Iniciar, parar e reiniciar containers e projetos compose

1. Na aba **Containers**, use **Iniciar** num container parado, ou **Reiniciar** e **Parar** num que está rodando.
2. Na aba **Compose**, use **Subir** (executa `docker compose up -d`) ou **Parar** no projeto.
3. Confirme. Quem estiver usando o serviço perde a conexão até ele voltar.

> **Dica:** um projeto compose só aparece na aba depois do primeiro `docker compose up` feito nele.

## Passo a passo: cadastrar e subir uma aplicação local

1. Abra a aba **Aplicações** e clique em **Nova aplicação**.
2. Preencha os campos:

   | Campo | O que pôr | Exemplo |
   |---|---|---|
   | **Nome** | Como a aplicação aparece na lista. | `API de pedidos` |
   | **Pasta** | Onde o comando roda. Aceita `~` para a sua pasta pessoal. | `~/workspace/pedidos-api` |
   | **Comando** | Só o programa, sem argumentos. | `npm` |
   | **Argumentos, um por linha** | Cada argumento numa linha. Um argumento com espaços continua inteiro. | `run` e, na linha de baixo, `dev` |
   | **Porta** | Opcional. A porta em que a aplicação responde, de 1 a 65535. | `4000` |
   | **URL** | Opcional. Precisa começar com `http://` ou `https://`. | `http://localhost:4000` |
   | **Variáveis de ambiente, NOME=valor por linha** | Opcional. Configurações passadas ao programa. | `NODE_ENV=development` |

3. Clique em **Salvar**. A aplicação entra na lista como **parado**.
4. Clique em **Iniciar**. O log se abre logo abaixo da linha e o estado passa a **iniciando** e depois **rodando**.
5. Se você cadastrou uma URL, o botão **Abrir** leva à aplicação no navegador.
6. Para desligar, clique em **Parar**. Para desligar e ligar de novo, **Reiniciar**.

> **Atenção:** o comando roda sem shell (o interpretador de comandos do terminal). Por isso `&&`, `|` e `>` não funcionam. Para encadear comandos, crie um script (por exemplo `./run.sh`) e cadastre o script como comando.

### Acompanhar o log

1. Clique em **Logs** na linha da aplicação. Ao iniciar ou reiniciar, ele já se abre sozinho.
2. Use **filtrar por texto…** para ver só as linhas com uma palavra, por exemplo `error`.
3. Clique em **Quebrar linha** se as linhas forem longas demais para a largura da tela.
4. Feche com o **X** no canto.

Linhas com `error`, `exception` ou `fatal` aparecem destacadas como erro, e com `warn`, como alerta.

### Editar ou excluir uma aplicação

1. Clique no ícone de lápis (**Editar**) para mudar qualquer campo. A mudança vale no próximo início: o que já está rodando continua com a configuração antiga.
2. Para excluir, pare a aplicação e clique no ícone de lixeira (**Excluir**). Confirme em **Excluir**.

Excluir apaga só o cadastro e o último log. A pasta e o código do projeto não são tocados.

## Bom saber

- Na aba **Portas e Docker**, toda ação que muda algo (encerrar processo, apagar, iniciar, parar) pede confirmação e mostra o comando antes. Na aba **Aplicações**, só excluir pede confirmação.
- O processo aparece sem os argumentos com que foi iniciado, porque eles podem conter senha.
- Apagar um volume apaga os dados dele para sempre (banco local, uploads, cache). Não há como desfazer.
- Apagar uma imagem só tira ela do disco. Se você precisar dela de novo, o Docker baixa ou reconstrói.
- **Parar** uma aplicação encerra também os processos filhos dela. Por exemplo, o servidor que o `npm run dev` cria por baixo morre junto.
- O log de uma aplicação recomeça do zero a cada início. A tela mostra até as últimas 5.000 linhas.
- Aplicações iniciadas aqui continuam rodando mesmo se você fechar o navegador.

## Problemas comuns

- **O botão Encerrar está desligado.** O processo é do próprio painel (**este painel**) ou de outro usuário (**outro usuário**). O do painel não pode ser encerrado daqui; o de outro usuário exige permissão de administrador, fora do painel.
- **"O processo ainda está vivo".** Abra **Encerrar** de novo e marque **Forçar**.
- **O Docker recusou apagar a imagem ou o volume.** Algum container, mesmo parado, ainda usa o item. Apague o container primeiro.
- **"não encontrado na lista atual; atualize a tela".** A lista mudou desde a última leitura. Clique em **Atualizar** e tente de novo.
- **A aplicação mostra porta ocupada.** Outro processo está na porta dela, talvez uma cópia que você subiu pelo terminal. Libere a porta na aba **Portas e Docker** e clique em **Iniciar**.
- **"pasta não encontrada".** A pasta cadastrada não existe mais. Edite a aplicação e corrija o campo **Pasta**.
- **"não foi possível iniciar".** O comando não foi achado. Confira o campo **Comando**. No Windows, `npm` e `npx` não funcionam sem shell: cadastre `node` como comando e o script como argumento.
- **"não parou. Clique em Forçar parada…".** Alguns programas demoram para desligar ou ignoram o pedido. O botão **Parar** daquela aplicação vira **Forçar parada**: clique nele para encerrar o processo na hora. O que ele não salvou se perde.
