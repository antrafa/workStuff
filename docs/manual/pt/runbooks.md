# Runbooks

Transforma um procedimento escrito em Markdown num roteiro que você executa clicando: cada comando `kubectl` do texto vira um passo com botão, e o painel roda o comando no cluster conectado com as mesmas travas de segurança do Cluster Doctor.

## Quando usar

- Um pod está reiniciando sem parar e você quer seguir o roteiro de diagnóstico da equipe, passo a passo, sem copiar comando para o terminal.
- Você precisa reiniciar uma aplicação em homologação e quer conferir o comando exato antes de executar.
- A equipe tem procedimentos escritos e quer que qualquer pessoa consiga segui-los com segurança, inclusive quem não conhece o `kubectl`.

## Antes de começar

- Conecte-se a um cluster na tela [Cluster](/cluster). Os passos rodam sempre no cluster e no contexto escolhidos lá. Veja como em [Cluster](/documentacao/cluster).
- Saiba o ambiente do cluster: DES (desenvolvimento), ITG (integração), HML (homologação) ou PRO (produção). Ele decide o que pode ser executado. O ambiente vem do nome do kubeconfig ou é escolhido à mão na tela Cluster.
- Termos como cluster, namespace, pod e kubeconfig estão em [Conceitos e termos](/documentacao/conceitos).

O **kubectl** é a ferramenta de linha de comando que conversa com o cluster: `kubectl get pods` lista os pods, `kubectl logs` mostra o log de uma aplicação, e assim por diante. Um **runbook** é um procedimento escrito para resolver uma situação conhecida.

## Conhecendo a tela

A tela tem duas colunas:

| Parte | O que mostra |
|---|---|
| Lista à esquerda | Os runbooks da pasta escolhida, cada um com o título (a primeira linha `#` do arquivo) e o caminho do arquivo. No topo, **Runbooks do projeto** com o selo **projeto** quando é a pasta que vem com o painel, ou o caminho da sua pasta, e o botão **Trocar**. |
| Área à direita | O runbook aberto: o texto explicativo e, no meio dele, os passos executáveis. |

No alto da área à direita aparece **Roda em** com o nome do contexto e um selo com o ambiente. Se o kubeconfig não tem ambiente definido, o selo diz **sem classificação (vale como PRO)**.

Se o runbook usa variáveis, logo abaixo aparece um cartão com um campo para cada uma, como `namespace` ou `app`.

Cada passo mostra o comando como numa linha de terminal, e à direita:

| Selo | O que quer dizer | Botão |
|---|---|---|
| **leitura** | O comando só consulta o cluster. | **Rodar**: executa na hora. |
| **escrita** | O comando altera algo no cluster (reiniciar, escalar, apagar). | **Executar**: abre uma confirmação antes. |
| **bloqueado** | O comando não pode rodar aqui. O motivo aparece embaixo do passo. | Nenhum. |

Todo passo tem também um ícone para copiar o comando.

## Passo a passo: seguir um runbook

1. Na lista à esquerda, clique no runbook, por exemplo **Pod em CrashLoopBackOff**.
2. Preencha as variáveis no cartão do topo, por exemplo `namespace` = `pedidos-hml` e `deployment` = `api-pedidos`. Os comandos dos passos se atualizam com os valores.
3. Leia o texto do primeiro passo e clique em **Rodar**. A saída do comando aparece logo abaixo, em verde se deu certo e em vermelho se deu erro.
4. Siga o texto do runbook e rode os próximos passos de leitura do mesmo jeito.
5. Num passo de **escrita**, clique em **Executar**. Abre a janela **Executar passo de escrita**, com o cluster, o ambiente e o comando completo.
6. Confira o comando com calma. Se estiver certo, clique em **Executar**; se não, clique em **Cancelar**.
7. A saída aparece abaixo do passo, como nos passos de leitura.

> **Atenção:** um passo de escrita muda o cluster de verdade. Confira o namespace e o nome da aplicação na janela de confirmação antes de executar.

### Usar a sua própria pasta de runbooks

