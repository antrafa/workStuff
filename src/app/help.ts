// Ajuda de cada tela, aberta pelo botão "Ajuda" do cabeçalho. Indexada pela rota, como o menu (nav.ts):
// tela nova no menu sem entrada aqui quebra o autoteste (scripts/check-help.ts).

export type Help = {
  // Para que serve: o problema que a tela resolve, em uma ou duas frases.
  purpose: string
  // Como usar: o caminho principal, na ordem.
  steps: string[]
  // Bom saber: limites, travas e o que a tela não faz.
  notes: string[]
}

export const HELP: Record<string, Help> = {
  '/': {
    purpose: 'Painel central de controle do desenvolvedor: reúne a saúde do cluster Kubernetes, execuções ativas da Fábrica de Software, diagnósticos da máquina e atalhos rápidos para fluxos operacionais.',
    steps: [
      'Acompanhe os cartões de status no topo para conferir a saúde do cluster, pods com problema, tarefas ativas e pendências da máquina.',
      'Veja as execuções recentes da Fábrica de Software e clique para abrir a linha do tempo ou criar uma nova demanda.',
      'Use os atalhos rápidos para navegar direto para runbooks, revisões de código, catálogo de IA e conversores.',
      'Clique em Atualizar a qualquer momento para ler novamente os indicadores de todos os subsistemas.',
    ],
    notes: [
      'O painel sincroniza automaticamente em segundo plano a cada 10 segundos.',
      'Você pode voltar a esta tela inicial a qualquer momento clicando no logotipo workStuff no topo da barra lateral.',
    ],
  },
  '/maquina': {
    purpose: 'Mostra o que falta nesta máquina para trabalhar (ferramentas, versões, credenciais, rede) e como resolver cada item, com o comando certo para o seu sistema: Linux, macOS ou Windows.',
    steps: [
      'Abra a tela: a verificação roda sozinha e lista as pendências primeiro.',
      'Leia cada item: "falta" impede o trabalho, "aviso" funciona com limitação.',
      'Copie o comando sugerido e rode no seu terminal, ou clique em "Executar" quando o item permitir.',
      'Em "Personalizar verificações", cadastre o que é do seu time: registries Maven, escopos npm, endereços internos e versões de Java e Node.',
      'Clique em "Verificar de novo" depois de instalar.',
    ],
    notes: [
      'A verificação só lê; nada é instalado sem você clicar.',
      'O painel só corrige sozinho o que instala na sua home sem sudo (SDKMAN, NVM, npm install). O resto você copia e roda.',
    ],
  },
  '/perfil': {
    purpose: 'Leva a sua configuração para outra pessoa ou outra máquina: versões e registries do Máquina, conexões de repositório e o que está ativo no Catálogo. Quem chega no time importa o arquivo e já vê o que falta.',
    steps: [
      'Para compartilhar, clique em "Baixar perfil" e envie o arquivo JSON.',
      'Para receber, clique em "Escolher arquivo" e selecione o perfil.',
      'Confira o que muda em cada parte e desmarque o que não quiser.',
      'Clique em "Importar o selecionado".',
      'Ative à mão, na tela Catálogo, os itens listados no fim.',
    ],
    notes: [
      'Token nunca vai no arquivo: as conexões chegam "sem token", e você configura o token na tela Repositórios.',
      'O arquivo importado é validado como o que você digitaria nas telas: valor estranho é recusado.',
      'Importar de novo não duplica conexões nem pastas.',
    ],
  },
  '/repositorios': {
    purpose: 'Navega nos grupos e projetos do GitLab ou do GitHub e clona um projeto ou um grupo inteiro, mantendo a hierarquia de pastas no seu workspace.',
    steps: [
      'Clique em "Nova conexão" e escolha GitLab ou GitHub.',
      'Informe o endereço, a origem do token (digitado, variável de ambiente ou login do gh) e teste a conexão.',
      'Escolha o grupo base e a pasta do workspace onde os clones vão morar.',
      'Navegue pelos grupos e clique em "Clonar" num projeto ou num grupo.',
    ],
    notes: [
      'O que já está clonado é pulado; nada é sobrescrito.',
      'O token digitado fica num arquivo só seu (permissão 600) e nunca aparece na tela.',
      'Estas conexões também servem às telas Pipelines, Requests & Limits e Perfil de equipe.',
    ],
  },
  '/pipelines': {
    purpose: 'Mostra a última pipeline de cada projeto que você acompanha (GitLab CI ou GitHub Actions) e, quando um job falha, a IA lê o log e explica a causa.',
    steps: [
      'Clique em "Acompanhar projeto", escolha a conexão e informe o caminho do projeto (ex.: grupo/projeto).',
      'Clique na linha do projeto para ver as pipelines recentes e os jobs.',
      'Num job que falhou, clique em "Explicar falha".',
      'Use o ícone de documento para ler o log inteiro.',
    ],
    notes: [
      'A lista atualiza sozinha a cada 30 s enquanto a aba está aberta.',
      'Com o projeto clonado no workspace, a IA também lê o código para confirmar a causa.',
      'A IA só lê: nenhuma pipeline é disparada ou cancelada.',
    ],
  },
  '/revisao': {
    purpose: 'Revisa o que a sua branch traz antes de abrir o merge request: a IA lê o diff e o código em volta e aponta os problemas por severidade, com arquivo e linha.',
    steps: [
      'Escolha a pasta do repositório e clique em "Abrir".',
      'Confira a branch base (por padrão, a branch principal do remoto).',
      'Marque "incluir não commitado" se quiser revisar também o que ainda não foi para commit.',
      'Clique em "Revisar" e espere: a IA lê o código antes de responder.',
    ],
    notes: [
      'Rode git fetch antes, para comparar com a versão mais recente da base.',
      'No fim vem um parágrafo pronto para a descrição do MR.',
      'A IA não altera nenhum arquivo.',
    ],
  },
  '/vulnerabilidades': {
    purpose: 'Lista as falhas de segurança conhecidas e as versões desatualizadas nas dependências de um projeto (package.json e pom.xml), pela base pública OSV.',
    steps: [
      'Escolha a pasta do projeto e clique em "Verificar".',
      'Veja o resumo por severidade no topo.',
      'Clique numa dependência com falha para ver cada falha, o CVE e a versão que corrige.',
      'Use o filtro "Desatualizadas" para ver o que está uma ou mais versões major atrás.',
    ],
    notes: [
      'A versão exata vem do package-lock.json; sem lockfile, um range como ">=1" não é consultado.',
      'Com o trivy instalado, a tela também varre as dependências transitivas e imagens de container.',
      'Os projetos verificados ficam em "Recentes", para reabrir sem refazer a consulta.',
    ],
  },
  '/cluster': {
    purpose: 'Mostra os pods, nodes e problemas do cluster conectado, com logs ao vivo e diagnóstico pela IA. A aba Cluster Doctor é um chat em que a IA investiga o cluster por você.',
    steps: [
      'Escolha o kubeconfig e o contexto na barra do topo.',
      'Em "Visão geral", os pods que precisam de atenção vêm primeiro; os saudáveis ficam recolhidos.',
      'Clique num pod para abrir os logs ao vivo na própria linha e, se quiser, pedir ao agente de IA que investigue.',
      '"Descrever" mostra labels, imagem, ConfigMaps e eventos; "Reiniciar…" mostra o comando antes de rodar.',
      'Em "Problemas", veja só o que está falhando e peça o diagnóstico da IA.',
      'No "Cluster Doctor", descreva o problema; a IA roda comandos de leitura e propõe a correção.',
    ],
    notes: [
      'Cada kubeconfig é classificado como DES, ITG, HML ou PRO. PRO é somente leitura, e sem classificação vale como PRO.',
      'A moldura da tela mostra o ambiente: fina em DES, tracejada em ITG, grossa em HML e hachurada em PRO.',
      'Toda escrita (restart, edit, delete) mostra o comando exato e só roda depois que você confirma.',
      'Secrets nunca são lidos.',
    ],
  },
  '/recursos': {
    purpose: 'Mostra a memória, a CPU e as flags de JVM declaradas nos manifests de um grupo do GitLab e compara com o uso real dos pods, sugerindo ajuste.',
    steps: [
      'Escolha a conexão e o grupo do GitLab (cada subgrupo vira um cliente, cada projeto uma stack).',
      'Escolha o cliente e a stack na lista.',
      'Para comparar com o uso real, vincule a stack a um kubeconfig, contexto e namespace.',
    ],
    notes: [
      'Os manifests são lidos pela API do GitLab, sem clonar.',
      'A recomendação depende do uso ao vivo: com o pod parado ou recém-iniciado, ela é pouco confiável.',
    ],
  },
  '/logs': {
    purpose: 'Acompanha os logs de todos os pods de uma ou mais aplicações ao mesmo tempo, intercalados e com uma cor por pod.',
    steps: [
      'Informe o namespace e clique em "Listar aplicações".',
      'Clique em uma ou mais aplicações; o seletor é montado sozinho.',
      'Escolha o período e clique em "Acompanhar".',
      'Use o filtro para achar um texto e "Pausar" para ler com calma.',
    ],
    notes: [
      'Só dá para combinar aplicações da mesma label; outra label recomeça a seleção.',
      'A tela guarda as 5.000 linhas mais recentes.',
      'Sem container informado, cada pod mostra o container principal, sem o sidecar do Istio.',
    ],
  },
  '/incidente': {
    purpose: 'Junta numa linha do tempo os eventos, restarts, rollouts e linhas de erro de log de um namespace, para reconstruir um incidente, e pede à IA o rascunho do post-mortem.',
    steps: [
      'Informe o namespace e a janela de tempo.',
      'Opcional: informe parte do nome do que caiu, para focar.',
      'Clique em "Montar linha do tempo" e filtre por severidade.',
      'Clique em "Rascunhar post-mortem" e revise o texto antes de usar.',
    ],
    notes: [
      'O cluster guarda eventos por pouco tempo (em geral 1 h); eventos mais antigos já sumiram.',
      'O log de erro vem do container anterior dos pods que reiniciaram (até seis pods).',
      'A IA escreve só com o que está na linha do tempo e diz o que é hipótese.',
    ],
  },
  '/comparar': {
    purpose: 'Mostra o que difere entre dois ambientes (ex.: HML e PRO): imagem, réplicas, recursos, variáveis e probes de cada Deployment, StatefulSet e CronJob.',
    steps: [
      'Escolha o kubeconfig, o contexto e o namespace do lado A.',
      'Faça o mesmo no lado B (pode ser outro cluster).',
      'Clique em "Comparar".',
      'Clique num workload diferente para ver campo a campo.',
    ],
    notes: [
      'Secret nunca é lido; variável que vem de Secret aparece como referência.',
      'Variável com nome de senha, token ou chave, ou com senha dentro de uma URL, aparece mascarada. Valores iguais têm a mesma marca, então dá para ver se diferem.',
      'Tipo que o RBAC não deixa ler fica de fora, com aviso.',
    ],
  },
  '/upgrade': {
    purpose: 'Mostra o que quebra ao atualizar o Kubernetes: APIs removidas na versão de destino, certificados TLS perto de vencer e credenciais de kubeconfig expirando.',
    steps: [
      'Em "APIs removidas", informe a versão de destino (ou deixe a próxima) e clique em "Verificar cluster".',
      'No mesmo lugar, verifique os manifests de um repositório.',
      'Em "Certificados TLS", veja o vencimento de cada host dos Ingresses e VirtualServices.',
      'Em "Kubeconfigs", veja o vencimento do certificado de cliente de cada arquivo.',
    ],
    notes: [
      'Objeto criado por Helm ou operador não guarda a versão aplicada: confira os manifests do repositório.',
      'O certificado é lido pela conexão TLS, sem ler Secret. Host interno precisa da VPN.',
    ],
  },
  '/runbooks': {
    purpose: 'Executa procedimentos escritos em Markdown: cada linha de um bloco bash com kubectl vira um passo que roda pelo painel, com as travas do Cluster Doctor.',
    steps: [
      'Escolha a pasta onde ficam os runbooks (.md).',
      'Clique num runbook e preencha as variáveis ({{namespace}}, {{app}}…).',
      'Clique em "Rodar" nos passos de leitura.',
      'Nos passos de escrita, confira o comando no popup e confirme.',
    ],
    notes: [
      'Só kubectl roda, uma chamada por linha, sem shell e sem trocar de cluster.',
      'PRO nunca escreve, e DES nunca apaga. O passo bloqueado mostra o motivo.',
      'Cada execução fica registrada em ~/.workstuff/runbook-audit.log.',
    ],
  },
  '/performance': {
    purpose: 'Acompanha CPU, memória, restarts e throttling de até 20 pods ao longo do tempo e gera um relatório com a IA.',
    steps: [
      'Crie uma observação: escolha os pods e o intervalo de coleta (mínimo 15 s).',
      'Deixe a coleta rodar pelo tempo que quiser observar.',
      'Abra a observação para ver os gráficos.',
      'Gere o relatório da IA com o histórico coletado.',
    ],
    notes: [
      'A coleta continua sozinha depois de reiniciar o servidor.',
      'Com o Prometheus do Rancher ou as métricas do Istio no cluster, a tela usa esses dados também.',
    ],
  },
  '/conversores': {
    purpose: 'Conversões do dia a dia, feitas no navegador: JWT, Base64, URL, timestamp, UUID, cron, JSON e YAML, diff de texto, regex e hash.',
    steps: [
      'Cole o conteúdo no cartão da ferramenta.',
      'Escolha a direção quando houver (codificar ou decodificar, formatar ou converter).',
      'Copie o resultado com o botão ao lado.',
    ],
    notes: [
      'Nada do que você cola sai da máquina: tudo roda no navegador.',
      'O JWT é só decodificado; a assinatura não é verificada.',
      'No JSON inválido, a tela mostra a linha e a coluna do erro.',
    ],
  },
  '/servicos': {
    purpose: 'Mostra o que está rodando nesta máquina: portas em escuta com o processo dono, e containers, imagens, volumes e projetos compose do Docker. Daqui dá para liberar uma porta encerrando o processo e limpar o que o Docker acumulou.',
    steps: [
      'Filtre as portas por número, processo ou PID para achar quem ocupa uma porta.',
      'Para liberar a porta, clique em "Encerrar" e confirme o comando; marque "Forçar" só se o encerramento normal não resolver.',
      'No Docker, use as abas Containers, Imagens, Volumes e Compose.',
      'Inicie, pare ou reinicie containers e projetos compose; apague containers parados, imagens e volumes que não estão em uso.',
    ],
    notes: [
      'O comando mostrado na confirmação é o do seu sistema: kill no Linux e no macOS, taskkill no Windows.',
      'O servidor deste painel aparece marcado como "este painel" e não pode ser encerrado por aqui.',
      'Apagar volume apaga os dados dele para sempre. Imagem ou volume em uso por algum container é recusado pelo próprio Docker.',
      'A marca "rede" indica porta aberta para outras máquinas, e não só para esta.',
      'O processo aparece sem os argumentos, que podem ter senha. "Outro usuário" é processo do sistema ou de root, que o seu usuário não consegue encerrar.',
    ],
  },
  '/agenda': {
    purpose: 'Confere de tempos em tempos o que você cadastrar (pipeline quebrada, certificado vencendo, pods com problema, falha crítica nas dependências) e avisa por notificação do sistema quando o estado muda.',
    steps: [
      'Clique em "Nova verificação" e escolha o que conferir.',
      'Preencha o alvo e o intervalo. A verificação roda uma vez na hora, para você ver se funciona.',
      'Use pausar, rodar agora e apagar na linha de cada verificação.',
    ],
    notes: [
      'Só roda enquanto o servidor do painel está no ar.',
      'O aviso sai só na mudança de estado: um problema contínuo avisa uma vez, e a volta ao normal avisa de novo.',
      'No Windows o aviso fica só no histórico da tela.',
    ],
  },
  '/gerador': {
    purpose: 'Gera dados brasileiros de teste: pessoa, CPF, CNPJ (inclusive o alfanumérico), nome, endereço e empresa.',
    steps: [
      'Escolha o tipo de dado e, se quiser, o estado (UF).',
      'Gere e copie o resultado.',
    ],
    notes: [
      'Os documentos são válidos pelo dígito verificador, mas fictícios: use só em teste.',
      'Tudo é gerado no navegador.',
    ],
  },
  '/fabrica': {
    purpose: 'Orquestra o ciclo de desenvolvimento com sete agentes de IA (Analyst, Architect, Implementer, Tester, Reviewer, Security e Documenter) em Git Worktrees isoladas, com portões verificados por código e aprovação humana antes de qualquer envio.',
    steps: [
      'Clique em "Nova Tarefa", importe uma issue do GitLab ou GitHub ou digite uma tarefa manual. Se quiser, informe o comando de verificação (ex.: npm run typecheck && npm test).',
      'O Analyst escreve os critérios de aceite. Se houver dúvida de negócio, a tarefa para em "aguardando respostas" até você responder.',
      'O Architect gera o plano. Revise, edite se quiser e clique em "Aprovar e Construir".',
      'O Implementer codifica na worktree. Se um portão reprovar (sem alteração, arquivo declarado ausente, verificação falhando), ele recebe a falha e corrige, até 3 tentativas.',
      'O Tester cobre os cenários; Reviewer e Security revisam em paralelo. Achado grave ou critério não atendido volta para o Implementer automaticamente, até 2 rodadas.',
      'O Documenter atualiza a documentação afetada e escreve a descrição do MR. Na revisão, peça ajustes (inclusive a partir de um achado) e aprove para abrir o MR/PR ou mesclar localmente.',
    ],
    notes: [
      'Toda alteração de código ocorre em ~/.workstuff/worktrees; o seu repositório principal fica intocado.',
      'O comando de verificação roda dentro do bwrap: executa código escrito pelo agente, então só a worktree e os caches de build são graváveis. Sem bwrap, a verificação não roda e o QA aparece como reprovado.',
      'O veredito da revisão é calculado em código: bloqueia achado high ou critical com confiança 75 ou mais, e critério de aceite não atendido.',
      'O custo e os tokens aparecem quando o provedor os informa (Claude e Codex).',
      'Teto de custo: conferido antes de cada agente, somando todas as execuções da tarefa. Ao atingir, a tarefa para com erro; aumente o teto na própria tarefa e tente de novo. Uma execução pode passar um pouco do teto, porque o custo só chega quando ela termina.',
      'Modelo por agente: em "Nova Tarefa", escolha um modelo forte para especificar, planejar e revisar e um mais barato para construir, testar e documentar.',
      'Você também pode acionar qualquer um dos agentes de forma independente na aba de Agentes Especializados, sempre em modo leitura.',
    ],
  },
  '/dev-runbooks': {
    purpose: 'Executa procedimentos e rotinas locais de desenvolvimento: comandos de Git, Docker e Node executáveis pelo painel com confirmação.',
    steps: [
      'Escolha um runbook na barra lateral (ou aponte para sua própria pasta de runbooks locais).',
      'Preencha as variáveis como projeto, branch ou container se necessário.',
      'Clique em "Rodar" nos passos de leitura.',
      'Nos passos com modificação (escrita), confira o comando e confirme a execução.',
    ],
    notes: [
      'Apenas ferramentas de desenvolvimento homologadas podem ser executadas (git, docker, npm, etc.).',
      'Comandos de escrita mostram o comando exato e o diretório antes de rodar.',
      'Cada execução fica registrada em ~/.workstuff/dev-runbook-audit.log.',
    ],
  },
  '/catalogo': {
    purpose: 'Reúne as skills, prompts, rules, personas e templates das suas pastas e ativa cada um nos agentes de IA (Claude Code, Codex, Gemini, OpenCode).',
    steps: [
      'Cadastre as pastas onde os itens ficam.',
      'Encontre o item pela busca ou pelo filtro de tipo.',
      'Ligue o item no agente desejado, ou marque vários na lista e ative todos de uma vez num agente.',
      'Use "Revisão com IA" para a IA avaliar o item, ou busque skills prontas no skills.sh.',
    ],
    notes: [
      'A skill vira um link na pasta de skills do agente. Rule e persona entram num bloco marcado do arquivo de instruções.',
      'O que o painel não criou nunca é alterado.',
    ],
  },
  '/analise': {
    purpose: 'Gera um relatório completo da arquitetura de um projeto pela IA, e permite conversar sobre ele e salvá-lo no próprio projeto.',
    steps: [
      'Escolha a pasta do projeto.',
      'Gere o relatório e espere: a IA lê o código antes de escrever.',
      'Use o chat para tirar dúvidas sobre o relatório.',
      'Salve o relatório em docs/arquitetura do projeto, se quiser.',
    ],
    notes: [
      'Se o commit do projeto não mudou, a tela mostra o relatório anterior sem gastar de novo.',
      'Com um graphify-out/graph.html no projeto, a aba de grafo mostra a visualização.',
    ],
  },
  '/playbooks': {
    purpose: 'Executa procedimentos e receitas guiadas de engenharia com a IA: cada bloco prompt vira um passo executado pelo modelo com streaming.',
    steps: [
      'Escolha um playbook na barra lateral (ou aponte para sua própria pasta).',
      'Preencha as variáveis solicitadas (ex.: projeto, tarefa, contexto).',
      'Clique em "Executar com IA" em cada passo ou "Executar todos".',
      'Acompanhe o streaming da resposta e copie o resultado gerado.',
    ],
    notes: [
      'Usa o provedor e modelo configurados na tela Configurações.',
      'A variável {{passo_anterior}} injeta automaticamente a resposta do passo anterior.',
      'A IA roda em modo leitura sem alterar arquivos diretamente.',
    ],
  },
  '/configuracoes': {
    purpose: 'Escolhe o provedor de IA usado em todo o painel e ajusta a aparência e os itens do menu.',
    steps: [
      'Em "Provedor de IA", escolha o CLI (Claude, Codex ou Antigravity), o modelo e o esforço.',
      'Em "Aparência", escolha o tema e a cor de destaque.',
      'Em "Itens do menu", esconda as telas que você não usa.',
    ],
    notes: [
      'Todo provedor roda em modo leitura. O Antigravity só funciona no Linux, dentro do bubblewrap.',
      'Tema e menu ficam salvos neste navegador.',
    ],
  },
}

// Acha a ajuda da tela atual pelo prefixo mais longo (ex.: /cluster/doctor usa a do /cluster).
export function helpFor(pathname: string): Help | null {
  const key = Object.keys(HELP).filter(k => pathname === k || pathname.startsWith(k + '/')).sort((a, b) => b.length - a.length)[0]
  return key ? HELP[key] : null
}
