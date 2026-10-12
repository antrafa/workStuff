# Upgrade

Mostra o que vai quebrar quando o Kubernetes for atualizado para uma versão nova, e o que está perto de vencer: objetos escritos num formato que a versão nova não aceita mais, certificados de segurança dos sites e credenciais de acesso aos clusters.

## Quando usar

- A equipe de infraestrutura avisou que o cluster vai passar da versão 1.29 para a 1.30, e você quer saber o que precisa ser corrigido antes.
- Você quer conferir se os arquivos de configuração de um repositório ainda usam um formato que deixou de existir.
- Você quer saber quando vence o certificado HTTPS dos endereços publicados no cluster.
- O seu acesso a um cluster parou de funcionar e você desconfia que a credencial venceu.

## Antes de começar

- As abas **APIs removidas** (na parte do cluster) e **Certificados TLS** usam o cluster escolhido na tela [Cluster](/cluster). Conecte-se lá primeiro. Veja como em [Cluster](/documentacao/cluster).
- A aba **Kubeconfigs** e a verificação de um repositório funcionam sem cluster conectado.
- Termos como cluster, namespace e kubeconfig estão em [Conceitos e termos](/documentacao/conceitos).

## Conhecendo a tela

A tela se chama **Prontidão para upgrade** e tem três abas:

| Aba | O que mostra |
|---|---|
| **APIs removidas** | Objetos do cluster e arquivos de um repositório que usam uma API removida na versão de destino. |
| **Certificados TLS** | Quando vence o certificado de cada endereço publicado no cluster. |
| **Kubeconfigs** | Quando vence a credencial de cada arquivo de acesso aos clusters. |

Algumas palavras que aparecem nesta tela:

- **API e apiVersion**: cada objeto do Kubernetes (uma aplicação, uma regra de rede, um agendamento) é escrito num formato com versão, como `batch/v1beta1` ou `networking.k8s.io/v1`. Essa linha se chama `apiVersion`. Formatos antigos são marcados como obsoletos (deprecated) e, algumas versões depois, removidos. Um objeto num formato removido deixa de ser aceito.
- **Certificado TLS**: o arquivo que permite abrir um endereço com `https://` sem aviso de segurança. Ele tem data de vencimento.
- **Kubeconfig**: o arquivo com o endereço e a credencial de acesso a um cluster.

Nas abas **APIs removidas** e **Certificados TLS**, o topo mostra **Cluster:** com o nome do contexto conectado e o campo **namespace (vazio = todos)**. Namespace é uma "pasta" do cluster que agrupa as aplicações de um sistema. Deixe vazio para olhar o cluster inteiro, ou digite um namespace quando o seu usuário só tem permissão nele.

## Passo a passo: descobrir o que quebra no cluster

1. Abra a aba **APIs removidas**.
2. Em **Versão de destino**, digite a versão para a qual o cluster vai, no formato `1.30`. Se deixar vazio (o campo mostra **próxima**), a tela usa a versão seguinte à atual do cluster.
3. No cartão **No cluster**, clique em **Verificar cluster**. O botão mostra **Verificando…** enquanto lê.
4. O título do cartão passa a mostrar a versão atual e a de destino, por exemplo `v1.29.3 → 1.30`.
5. Se nada quebra, aparece **Nada encontrado que quebre na 1.30 entre os N objetos lidos.**
6. Se algo quebra, a tabela mostra cada objeto com **Objeto**, **Aplicado com** (o formato usado), **Removida na** (a versão que removeu esse formato) e **Trocar por** (o formato novo). Quando não existe formato novo, aparece **sem substituto**.
7. Abaixo pode aparecer **Chamadas recentes a API obsoleta (métricas do apiserver)**. São pedidos feitos ao cluster num formato que vai ser removido, por algum programa (o Helm, um operador, um pipeline de entrega). A tabela mostra **Recurso**, **Versão chamada** e **Removida na**.
8. Corrija os arquivos de origem desses objetos e clique em **Verificar de novo** para conferir.

> **Dica:** a tela descobre o formato usado pela anotação que o comando `kubectl apply` grava em cada objeto. Objetos criados pelo Helm ou por um operador não têm essa anotação. Para eles, verifique os arquivos do repositório (próxima seção).

### Verificar os arquivos de um repositório

