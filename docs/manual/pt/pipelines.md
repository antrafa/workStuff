# Pipelines

Mostra numa lista só como estão as pipelines dos projetos que você acompanha, no GitLab CI ou no GitHub Actions. Quando um job falha, a IA lê o log e explica, em palavras simples, a causa provável e como corrigir.

## Quando usar

- Você acompanha vários projetos e quer ver de uma vez quais estão com a última pipeline vermelha.
- O job `test` do projeto `grupo/pedidos-api` falhou e você quer entender o motivo sem ler 3 mil linhas de log.
- Você quer ler o log de um job sem abrir o GitLab ou o GitHub.

## Antes de começar

Alguns termos usados nesta página:

- **Pipeline**: a sequência automática de tarefas que o GitLab ou o GitHub roda a cada mudança no código (compilar, testar, publicar). No GitHub, ela se chama workflow do GitHub Actions.
- **Job**: cada tarefa da pipeline, como `build` ou `test`. Os jobs são agrupados em **estágios**.
- **Log**: o texto que o job escreveu enquanto rodava. É ali que aparece o erro.
- **Branch**: a linha de desenvolvimento em que a pipeline rodou, como `main` ou `feature/novo-login`.

Mais termos em [Conceitos e termos](/documentacao/conceitos).

O que precisa estar pronto:

- Uma conexão com o GitLab ou o GitHub, criada na tela [Repositórios](/repositorios). Veja [Repositórios](/documentacao/repositorios). Sem ela, a tela mostra **Nenhuma conexão com GitLab ou GitHub** e o botão **Criar conexão**.
- Para usar **Explicar falha**, um assistente de IA configurado em [Configurações](/configuracoes). Veja [Configurações](/documentacao/configuracoes).

## Conhecendo a tela

| Parte | O que mostra |
|---|---|
| **Lista de projetos** | Um projeto acompanhado por linha, com a conexão, a **Última pipeline** (o status), a **Branch**, **Quando** ela rodou e a **Duração**. |
| **Atualizar** | Lê tudo de novo agora. A lista também se atualiza sozinha a cada 30 segundos enquanto a aba está aberta. |
| **Acompanhar projeto** | Adiciona um projeto à lista. |
| **Detalhe do projeto** | Aparece abaixo da lista quando você clica numa linha: as pipelines recentes e os jobs da escolhida. |

O status de uma pipeline ou de um job:

| Status | Significado |
|---|---|
| **passou** | Terminou sem erro. |
| **falhou** | Algum passo deu erro. |
| **rodando** | Está em execução agora. |
| **na fila** | Esperando uma máquina livre para rodar. |
| **manual** | Espera alguém disparar à mão no GitLab ou no GitHub. |
| **cancelada** | Alguém ou algo interrompeu. |
| **pulada** | Não rodou por regra da própria pipeline. |

Em cada linha, o ícone de seta abre a pipeline no navegador, e a lixeira para de acompanhar o projeto.

## Passo a passo: acompanhar um projeto

1. Clique em **Acompanhar projeto**.
2. Em **Conexão**, escolha a conexão onde o projeto está.
3. Em **Projeto**, digite o caminho completo, do jeito que aparece na URL do projeto. Exemplo: para `https://gitlab.com/minha-empresa/area/pedidos-api`, digite `minha-empresa/area/pedidos-api`. No GitHub, é `dono/repositorio`.
4. Clique em **Acompanhar** (ou aperte Enter). O painel confere que o projeto existe antes de salvar.
5. O projeto entra na lista com o status da última pipeline.

## Passo a passo: entender por que um job falhou

1. Na lista, clique na linha do projeto. O detalhe abre logo abaixo.
2. No topo do detalhe, cada botão é uma das 10 pipelines mais recentes, com a branch e há quanto tempo rodou. A bolinha é verde (passou), vermelha (falhou) ou amarela (outros casos). A mais recente já vem escolhida.
3. Clique na pipeline que falhou. Aparecem o status, a mensagem do commit (a mudança que disparou a pipeline), o código curto do commit, a duração e o botão **Abrir**, que leva à pipeline no navegador.
4. Na tabela de jobs, ache o job com **falhou**. Quando o provedor informa, a linha mostra também o **passo:** que falhou.
5. Clique em **Explicar falha**. Uma janela mostra o andamento: quantas linhas de log foram enviadas e se a IA também vai ler o código do projeto. Use **Parar** para interromper; o que já chegou fica na tela.
6. Leia a resposta. Use **Copiar** para levá-la a outro lugar ou **Refazer** para pedir de novo. A resposta traz a **Causa provável** (com a linha do log que a sustenta), a **Correção sugerida** e, quando a falha parece de rede, infraestrutura ou teste instável, um aviso **Se for intermitente**.

> **Dica:** se o projeto estiver clonado no workspace da conexão, a IA também lê os arquivos que o log cita e confirma a causa no código. Sem o clone, ela se baseia só no log. Para clonar, use a tela [Repositórios](/repositorios).

### Ler o log inteiro

1. Na linha do job, clique no ícone de documento (**Ver o log**).
2. O log abre numa janela. Se for muito longo, a tela avisa e mostra o fim, que é onde o erro costuma estar.
3. Clique em **Copiar** para levar o log a outro lugar.

### Parar de acompanhar um projeto

1. Clique na lixeira da linha do projeto.
2. Confirme em **Parar de acompanhar**. O projeto sai da lista; nada muda no GitLab ou no GitHub.

## Bom saber

- A tela só lê. Nenhuma pipeline é disparada, cancelada ou repetida por aqui. Para isso, use o botão de abrir no navegador.
- A IA também só lê: ela recebe o fim do log e o nome do job, e é instruída a não executar comandos.
- A resposta da IA vem em português, qualquer que seja o idioma do painel.
- Um job que falhou com **(permitido)** ao lado foi marcado, na própria pipeline, como uma falha aceitável.
- Você pode acompanhar até 50 projetos. Acompanhar de novo um projeto que já está na lista não o duplica.
- Os projetos acompanhados aqui podem virar alerta na tela [Verificações agendadas](/agenda), que avisa quando a pipeline quebra. Veja [Verificações agendadas](/documentacao/agenda).

## Problemas comuns

- **"informe o caminho completo do projeto (ex.: grupo/projeto)".** Faltou o grupo ou o dono. Digite o caminho inteiro, como `minha-empresa/area/pedidos-api`.
- **A linha do projeto mostra erro e não abre.** A mensagem ao lado diz o motivo. O mais comum é a conexão sem token: corrija a conexão na tela [Repositórios](/repositorios).
- **"conexão removida" embaixo do nome do projeto.** A conexão usada foi apagada em Repositórios. Pare de acompanhar o projeto e acompanhe de novo com outra conexão.
- **"Nenhuma pipeline neste projeto" ou "nenhuma pipeline ainda".** O projeto não tem pipeline configurada, ou ela nunca rodou.
- **A explicação da IA falhou.** Confira em [Configurações](/configuracoes) se o assistente de IA está instalado e configurado, e clique em **Refazer** na janela.
