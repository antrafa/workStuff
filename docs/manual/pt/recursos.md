# Requests & Limits

Mostra quanta memória, CPU e Java cada serviço declara nos arquivos de configuração de um grupo do GitLab e compara com o que os pods usam de verdade no cluster, sugerindo onde ajustar.

## Quando usar

- Um serviço morre por falta de memória (`OOMKilled`) e você quer ver o limite que ele declara e quanto está usando agora.
- Você quer achar os serviços que não declaram memória nenhuma, antes que causem problema.
- O cluster está caro ou cheio e você quer ver quem reserva muito mais memória do que usa.
- Você precisa revisar as opções de memória do Java (`-Xms`, `-Xmx`) de todos os serviços de um cliente de uma vez.

## Palavras que aparecem nesta tela

| Termo | O que é |
|---|---|
| **Manifest** | O arquivo YAML que descreve como um serviço roda no Kubernetes: imagem, variáveis e recursos. |
| **Request** | Quanto de memória ou CPU o cluster reserva para o serviço. A reserva fica presa a ele mesmo sem uso. |
| **Limit** | O teto. Se o serviço passar do limite de memória, o Kubernetes mata o container (`OOMKilled`) e ele reinicia. |
| **Mem req / Mem lim** | Request e limit de memória, nesta ordem. |
| **CPU req / lim** | Request e limit de CPU. `500m` é meio processador. |
| **-Xms / -Xmx** | Memória inicial e máxima do Java (a JVM) dentro do container. |
| **Metaspace** | A área de memória do Java que guarda as classes carregadas, fora do `-Xmx`. |
| **Grupo e subgrupo** | As pastas do GitLab que organizam os projetos. Aqui, cada subgrupo vira um cliente e cada projeto uma stack (o conjunto de serviços de um ambiente). |

Outros termos, como pod e namespace, estão em [Conceitos e termos](/documentacao/conceitos).

## Antes de começar

- Uma conexão GitLab cadastrada em [Repositórios](/repositorios), com um token que tenha acesso ao grupo. Conexões GitHub não servem para esta tela.
- Para comparar com o uso real: um kubeconfig adicionado na tela [Cluster](/cluster). Veja [Cluster](/documentacao/cluster).

## Passo a passo: escolher a origem dos manifests

1. Abra **Requests & Limits**. Na primeira vez, aparece o cartão **De onde ler os manifests**.
2. Em **Conexão GitLab**, escolha a conexão.
3. Em **Grupo**, digite o caminho do grupo (por exemplo, `minha-org/ambientes`) ou cole a URL dele.
4. Clique em **Testar**. O painel confere o grupo e diz quantos subgrupos encontrou, sem salvar.
5. Se estiver certo, clique em **Salvar**. Aparece **Origem salva** e a lista de clientes.

Para trocar depois, clique em **Trocar origem**, na faixa **Origem** do topo.

## Conhecendo a tela

- **Subgrupo**: um botão para cada cliente (subgrupo direto do grupo), com o filtro **Filtrar subgrupos…**. Projetos soltos no próprio grupo também entram.
- **Abas de stack**: quando o cliente tem mais de um projeto, cada um vira uma aba.
- **Cartão da stack**: o nome, o link **GitLab** para o projeto, quantos serviços e de qual branch foram lidos, e o botão **Atualizar**.
- **Totais**: **Serviços**, **Total mem req** (o que fica reservado no cluster), **Total mem lim** (o teto somado) e **Sem req/lim de memória**. Com o uso ao vivo, aparece também **Perto do limite (ao vivo)**.
- **Tabela**: uma linha por serviço, com **App** (a primeira pasta do caminho), **Serviço** (o nome do arquivo), **Mem req**, **Mem lim**, CPU e as opções do Java, quando existem. Um traço vermelho em memória quer dizer que o valor não foi declarado. **Ver YAML** abre o arquivo original.