1. Clique em **Trocar**, no topo da lista.
2. Na janela **Pasta dos runbooks**, digite o caminho da pasta, por exemplo `~/runbooks`, ou clique em **Escolher…** para abrir o seletor de pastas.
3. Clique em **Usar pasta**. A lista passa a mostrar os arquivos `.md` dessa pasta e das subpastas.
4. Para voltar aos runbooks que vêm com o painel, clique em **Trocar** e depois em **Voltar para runbooks do projeto**.

### Escrever um runbook

Um runbook é um arquivo `.md` comum. A primeira linha `#` vira o título na lista. Cada linha dentro de um bloco de código marcado como `bash` (ou `sh`, `shell`, `console`) vira um passo; o resto do texto aparece como explicação. Use `{{nome}}` para um valor que muda a cada uso:

````markdown
# Reiniciar uma aplicação

Veja como estão os pods antes:

```bash
kubectl get pods -n {{namespace}}
```

Se estiverem travados, reinicie:

```bash
kubectl rollout restart deployment/{{app}} -n {{namespace}}
```
````

- Linhas vazias e linhas que começam com `#` dentro do bloco são ignoradas. Um `$ ` no começo da linha é removido.
- Blocos de outra linguagem (por exemplo, `yaml`) aparecem só como texto, sem botão.
- Cada linha é um comando só. Para filtrar a saída, use as opções do próprio kubectl (`-l`, `--tail`, `-o jsonpath='...'` entre aspas simples) em vez de `|` ou `grep`.

## Bom saber

- Só o `kubectl` roda, uma chamada por linha, sem shell: `|`, `;`, `&&`, `>` e `$( )` bloqueiam o passo.
- O passo não pode trocar de cluster: opções como `--context`, `--kubeconfig`, `--server`, `--token` e `--as` bloqueiam o passo.
- Ler um Secret (o objeto que guarda senhas e chaves) é sempre bloqueado, assim como `exec`, `cp`, `port-forward`, `create` e `run`.
- O que é leitura: `get`, `describe`, `logs`, `top`, `events`, `explain`, `rollout status`, `rollout history` e `auth can-i`, entre outros. O que é escrita: `rollout restart`, `scale`, `patch`, `label`, `annotate`, `set`, `apply` e `delete`. `apply` e `patch` com arquivo (`-f`) são recusados, porque a mudança precisa estar visível na própria linha.
- Regras por ambiente: PRO nunca escreve (só leitura), um kubeconfig sem ambiente vale como PRO, DES nunca apaga, e `cordon`, `drain` e `taint` de node nunca rodam em nenhum ambiente.
- O valor de uma variável só aceita letras, números, ponto, hífen, sublinhado, barra e `=`. Isso impede que um valor digitado vire outro comando.
- Mesmo depois da confirmação, o servidor relê o comando do arquivo e confere de novo as regras antes de executar.
- Cada comando tem até 60 segundos para terminar.
- Toda execução, de leitura ou de escrita, fica registrada em `~/.workstuff/runbook-audit.log`, com o arquivo, o passo, o comando, o cluster, o ambiente e o resultado.

## Problemas comuns

- **Aparece "Nenhum cluster conectado" e os botões ficam desativados.** Clique em **tela Cluster** no aviso e escolha um kubeconfig.
- **O passo aparece como bloqueado com "preencha a variável…".** Falta preencher essa variável no cartão do topo.
- **O passo diz "valor inválido para…".** O valor tem espaço ou um caractere não aceito. Use só letras, números, ponto, hífen, sublinhado, barra e `=`.
- **Um passo de escrita aparece bloqueado com "PRO é somente leitura".** O cluster conectado é de produção, ou não tem ambiente definido. Em PRO, só os passos de leitura rodam pelo painel.
- **Aparece "passo não encontrado; o arquivo pode ter mudado, recarregue".** O arquivo do runbook foi editado depois que você abriu a tela. Recarregue a página.
- **A lista mostra "Nenhum .md nesta pasta."** A pasta escolhida não tem arquivos `.md`. Clique em **Trocar** e escolha outra.
