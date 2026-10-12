# Logs

Acompanha ao vivo os logs de todos os pods de uma ou mais aplicações ao mesmo tempo, numa lista só, com uma cor para cada pod. Serve para ver o que a aplicação inteira está fazendo, e não só uma cópia dela.

## Quando usar

- A aplicação `api-pedidos` roda em três pods e você não sabe em qual deles a requisição com erro caiu.
- Você quer seguir duas aplicações que conversam entre si (por exemplo, `api` e `worker`) e ver a ordem dos acontecimentos.
- Você vai fazer um teste em homologação e quer ver os logs chegando enquanto testa.

## Palavras que aparecem nesta tela

| Termo | O que é |
|---|---|
| **Log** | O texto que a aplicação escreve enquanto roda: avisos, erros, requisições recebidas. |
| **Pod** | Uma cópia da aplicação rodando no cluster. Uma aplicação costuma ter vários pods iguais. |
| **Namespace** | Uma divisão do cluster, como uma pasta, que agrupa as aplicações (por exemplo, `pedidos-hml`). |
| **Label** | Uma etiqueta `chave=valor` presa ao pod, como `app=api`. É por ela que a tela sabe quais pods são da mesma aplicação. |
| **Seletor** | A regra que escolhe os pods pelas labels, como `app=api` ou `app in (api,worker)`. |
| **Container** | Cada programa dentro do pod. Um pod pode ter, além da aplicação, um container auxiliar. |

Mais termos em [Conceitos e termos](/documentacao/conceitos).

## Antes de começar

- Um cluster conectado na tela [Cluster](/cluster). Veja como em [Cluster](/documentacao/cluster). Esta tela usa o mesmo cluster e contexto, mostrados em **Cluster** no topo do cartão.

## Conhecendo a tela

- **Linha do namespace**: o campo `namespace` e o botão **Listar aplicações**. O namespace digitado fica lembrado neste navegador.
- **Aplicações**: depois de listar, um botão por aplicação, com o número de pods de cada uma.
- **Linha de opções**: o campo do seletor (**seletor, ex.: app=api**), o campo **container (padrão)**, o período e o botão **Acompanhar**.
- **Painel de logs**: aparece depois de começar. No topo, o estado (**conectando**, **ao vivo**, **pausado**, **parado** ou **erro**), quantos pods e linhas, o filtro **Filtrar texto ou pod**, **Pausar**, **Copiar** e a lixeira, que limpa a tela. Abaixo, a legenda com a cor de cada pod. Cada linha começa com o final do nome do pod, na cor dele.

## Passo a passo: acompanhar os logs de uma aplicação

1. Digite o namespace, por exemplo `pedidos-hml`.
2. Clique em **Listar aplicações**. Aparece um botão para cada aplicação do namespace.
3. Clique na aplicação que você quer. O seletor é preenchido sozinho, por exemplo `app=api-pedidos`.
4. Para seguir mais de uma, clique nas outras. O seletor vira `app in (api-pedidos,worker)`.
5. Escolha o período: **últimos 5 min**, **últimos 10 min**, **última hora** ou **só as 100 últimas linhas**.
6. Clique em **Acompanhar**. O estado passa para **ao vivo** e as linhas novas vão chegando no fim da lista.
7. Para encerrar, clique em **Parar**.

> **Dica:** enquanto acompanha, os campos de cima ficam travados. Para trocar a aplicação ou o período, clique em **Parar**, mude e clique em **Acompanhar** de novo.

### Ler com calma e procurar um texto

1. Clique em **Pausar**. A tela para de rolar. As linhas que chegam nesse meio-tempo não se perdem: ficam guardadas.
2. Digite no filtro um trecho, como `Exception`, ou parte do nome de um pod. Só as linhas que casam ficam visíveis.
3. Clique em **Copiar** para levar as linhas visíveis, cada uma com o nome do pod entre colchetes.
4. Clique em **Retomar**. As linhas guardadas durante a pausa entram na lista, na ordem certa.

## Bom saber

- A tela só lê: nada é alterado no cluster.
- Só dá para juntar aplicações que usam a mesma chave de label. Se você clicar numa aplicação de outra chave (por exemplo, `app.kubernetes.io/name` depois de `app`), a seleção recomeça com ela.
- Você também pode digitar o seletor à mão, por exemplo `app=api,tier!=db`.
- Com o campo **container (padrão)** vazio, cada pod mostra o seu container principal. Para ver outro container, digite o nome dele.
- A tela guarda as 5.000 linhas mais recentes. Acima disso, as mais antigas saem da lista.
- O `kubectl` segue no máximo 30 pods ao mesmo tempo.
- A cor de cada pod é fixa durante a sessão: o mesmo pod tem sempre a mesma cor.

## Problemas comuns

- **Aparece "Nenhum cluster conectado".** Clique em **Conectar na tela Cluster** e escolha um kubeconfig.
- **Aparece "Nenhum pod com label de app neste namespace".** Os pods não usam as labels de aplicação mais comuns. Digite o seletor no campo, com uma label que os pods tenham.
- **O estado fica em ao vivo, mas nenhuma linha aparece.** Aparece **conectado; nenhuma linha no período escolhido ainda.** A aplicação não escreveu nada no período. Escolha um período maior ou espere.
- **Aparece o erro "seletor de label inválido".** O seletor tem caracteres que não são aceitos. Use o formato `chave=valor`, por exemplo `app=api`.
- **O estado vai para erro.** Leia a mensagem em vermelho: costuma ser um namespace que não existe ou sem permissão de leitura de logs.
