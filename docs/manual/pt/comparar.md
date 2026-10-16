# Comparar ambientes

Mostra, lado a lado, o que é diferente entre as aplicações de dois ambientes (por exemplo, homologação e produção): versão da imagem, número de cópias, recursos, variáveis e verificações de saúde. Serve para responder "por que funciona lá e não aqui?" sem abrir dois terminais.

## Quando usar

- Um erro aparece em produção (PRO) e não em homologação (HML), e você quer saber o que muda entre os dois.
- Antes de uma entrega, você quer confirmar que a versão testada em HML é a mesma que vai para PRO.
- Alguém pergunta se o limite de memória de uma aplicação é igual nos dois ambientes.
- Você suspeita que uma variável de ambiente ficou com valor diferente em um dos lados.

## Antes de começar

- Os arquivos de acesso aos clusters precisam estar na sua pasta `~/.kube`. Um cluster é o conjunto de máquinas onde as aplicações rodam, e o arquivo que dá acesso a ele se chama **kubeconfig**. Veja como adicionar um em [Cluster](/documentacao/cluster).
- Você precisa saber o nome do **namespace** de cada lado. Namespace é uma "pasta" dentro do cluster que agrupa as aplicações de um sistema, por exemplo `pedidos-hml` e `pedidos-pro`.
- Os termos usados aqui estão explicados em [Conceitos e termos](/documentacao/conceitos).

## Conhecendo a tela

A tela tem um cartão no topo com os dois lados da comparação:

| Parte | O que é |
|---|---|
| **Lado A** e **Lado B** | Cada lado tem a lista **escolha o kubeconfig**, a lista de contextos (só aparece quando o kubeconfig tem mais de um) e o campo **namespace**. |
| Botão com duas setas | **Trocar os lados**: inverte A e B. |
| **Comparar** | Lê os dois lados e mostra o resultado. Só fica ativo quando os dois lados têm kubeconfig e namespace. |

O **contexto** é a combinação de cluster e usuário dentro de um kubeconfig. A maioria dos arquivos tem um só; quando há vários, a tela começa pelo contexto padrão do arquivo.

Depois de comparar, aparecem:

- **Quatro contadores**: quantos workloads estão **diferente**, **só em A**, **só em B** e **igual**. Workload é o nome genérico de uma aplicação no cluster. A tela compara três tipos: Deployment (aplicação que fica sempre no ar), StatefulSet (aplicação que guarda dados, como um banco) e CronJob (tarefa agendada).
- **A tabela de workloads**, com as colunas **Workload**, **Estado** e **Diferenças** (os nomes dos primeiros campos que mudaram).
- **Com diferença (n)** e **Todos (n)**: alternam entre ver só o que mudou ou tudo.
- **Filtrar por nome**: procura um workload pelo nome.
- No rodapé, o que foi lido de cada lado (kubeconfig, contexto, namespace e quantidade de workloads).

## Passo a passo: comparar dois namespaces

1. No **Lado A**, abra **escolha o kubeconfig** e escolha o arquivo do primeiro ambiente (por exemplo, o de HML).
2. Se aparecer uma segunda lista, escolha o contexto certo.
3. No campo **namespace**, digite o namespace, por exemplo `pedidos-hml`.
4. Repita no **Lado B** com o outro ambiente, por exemplo `pedidos-pro`. Pode ser outro cluster ou o mesmo.
5. Clique em **Comparar**. Enquanto lê, o botão mostra **Comparando…**.
6. Veja os contadores e a tabela. Por padrão, a tabela já mostra só **Com diferença**.
7. Clique numa linha com a seta à esquerda para abrir os detalhes. Aparece uma tabela com **Campo**, **A** e **B**, um campo por linha.

> **Dica:** a tela lembra os dois lados neste navegador. Na próxima vez, basta clicar em **Comparar**.

## Entendendo o resultado

O **Estado** de cada workload quer dizer:

| Estado | Significado |
|---|---|
| **diferente** | Existe nos dois lados, mas pelo menos um campo muda. |
| **só em A** | Existe só no lado A. |
| **só em B** | Existe só no lado B. |
| **igual** | Existe nos dois lados com a mesma configuração. |

