# Manual do usuário: como escrever

As páginas de `en/` e `pt/` são a documentação que o painel mostra em **Documentação** (`/documentacao`) e no botão **Como usar esta tela** de cada tela. A lista de páginas e a ordem estão em `src/app/manual.ts`; `scripts/check-manual.ts` confere tudo o que está em **Regras verificadas**.

## Para quem

Para alguém que nunca abriu o painel e não conhece os termos. Se a pessoa precisar perguntar a alguém o que uma palavra quer dizer, a página falhou.

- Jargão só quando é o nome da coisa, e explicado na primeira vez em que aparece na página (ou com link para [Conceitos e termos](/documentacao/conceitos)).
- Frases curtas, voz ativa, segunda pessoa ("você clica", "you click").
- Cada passo diz onde clicar, com o rótulo exato da tela em **negrito**, e o que acontece depois.
- Exemplos concretos ("o namespace `pedidos-hml`"), nunca "o recurso X".
- Não invente: todo comportamento descrito foi conferido no código da tela (`src/features/...`) e da rota (`server/...`).

## Estrutura de uma página de tela

```markdown
# <Nome da tela, igual ao menu>

<Para que serve, em uma ou duas frases: o problema que a tela resolve, em palavras comuns.>

## Quando usar
- Situações concretas em que esta tela é o caminho.

## Antes de começar
- O que precisa estar pronto (com link para a página que ensina). Omita se não houver nada.

## Conhecendo a tela
- As partes da tela (abas, cartões, filtros) e o que cada uma mostra.

## Passo a passo: <a tarefa principal>
1. Um passo por item, na ordem.

### <Outra tarefa da tela>
1. ...

## Bom saber
- Limites, o que a tela não faz, o que é seguro e o que pede confirmação.

## Problemas comuns
- **<O que a pessoa vê>.** O que fazer.
```

As seções podem mudar quando a tela pedir (uma tela grande ganha mais tarefas), mas a ordem acima ajuda quem lê várias páginas.

## Avisos

Use citação com o rótulo em negrito, sem emoji:

```markdown
> **Dica:** ...
> **Atenção:** ...
```

Em inglês: `> **Tip:**` e `> **Warning:**`.

## Links

- Para outra página do manual: `[Cluster](/documentacao/cluster)`; para um título dela: `/documentacao/cluster#passo-a-passo-...`.
- Para uma tela do painel: `[Máquina](/maquina)`. O link abre a tela no próprio painel.
- Não ponha link dentro de um título (`##`): o índice da página não mostra links.

## Regras verificadas

- A página existe em `en/` e `pt/` com o mesmo nome de arquivo.
- A primeira linha é `# Título`, e logo abaixo vem o parágrafo de propósito (mais de 40 caracteres).
- Pelo menos duas seções `##`, e o mesmo número de `##` nos dois idiomas.
- Todo link `/documentacao/<página>` aponta para uma página que existe, e todo link `/<tela>` para uma tela do menu.
