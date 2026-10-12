# Revisão antes do MR

Pede à IA uma revisão do que a sua branch traz antes de você abrir o merge request: ela lê as mudanças e o código em volta e aponta os problemas por gravidade, com arquivo e linha.

## Quando usar

- Você terminou uma tarefa numa branch e quer achar bugs antes que o revisor do time ache.
- Você quer um parágrafo pronto para a descrição do merge request.
- Você mexeu em código que não conhece bem e quer uma segunda opinião sobre o que pode quebrar.

Alguns termos desta página:

- **Branch** é a linha de trabalho separada onde você fez as mudanças, por exemplo `feat/cadastro-cliente`.
- **Branch base** é a branch com a qual a sua vai ser comparada, normalmente a principal do projeto (`main`, `master` ou `develop`).
- **Merge request (MR)** é o pedido para juntar a sua branch na base, que o time revisa no GitLab ou GitHub.
- **Diff** é a lista do que mudou: as linhas que entraram e as que saíram.

Veja também [Conceitos e termos](/documentacao/conceitos).

## Antes de começar

- O projeto precisa ser um repositório git clonado na sua máquina.
- Um provedor de IA precisa estar configurado em [Configurações](/configuracoes). Veja [Configurações](/documentacao/configuracoes).
- Rode `git fetch` no repositório antes. Assim a branch base remota (por exemplo, `origin/main`) está na versão mais recente e a comparação não inclui mudanças que já foram para a base.

## Conhecendo a tela

- **Campo do caminho**: onde vai a pasta do repositório, por exemplo `/home/voce/workspace/loja-api`. O botão **Escolher** abre o seletor de pastas do sistema. A tela lembra a última pasta aberta.
- **Linha da branch**: depois de abrir, a tela mostra "Branch `sua-branch` contra" e uma lista com as branches do repositório para escolher a base.
- **incluir não commitado**: inclui na revisão o que você alterou e ainda não fez commit. Entre parênteses aparece quantos arquivos estão nessa situação.
- **Revisar**: começa a revisão.
- **Área da resposta**: a revisão aparece aos poucos, enquanto a IA escreve.

## Passo a passo: revisar a sua branch

1. Digite o caminho da pasta do repositório e clique em **Abrir**, ou clique em **Escolher** para selecionar a pasta.
2. Confira a branch base na lista. A tela já sugere a branch principal do remoto (`origin/HEAD`); se não achar, sugere `origin/main`, `origin/master`, `main`, `master`, `origin/develop` ou `develop`, nessa ordem.
3. Marque **incluir não commitado** se quiser que a IA veja também o que você ainda não commitou.
4. Clique em **Revisar**. A linha de progresso mostra quantos arquivos mudaram contra a base e avisa que a IA está lendo o código.
5. Espere a resposta. Cada problema vem com a gravidade (bloqueante, importante ou sugestão), o `arquivo:linha`, o que está errado, um cenário em que quebra e a correção, do mais grave para o menos grave.
6. No fim vem a seção **Para o MR**, um parágrafo do que a mudança faz. Clique em **Copiar** para levar o texto todo.

> **Dica:** se você corrigiu algo e quer revisar de novo, clique em **Refazer**. Para trocar de base ou de opção, ajuste e clique em **Revisar** outra vez.

### Parar uma revisão

1. Enquanto a IA trabalha, clique em **Parar**.
2. O que já chegou fica na tela.

## Bom saber

- A IA só lê. Ela não altera arquivos, não faz commit e não executa comandos.
- A comparação usa só o que a sua branch trouxe desde que saiu da base. O que entrou na base depois disso não aparece.
- A IA usa o provedor e o modelo escolhidos em [Configurações](/configuracoes).
- A revisão vem sempre em português.
- Um diff muito grande é cortado antes de ir para a IA; nesse caso a linha de progresso avisa "diff cortado" e a IA lê direto da pasta os arquivos que faltaram.
- A revisão tem um limite de 20 minutos.

## Problemas comuns

- **"a pasta não é um repositório git".** Escolha a pasta raiz do projeto, a que tem o `.git`.
- **"Não achei a branch padrão do remoto".** O repositório não tem `origin/HEAD` definido. Escolha a base à mão na lista.
- **"a branch base ... não existe neste repositório".** Se a base for remota, rode `git fetch` no repositório e abra a pasta de novo.
- **"nada para revisar".** A sua branch não tem diferença contra a base. Se as mudanças ainda não foram commitadas, marque **incluir não commitado**.
- **O botão Revisar não fica ativo.** Escolha uma branch base na lista.
