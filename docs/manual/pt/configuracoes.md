# Configurações

Escolhe qual programa de IA o painel chama e com qual modelo, e ajusta como o painel aparece para você: idioma, tema, cor de destaque, fundo e quais telas aparecem no menu.

## Quando usar

- É a sua primeira vez no painel e as telas de IA precisam saber qual programa chamar.
- Você instalou um programa de IA novo (por exemplo o Codex) e quer passar a usá-lo.
- Saiu um modelo novo e você quer usá-lo, ou as respostas estão lentas e você quer menos esforço.
- Você prefere o painel em inglês, ou em cores claras para uma tela compartilhada.
- O menu tem telas que você nunca usa e você quer deixá-lo mais curto.

## Antes de começar

- Pelo menos um programa de IA instalado no seu computador: `claude` (Claude Code), `codex` (OpenAI Codex) ou `agy` (Google Antigravity). A tela [Máquina](/maquina) diz quais estão faltando.

## Conhecendo a tela

Abra pelo item **Configurações**, no pé do menu. À esquerda ficam três seções; a que você clica abre à direita.

| Seção | O que tem | Onde fica salvo |
|---|---|---|
| **Provedor de IA** | O programa de IA, o modelo, o esforço e a política de sandbox. A etiqueta ao lado mostra o programa escolhido. | No seu computador (`~/.workstuff/settings.json`), depois de **Salvar alterações**. |
| **Aparência** | **Idioma**, **Tema**, **Cor de destaque** e **Fundo**. | O idioma no seu computador, na hora. Tema, cor e fundo neste navegador, na hora. |
| **Itens do menu** | Um interruptor por tela, para mostrar ou esconder no menu. A etiqueta mostra quantas estão ocultas. | Neste navegador, na hora. |

O botão no canto superior direito diz **Salvar alterações** quando há uma mudança não salva em **Provedor de IA**, e **Salvo** quando não há nada a salvar. Só a seção do provedor de IA precisa dele: o resto aplica sozinho.

## Passo a passo: escolher o provedor de IA

1. Clique em **Provedor de IA**.
2. Cada cartão é um programa que o painel conhece. Os instalados mostram **disponível**; os outros mostram **não detectado** e não podem ser clicados. Clique no que você quer.
3. Leia o aviso abaixo dos cartões:
   - O **Claude Code** tem **guarda nativa de comandos**: o próprio programa recusa comandos que alteram coisas.
   - O **OpenAI Codex** e o **Google Antigravity** mostram **sem guarda nativa: proteção reduzida**: a guarda do próprio painel é a única barreira.
4. Em **Modelo**, escolha um da lista. O marcado como **recomendado** é um começo seguro, e **sempre o mais novo** marca um apelido que acompanha sozinho a versão mais nova.
5. Em **Esforço**, escolha o quanto a IA deve pensar: mais esforço dá respostas mais cuidadosas e mais lentas.
6. Em **Política de Sandbox**, selecione o nível de isolamento das operações de escrita e verificação na [Fábrica](/fabrica):
   - **Estrito (Isolado)**: exige isolamento a nível de kernel (`bwrap` no Linux ou `sandbox-exec` no macOS). Se nenhum sandbox for detectado, operações de escrita são bloqueadas por segurança.
   - **Relaxado (Sem trava)**: permite que agentes de IA e testes rodem diretamente na máquina caso nenhum sandbox do kernel esteja disponível.
7. Clique em **Salvar alterações**. A mensagem **Configurações salvas** confirma.

> **Dica:** a lista de modelos vem do próprio programa instalado, não do painel. Se faltar um modelo que você conhece, clique em **Atualizar lista** para ler de novo.

### Usar um modelo que não está na lista

1. Abaixo da lista, digite o nome exato do modelo em **Outro id de modelo:** (por exemplo `claude-opus-5-5`).
2. Clique em **Salvar alterações**.

Use isso para um modelo que o programa aceita mas que ainda não aparece na lista.

### Trocar o idioma

1. Clique em **Aparência**.
2. Em **Idioma**, clique em **English** ou **Português**.
3. A página recarrega no novo idioma. As mensagens do servidor do painel também mudam.

> **Dica:** o seletor **EN | PT** na barra do topo faz o mesmo, de qualquer tela.

> **Atenção:** a recarga descarta as mudanças não salvas em **Provedor de IA**. Clique em **Salvar alterações** antes.

### Trocar o tema