O painel lê os arquivos YAML da branch principal de cada projeto pela API do GitLab, sem clonar. Valores escritos como `${NOME}` são trocados pelo que estiver nos arquivos `.env` do mesmo projeto. Arquivos e pastas da raiz do projeto que começam com `_` ficam de fora.

## Passo a passo: ver os recursos de uma stack

1. Clique no cliente em **Subgrupo**.
2. Se houver mais de uma stack, clique na aba da que você quer.
3. Espere a leitura. Na primeira vez, ela leva alguns segundos.
4. Clique no total **Sem req/lim de memória** para ver só os serviços sem request ou sem limit de memória. Clique de novo para limpar o filtro.
5. Clique no título de uma coluna (por exemplo, **Mem lim**) para ordenar por ela.
6. Para conferir o valor no arquivo, clique em **Ver YAML** na linha do serviço.

### Comparar com o uso real do cluster

1. No cartão da stack, na faixa **Comparar com o uso real:**, escolha o kubeconfig do cluster onde a stack roda.
2. Escolha o namespace na lista. Se o seu usuário não puder listar namespaces, digite o nome.
3. Clique em **Vincular**. O vínculo fica salvo para essa stack, e o uso é lido na hora.
4. A tabela ganha as colunas **Uso ao vivo** (memória que o pod usa agora e a porcentagem do limit) e **Recomendação**.
5. Clique em **Ler uso agora** para medir de novo. **Trocar vínculo** muda o kubeconfig ou o namespace, e **Remover** desfaz o vínculo.

As recomendações são:

| Recomendação | Quando aparece | O que sugere |
|---|---|---|
| **definir** | O manifest não declara Mem Req ou Mem Lim. | Declarar os dois antes de avaliar. |
| **↑ limite** | O uso agora passa de 85% do Mem Lim. | Considerar subir o limit antes que o container seja morto por falta de memória. |
| **↓ request** | O uso agora é menos de 40% do Mem Req. | O request pode estar reservando mais do que o serviço usa. |
| **ok** | O uso está entre o request e o limit, numa faixa confortável. | Nada a fazer. |

Passe o mouse sobre a recomendação para ler a explicação completa.

## Bom saber

- A tela não altera nada: nem no GitLab, nem no cluster. Para aplicar um ajuste, mude o manifest no repositório pelo caminho normal da equipe.
- A recomendação olha um único momento, não uma tendência. Com o pod parado, recém-iniciado ou fora do horário de pico, ela engana. Para acompanhar ao longo do tempo, use [Performance](/performance).
- Quando um serviço tem várias cópias (réplicas), vale o maior uso entre elas, porque é a que chega primeiro ao limite.
- O uso é lido no contexto atual do kubeconfig vinculado.
- A lista de clientes e os manifests ficam guardados: a tela mostra **lista lida há…** e **lido há…**. Use **Atualizar lista** quando um projeto novo surgir no GitLab e **Atualizar** no cartão quando um manifest mudar.

## Problemas comuns

- **Aparece "Nenhuma conexão GitLab".** Clique em **Criar conexão em Repositórios**, cadastre a conexão e volte.
- **Aparece "Nenhum projeto encontrado".** O grupo não tem projetos ativos em subgrupos diretos, ou o token da conexão não tem acesso a ele. Confira o caminho do grupo e clique em **Atualizar lista**.
- **Aparece "Nenhum arquivo de recurso encontrado".** Nenhum YAML da stack declara um bloco `resources` ou opções do Java na branch principal.
- **Um aviso diz que o GitLab não entregou alguns arquivos.** Esses arquivos ficaram fora da tabela nesta leitura. Clique em **Atualizar** para tentar de novo.
- **A coluna Uso ao vivo mostra "sem pod".** Não há pod desse serviço no namespace vinculado. Confira se o namespace é o certo.
- **A coluna mostra "sem métrica" ou aparece o aviso de metrics-server.** O cluster não tem o serviço que mede o uso, ou ainda não mediu esse pod. Espere um pouco e clique em **Ler uso agora**.