Os nomes dos campos vêm do servidor e aparecem assim:

| Campo | O que compara |
|---|---|
| `réplicas` | Quantas cópias da aplicação rodam ao mesmo tempo. |
| `agenda` | O horário de um CronJob, no formato cron (por exemplo, `0 3 * * *` é todo dia às 3h). |
| `<container>.imagem` e `<container>.tag` | O endereço da imagem (o pacote da aplicação) e a versão dela. A tag é a diferença que mais costuma importar. |
| `<container>.requests.cpu`, `<container>.limits.memory` | Recursos: o mínimo reservado (request) e o máximo permitido (limit) de CPU e memória. |
| `<container>.env.NOME` | O valor da variável de ambiente `NOME`. |
| `<container>.envFrom.secret.X`, `<container>.envFrom.configmap.X` | O container carrega todas as variáveis de um Secret ou ConfigMap chamado `X`. |
| `<container>.readiness`, `<container>.liveness` | As verificações de saúde (probes): como o cluster testa se a aplicação está pronta e se está viva, com atraso, período, tempo limite e falhas aceitas. |

Container é cada programa dentro de um pod; o nome dele aparece no começo do campo, como em `app.tag`. Quando um campo existe só de um lado, o outro mostra **ausente**.

### Ver o que vai junto com a versão nova

Quando a tag muda entre os lados, o detalhe do workload mostra o botão **O que muda de `<tag B>` para `<tag A>`**. Ele lista os commits que a versão do lado A tem e a do lado B ainda não: é o que chega ao ambiente B se ele receber a imagem do A.

1. Abra um workload com a tag diferente e clique em **O que muda de ... para ...**.
2. Confira o clone escolhido. O painel tenta adivinhar pelo nome do workload; se errar, escolha outro na lista.
3. Leia o resultado: quantos commits e MRs vão junto, quantos arquivos mudam e a lista de commits, do mais novo para o mais velho.
4. Se a versão não for achada no clone, a tela diz o que tentou. Atualize o clone com **Fetch** em [Meu Workspace](/repositorios) ou digite à mão a tag ou o commit e clique em **Ver commits**.

A tag da imagem vira uma versão do git assim: a própria tag (`1.4.2`), com `v` na frente (`v1.4.2`), um código de commit (`3f9c2ab`) ou o código no fim da tag (`1.4.2-3f9c2ab`). O botão **Trocar as versões** inverte o sentido.

## Bom saber

- A tela só lê. Nada é alterado em nenhum dos clusters.
- Um Secret (objeto que guarda senhas e chaves) nunca é lido. Uma variável que vem de um Secret aparece só como referência, por exemplo `secret db/senha` (nome do Secret e chave).
- Uma variável com nome de senha, token ou chave, ou com uma senha dentro de uma URL de conexão, aparece mascarada como `•••• oculto (a1b2c3d4)`. Valores iguais recebem a mesma marca, então dá para saber se a senha difere entre os lados sem ver a senha.
- Cada lado tem o próprio kubeconfig: esta tela não depende do cluster escolhido na tela [Cluster](/cluster).
- **O que muda** só lê o clone que já está na sua máquina: não faz fetch nem troca de branch. Uma tag que ainda não chegou ao clone não é achada até você fazer o fetch.
- Só Deployments, StatefulSets e CronJobs entram. Services, Ingresses e ConfigMaps não são comparados.

## Problemas comuns

- **O botão Comparar não fica ativo.** Falta escolher o kubeconfig ou digitar o namespace de algum dos lados.
- **Aparece "Lado A: sem permissão para listar…".** O seu usuário não tem permissão (o RBAC, as regras de acesso do cluster) para ler aquele tipo de workload. Os outros tipos foram comparados normalmente; peça a permissão a quem administra o cluster se precisar deles.
- **Aparece um erro dizendo que o contexto não existe ou que o kubeconfig não foi encontrado.** O arquivo mudou ou foi removido de `~/.kube`. Escolha o kubeconfig de novo na lista.
- **Tudo aparece como "só em A" e "só em B".** Os nomes dos workloads são diferentes nos dois ambientes, ou o namespace digitado está errado. Confira o nome do namespace.