1. Clique em **Aparência**.
2. Em **Tema**, clique em **Escuro** (o padrão do painel), **Claro** (para tela compartilhada e ambiente iluminado) ou **Automático** (segue o sistema operacional).

Aplica na hora. O ícone de sol ou de lua no topo de todas as telas também alterna entre claro e escuro.

### Trocar a cor de destaque

1. Clique em **Aparência**.
2. Em **Cor de destaque**, clique numa das cores, ou em **Outra** para escolher qualquer cor.
3. Veja a **Prévia** logo abaixo: ela mostra o botão principal, um filtro ligado e uma barra de progresso na cor nova.

A cor de destaque marca a ação principal, o item ativo e os filtros ligados. O painel ajusta a cor sozinho para ela continuar legível nos dois temas.

### Trocar o fundo

1. Clique em **Aparência**.
2. Em **Fundo**, clique em **Escolher imagem** e escolha uma imagem do seu computador. Ela preenche o fundo do painel, por trás dos cards e do menu.
3. Em **Cor base**, escolha a cor que fica por trás da imagem. **Usar a do tema** volta para o fundo do próprio tema.
4. Arraste **Transparência** para esmaecer a imagem: com 0% a imagem aparece inteira, com 100% só a cor base aparece.
5. Em **Ajuste**, escolha como a imagem ocupa a tela: **Cobrir a tela** preenche tudo e corta o que sobra, **Caber inteira** mostra a imagem toda com a cor base em volta, **Tamanho original** não redimensiona. Em **Posição**, escolha que parte fica à vista, como **Topo ao centro** para manter o alto da foto quando ela é cortada.

Para voltar a um fundo liso, clique em **Remover imagem**. Sem imagem, o fundo é só a cor base.

### Esconder telas do menu

1. Clique em **Itens do menu**. As telas aparecem agrupadas como no menu.
2. Desligue o interruptor de cada tela que você não usa. Ela sai do menu na hora.
3. Para trazer todas de volta, clique em **Mostrar todas**.

## Bom saber

- Todo provedor de IA roda em modo leitura sobre o seu código e os seus clusters. Na [Fábrica](/fabrica), operações de escrita e verificação de testes rodam isoladas pelo sandbox do kernel (`bwrap` no Linux ou `sandbox-exec` no macOS), ou sem trava quando a política de sandbox estiver em modo relaxado. Com o `bwrap`, qualquer provedor só enxerga a pasta da execução, nunca o resto da sua pasta pessoal; com o `sandbox-exec` do macOS, ele deixa de ver as pastas de credenciais (`~/.ssh`, `~/.kube`, `~/.config`, `~/.workstuff`...), mas o resto da pasta pessoal continua visível. A revisão de MR remoto só roda com o `bwrap`.
- A escolha feita aqui é usada pelas telas que chamam a IA, como o Cluster Doctor, a [Análise](/analise) e a revisão de itens do [Catálogo](/catalogo). A [Fábrica](/fabrica) pode escolher um modelo por agente em cada tarefa.
- Uma tela escondida continua abrindo pelo endereço e continua aparecendo na busca do **Ctrl+K**.
- Tema, cor de destaque, fundo e telas escondidas ficam salvos neste navegador: outro navegador ou computador começa com o padrão. Provedor, modelo, esforço e idioma ficam salvos no seu computador e valem para qualquer navegador.

## Problemas comuns

- **Nenhum CLI de IA detectado no PATH.** Nenhum programa de IA foi encontrado. Instale `claude`, `codex` ou `agy` (a tela [Máquina](/maquina) mostra como) e abra as Configurações de novo.
- **O modelo salvo não está na lista atual.** O modelo pode estar desatualizado ou ter sido descontinuado. Clique no botão **Usar** que aparece no aviso para trocar pelo modelo sugerido e depois em **Salvar alterações**.
- **O programa não devolveu nenhum modelo.** Clique em **Atualizar lista**. Se a leitura falhar, uma caixa vermelha mostra o comando que falhou e o erro; a lista abaixo dela, se houver, é a da última leitura que deu certo.
- **Não salvou: id de modelo inválido.** O nome digitado em **Outro id de modelo:** tem um caractere que o painel não aceita. Use só letras, números e `. _ : / -`.
- **A cor de destaque vermelha, laranja ou amarela parece um alerta.** Essas cores ficam parecidas com os sinais de erro e de atenção. Escolha outra se você depende dos alertas para bater o olho.