1. Ainda na aba **APIs removidas**, vá ao cartão **Nos manifests de um repositório**. Manifest é o arquivo YAML que descreve um objeto do Kubernetes.
2. Digite o caminho completo da pasta do repositório, por exemplo `~/projetos/pedidos`, ou clique em **Escolher** para abrir o seletor de pastas.
3. Clique em **Verificar para 1.30** (o número segue a **Versão de destino**; se ela estiver vazia, o padrão é 1.31).
4. Se nenhum arquivo usa formato removido, aparece **Nenhum dos N arquivos YAML usa API removida até a 1.30.**
5. Senão, a tabela mostra **Arquivo** (com o número da linha, como `k8s/app.yaml:6`), **Recurso**, **apiVersion**, **Removida na** e **Trocar por**.
6. Abra o arquivo na linha indicada e troque o `apiVersion` pelo valor de **Trocar por**.

### Ver o vencimento dos certificados TLS

1. Abra a aba **Certificados TLS**.
2. Clique em **Verificar certificados**. O botão mostra **Conectando…**.
3. Para cada endereço com HTTPS dos Ingresses (as regras que publicam um endereço na internet) e dos VirtualServices do Istio, a tela abre uma conexão e lê a data do certificado.
4. A tabela mostra **Host** (o endereço, com os objetos que o publicam embaixo), **Estado**, **Vence em** (data e dias que faltam) e **Detalhe** (quem emitiu e se a cadeia é válida). Os que vencem primeiro aparecem no topo.

| Estado | Significado |
|---|---|
| **ok** | Vence em mais de 30 dias. |
| **vence logo** | Vence em 30 dias ou menos. |
| **vencido** | Já venceu. |
| **inacessível** | O endereço não respondeu em 8 segundos ou recusou a conexão. |
| **sem data** | O endereço não apresentou certificado, ou é um curinga (`*.exemplo.com`), conferido pelos endereços concretos. |

O selo **não confiável** ao lado do estado quer dizer que o certificado não é reconhecido como válido (por exemplo, é autoassinado). O motivo aparece em **Detalhe**.

### Ver o vencimento das credenciais dos kubeconfigs

1. Abra a aba **Kubeconfigs**. A tabela carrega sozinha.
2. Para cada arquivo da sua pasta `~/.kube`, você vê **Kubeconfig** (com o ambiente, como `HML`), **Usuário**, **Estado**, **Vence em** e **Detalhe**.
3. Credenciais por token ou por login externo (OIDC, nuvem) não guardam data no arquivo e aparecem como **sem data**, com o tipo em **Detalhe**.

## Bom saber

- A tela só lê. Nada é alterado no cluster nem nos arquivos do repositório.
- O certificado é lido pela própria conexão HTTPS, como um navegador faria. Nenhum Secret (o objeto que guarda o certificado e a chave) é lido.
- A aba **Kubeconfigs** não fala com nenhum cluster: lê só a data de dentro do arquivo. A credencial em si nunca é mostrada.
- A tabela de formatos removidos segue o guia oficial de migração do Kubernetes e cobre as remoções da 1.16 até a 1.32.
- Na verificação de repositório entram arquivos `.yaml` e `.yml` de até 2 MB, até 2.000 arquivos. Pastas como `node_modules`, `.git`, `target`, `dist`, `build` e `vendor` ficam de fora. Um template do Helm só é verificado se a linha `apiVersion:` estiver escrita por extenso, sem variável.

## Problemas comuns

- **Aparece "Nenhum cluster conectado".** Clique em **Conectar na tela Cluster** e escolha o kubeconfig. Os manifests de um repositório você pode verificar mesmo sem cluster.
- **Aparece "use o formato 1.30".** A versão de destino precisa ter só o número principal e o secundário, como `1.30`, sem o `v` e sem o terceiro número.
- **O rodapé diz que o RBAC não permite ler as métricas do apiserver.** O seu usuário não tem permissão (o RBAC, as regras de acesso do cluster) para ver as chamadas recentes. Só a anotação foi conferida; o resultado é parcial.
- **O rodapé diz "Sem permissão para listar…".** Os tipos citados ficaram de fora. Digite um namespace onde você tem acesso no campo **namespace (vazio = todos)** e verifique de novo.
- **Um endereço aparece como inacessível.** Endereços da rede interna só respondem com a VPN ligada. Conecte-se à VPN e clique em **Verificar de novo**.
