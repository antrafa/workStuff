// Help for each screen, opened by the header's "Help" button. Keyed by route, like the menu (nav.ts):
// a new menu screen without an entry here fails the selfcheck (scripts/check-help.ts).
import type { Pair } from '../../server/lib/lang.ts'
import { tx } from '../lib/i18n.ts'

export type Help = {
  // What it is for: the problem the screen solves, in one or two sentences.
  purpose: string
  // How to use it: the main path, in order.
  steps: string[]
  // Good to know: limits, guards and what the screen does not do.
  notes: string[]
}

export const HELP: Record<string, Pair<Help>> = {
  '/': {
    en: {
      purpose: 'The developer\'s control panel: Kubernetes cluster health, active Software Factory runs, machine diagnostics and shortcuts to everyday workflows.',
      steps: [
        'Check the status cards at the top for cluster health, failing pods, active tasks and machine issues.',
        'See the latest Software Factory runs and click one to open its timeline, or start a new request.',
        'Use the shortcuts to jump straight to runbooks, code reviews, the AI catalog and converters.',
        'Click Refresh at any time to read every subsystem\'s indicators again.',
      ],
      notes: [
        'The panel syncs in the background every 10 seconds.',
        'Click the workStuff logo at the top of the sidebar to come back here at any time.',
      ],
    },
    pt: {
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
  },
  '/maquina': {
    en: {
      purpose: 'Shows what this machine is missing for work (tools, versions, credentials, network) and how to fix each item, with the right command for your system: Linux, macOS or Windows.',
      steps: [
        'Open the screen: the check runs on its own and lists the issues first.',
        'Read each item: "missing" blocks work, "warning" works with limits.',
        'Copy the suggested command and run it in your terminal, or click "Run" when the item allows it.',
        'Under "Customize checks", add what belongs to your team: Maven registries, npm scopes, internal addresses and Java and Node versions.',
        'Click "Check again" after installing.',
      ],
      notes: [
        'The check only reads; nothing is installed until you click.',
        'The panel only fixes on its own what installs in your home without sudo (SDKMAN, NVM, npm install). The rest you copy and run.',
      ],
    },
    pt: {
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
  },
  '/perfil': {
    en: {
      purpose: 'Takes your setup to another person or machine: the Machine screen\'s versions and registries, repository connections and what is active in the Catalog. A newcomer imports the file and sees right away what is missing.',
      steps: [
        'To share, click "Download profile" and send the JSON file.',
        'To receive, click "Choose file" and select the profile.',
        'Check what changes in each part and uncheck what you do not want.',
        'Click "Import selected".',
        'Turn on by hand, in the Catalog screen, the items listed at the end.',
      ],
      notes: [
        'A token never goes into the file: connections arrive "without token", and you set the token in the Repositories screen.',
        'The imported file is validated as if you had typed it in the screens: an odd value is refused.',
        'Importing again does not duplicate connections or folders.',
      ],
    },
    pt: {
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
  },
  '/repositorios': {
    en: {
      purpose: 'Browses GitLab or GitHub groups and projects and clones a project or a whole group, keeping the folder hierarchy in your workspace.',
      steps: [
        'Click "New connection" and choose GitLab or GitHub.',
        'Enter the address and where the token comes from (typed, environment variable or gh login), then test the connection.',
        'Choose the base group and the workspace folder where the clones will live.',
        'Browse the groups and click "Clone" on a project or a group.',
      ],
      notes: [
        'What is already cloned is skipped; nothing is overwritten.',
        'A typed token stays in a file only you can read (mode 600) and never shows on screen.',
        'These connections also serve the Pipelines, Requests & Limits and Team profile screens.',
      ],
    },
    pt: {
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
  },
  '/pipelines': {
    en: {
      purpose: 'Shows the latest pipeline of each project you follow (GitLab CI or GitHub Actions) and, when a job fails, the AI reads the log and explains the cause.',
      steps: [
        'Click "Follow project", choose the connection and enter the project path (e.g. group/project).',
        'Click the project row to see recent pipelines and their jobs.',
        'On a failed job, click "Explain failure".',
        'Use the document icon to read the whole log.',
      ],
      notes: [
        'The list refreshes every 30 s while the tab is open.',
        'With the project cloned in the workspace, the AI also reads the code to confirm the cause.',
        'The AI only reads: no pipeline is started or cancelled.',
      ],
    },
    pt: {
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
  },
  '/revisao': {
    en: {
      purpose: 'Reviews what your branch brings before you open the merge request: the AI reads the diff and the surrounding code and points out problems by severity, with file and line.',
      steps: [
        'Choose the repository folder and click "Open".',
        'Check the base branch (by default, the remote\'s main branch).',
        'Tick "include uncommitted" to also review what is not committed yet.',
        'Click "Review" and wait: the AI reads the code before answering.',
      ],
      notes: [
        'Run git fetch first, to compare with the latest version of the base.',
        'At the end comes a paragraph ready for the MR description.',
        'The AI does not change any file.',
      ],
    },
    pt: {
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
  },
  '/vulnerabilidades': {
    en: {
      purpose: 'Lists known security flaws and outdated versions in a project\'s dependencies (package.json and pom.xml), from the public OSV database.',
      steps: [
        'Choose the project folder and click "Check".',
        'See the summary by severity at the top.',
        'Click a dependency with flaws to see each flaw, its CVE and the version that fixes it.',
        'Use the "Outdated" filter to see what is one or more major versions behind.',
      ],
      notes: [
        'The exact version comes from package-lock.json; without a lockfile, a range like ">=1" is not looked up.',
        'With trivy installed, the screen also scans transitive dependencies and container images.',
        'Checked projects stay under "Recent", to reopen without querying again.',
      ],
    },
    pt: {
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
  },
  '/cluster': {
    en: {
      purpose: 'Shows the pods, nodes and problems of the connected cluster, with live logs and AI diagnosis. The Cluster Doctor tab is a chat where the AI investigates the cluster for you.',
      steps: [
        'Choose the kubeconfig and the context in the top bar.',
        'In "Overview", pods that need attention come first; healthy ones stay collapsed.',
        'Click a pod to open its live logs in the row itself and, if you want, ask the AI agent to investigate.',
        '"Describe" shows labels, image, ConfigMaps and events; "Restart…" shows the command before running it.',
        'In "Problems", see only what is failing and ask the AI for a diagnosis.',
        'In "Cluster Doctor", describe the problem; the AI runs read commands and proposes the fix.',
      ],
      notes: [
        'Each kubeconfig is classified as DES, ITG, HML or PRO. PRO is read-only, and an unclassified one counts as PRO.',
        'The screen frame shows the environment: thin in DES, dashed in ITG, thick in HML and hatched in PRO.',
        'Every write (restart, edit, delete) shows the exact command and only runs after you confirm.',
        'Secrets are never read.',
      ],
    },
    pt: {
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
  },
  '/recursos': {
    en: {
      purpose: 'Shows the memory, CPU and JVM flags declared in the manifests of a GitLab group and compares them with the pods\' real usage, suggesting adjustments.',
      steps: [
        'Choose the GitLab connection and group (each subgroup becomes a client, each project a stack).',
        'Choose the client and the stack in the list.',
        'To compare with real usage, link the stack to a kubeconfig, context and namespace.',
      ],
      notes: [
        'The manifests are read through the GitLab API, without cloning.',
        'The recommendation depends on live usage: with the pod stopped or just started, it is not reliable.',
      ],
    },
    pt: {
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
  },
  '/logs': {
    en: {
      purpose: 'Follows the logs of every pod of one or more applications at once, interleaved and with one color per pod.',
      steps: [
        'Enter the namespace and click "List applications".',
        'Click one or more applications; the selector is built for you.',
        'Choose the period and click "Follow".',
        'Use the filter to find a text and "Pause" to read calmly.',
      ],
      notes: [
        'Only applications with the same label can be combined; another label restarts the selection.',
        'The screen keeps the 5,000 most recent lines.',
        'Without a container given, each pod shows its main container, without the Istio sidecar.',
      ],
    },
    pt: {
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
  },
  '/incidente': {
    en: {
      purpose: 'Puts a namespace\'s events, restarts, rollouts and log error lines on one timeline, to rebuild an incident, and asks the AI for a post-mortem draft.',
      steps: [
        'Enter the namespace and the time window.',
        'Optional: enter part of the name of what went down, to focus.',
        'Click "Build timeline" and filter by severity.',
        'Click "Draft post-mortem" and review the text before using it.',
      ],
      notes: [
        'The cluster keeps events for a short time (usually 1 h); older events are already gone.',
        'The error log comes from the previous container of the pods that restarted (up to six pods).',
        'The AI writes only from what is on the timeline and says what is a hypothesis.',
      ],
    },
    pt: {
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
  },
  '/comparar': {
    en: {
      purpose: 'Shows what differs between two environments (e.g. HML and PRO): image, replicas, resources, variables and probes of each Deployment, StatefulSet and CronJob.',
      steps: [
        'Choose the kubeconfig, context and namespace of side A.',
        'Do the same for side B (it can be another cluster).',
        'Click "Compare".',
        'Click a workload that differs to see it field by field.',
      ],
      notes: [
        'A Secret is never read; a variable that comes from a Secret shows as a reference.',
        'A variable named like a password, token or key, or with a password inside a URL, is masked. Equal values get the same mark, so you can still see whether they differ.',
        'A kind that RBAC does not let you read is left out, with a warning.',
      ],
    },
    pt: {
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
  },
  '/upgrade': {
    en: {
      purpose: 'Shows what breaks when you upgrade Kubernetes: APIs removed in the target version, TLS certificates close to expiring and kubeconfig credentials expiring.',
      steps: [
        'In "Removed APIs", enter the target version (or leave the next one) and click "Check cluster".',
        'In the same place, check the manifests of a repository.',
        'In "TLS certificates", see when each Ingress and VirtualService host expires.',
        'In "Kubeconfigs", see when each file\'s client certificate expires.',
      ],
      notes: [
        'An object created by Helm or an operator does not keep the applied version: check the repository\'s manifests.',
        'The certificate is read over the TLS connection, without reading a Secret. An internal host needs the VPN.',
      ],
    },
    pt: {
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
  },
  '/runbooks': {
    en: {
      purpose: 'Runs procedures written in Markdown: each line of a bash block with kubectl becomes a step that runs through the panel, with the Cluster Doctor\'s guards.',
      steps: [
        'Choose the folder where the runbooks (.md) live.',
        'Click a runbook and fill in the variables ({{namespace}}, {{app}}…).',
        'Click "Run" on the read steps.',
        'On write steps, check the command in the popup and confirm.',
      ],
      notes: [
        'Only kubectl runs, one call per line, with no shell and no cluster switch.',
        'PRO never writes, and DES never deletes. A blocked step shows why.',
        'Every run is recorded in ~/.workstuff/runbook-audit.log.',
      ],
    },
    pt: {
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
  },
  '/performance': {
    en: {
      purpose: 'Follows CPU, memory, restarts and throttling of up to 20 pods over time and builds a report with the AI.',
      steps: [
        'Create an observation: choose the pods and the collection interval (at least 15 s).',
        'Let the collection run for as long as you want to observe.',
        'Open the observation to see the charts.',
        'Generate the AI report from the collected history.',
      ],
      notes: [
        'Collection resumes on its own after the server restarts.',
        'With Rancher\'s Prometheus or Istio metrics in the cluster, the screen uses that data too.',
      ],
    },
    pt: {
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
  },
  '/conversores': {
    en: {
      purpose: 'Everyday conversions, done in the browser: JWT, Base64, URL, timestamp, UUID, cron, JSON and YAML, text diff, regex and hash.',
      steps: [
        'Paste the content into the tool\'s card.',
        'Choose the direction when there is one (encode or decode, format or convert).',
        'Copy the result with the button next to it.',
      ],
      notes: [
        'Nothing you paste leaves the machine: everything runs in the browser.',
        'The JWT is only decoded; its signature is not checked.',
        'For invalid JSON, the screen shows the line and column of the error.',
      ],
    },
    pt: {
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
  },
  '/servicos': {
    en: {
      purpose: 'Shows what is running on this machine: listening ports with the owning process, and Docker containers, images, volumes and compose projects. From here you can free a port by ending its process, clean up what Docker has piled up, and start the local applications you register.',
      steps: [
        'Filter the ports by number, process or PID to find who holds a port.',
        'To free the port, click "Stop" and confirm the command; tick "Force" only if a normal stop does not work.',
        'For Docker, use the Containers, Images, Volumes and Compose tabs.',
        'Start, stop or restart containers and compose projects; delete stopped containers and images and volumes that are not in use.',
        'In the Applications tab, register a folder and a command ("New application"), then start, stop, restart and follow its log from here.',
      ],
      notes: [
        'The command shown in the confirmation is your system\'s: kill on Linux and macOS, taskkill on Windows.',
        'This panel\'s own server is marked "this panel" and cannot be stopped from here.',
        'Deleting a volume deletes its data for good. Docker itself refuses an image or volume that a container is using.',
        'The "network" mark means the port is open to other machines, not only to this one.',
        'The process shows without its arguments, which may contain a password. "Other user" is a system or root process your user cannot end.',
        'Applications run without a shell, one argument per line; to chain commands, point to a script. Stop ends the whole process group, children included. "Port taken" means another process, not started here, holds the application\'s port.',
      ],
    },
    pt: {
      purpose: 'Mostra o que está rodando nesta máquina: portas em escuta com o processo dono, e containers, imagens, volumes e projetos compose do Docker. Daqui dá para liberar uma porta encerrando o processo, limpar o que o Docker acumulou e subir as aplicações locais que você cadastra.',
      steps: [
        'Filtre as portas por número, processo ou PID para achar quem ocupa uma porta.',
        'Para liberar a porta, clique em "Encerrar" e confirme o comando; marque "Forçar" só se o encerramento normal não resolver.',
        'No Docker, use as abas Containers, Imagens, Volumes e Compose.',
        'Inicie, pare ou reinicie containers e projetos compose; apague containers parados, imagens e volumes que não estão em uso.',
        'Na aba Aplicações, cadastre uma pasta e um comando ("Nova aplicação") e depois inicie, pare, reinicie e acompanhe o log por aqui.',
      ],
      notes: [
        'O comando mostrado na confirmação é o do seu sistema: kill no Linux e no macOS, taskkill no Windows.',
        'O servidor deste painel aparece marcado como "este painel" e não pode ser encerrado por aqui.',
        'Apagar volume apaga os dados dele para sempre. Imagem ou volume em uso por algum container é recusado pelo próprio Docker.',
        'A marca "rede" indica porta aberta para outras máquinas, e não só para esta.',
        'O processo aparece sem os argumentos, que podem ter senha. "Outro usuário" é processo do sistema ou de root, que o seu usuário não consegue encerrar.',
        'As aplicações rodam sem shell, um argumento por linha; para encadear comandos, aponte para um script. Parar encerra o grupo de processos inteiro, filhos incluídos. "Porta ocupada" indica que outro processo, não iniciado por aqui, está na porta da aplicação.',
      ],
    },
  },
  '/agenda': {
    en: {
      purpose: 'Checks from time to time what you register (a broken pipeline, a certificate expiring, pods with problems, a critical flaw in dependencies) and warns you with a system notification when the state changes.',
      steps: [
        'Click "New check" and choose what to check.',
        'Fill in the target and the interval. The check runs once right away, so you can see that it works.',
        'Use pause, run now and delete on each check\'s row.',
      ],
      notes: [
        'It only runs while the panel\'s server is up.',
        'The warning goes out only when the state changes: an ongoing problem warns once, and the return to normal warns again.',
        'On Windows the warning stays only in the screen\'s history.',
      ],
    },
    pt: {
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
  },
  '/gerador': {
    en: {
      purpose: 'Generates Brazilian test data: person, CPF, CNPJ (including the alphanumeric one), name, address and company.',
      steps: [
        'Choose the kind of data and, if you want, the state (UF).',
        'Generate and copy the result.',
      ],
      notes: [
        'The documents pass the check digit but are fictitious: use them only for testing.',
        'Everything is generated in the browser.',
      ],
    },
    pt: {
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
  },
  '/fabrica': {
    en: {
      purpose: 'Runs the development cycle with eight AI agents (Analyst, Architect, Implementer, Tester, Documenter, Reviewer, Security and Verifier) in isolated Git worktrees, with gates checked by code and human approval before anything is sent.',
      steps: [
        'First time? "Guided mode" checks bwrap and the CLIs, reads the repository, helps you write the request and picks models and a cost cap. To create directly, use "New task" (imports a GitLab or GitHub issue, or a manual task).',
        'On the Board, each card shows every agent\'s progress, the step running now with who runs it and for how long, and the cost so far. Click the card to open the timeline: one lane per agent and the live activity, with what each agent writes and every tool it calls.',
        'The Analyst writes the acceptance criteria. If there is a business question, the task stops at "waiting for answers" until you reply.',
        'The Architect writes the plan. "Read and approve the plan" opens the task with the plan on display: review it, edit it if you want and click "Approve and build".',
        'The Implementer codes in the worktree. If a gate fails (no change, a declared file missing, verification failing), it gets the failure and fixes it, up to 3 attempts.',
        'The Tester writes at least one test per acceptance criterion and the Documenter updates the affected docs. Then the security tools that are installed (gitleaks, semgrep, npm audit) run, and Reviewer and Security review in parallel. The Verifier tries to refute each blocking finding; what resists, an unmet criterion or a failing verification goes back to the Implementer, up to 2 rounds, and the Tester runs again after each fix.',
        'At the end the branch is rebased on the current base and verified again. In review, the drawer lists what blocks the delivery and what needs your look. A blocker only goes with a written reason, which lands in the MR description. With "Open the MR by itself" on, a task with nothing to show opens the MR without you.',
      ],
      notes: [
        'Every code change happens in ~/.workstuff/worktrees; your main repository is left untouched.',
        'The verification command runs inside bwrap: it executes code the agent wrote, so only the worktree and the build caches are writable. Without bwrap, verification does not run and QA shows as failed.',
        'The review verdict is computed in code: it blocks a high or critical finding with confidence 75 or more, and an unmet acceptance criterion.',
        'Cost and tokens show when the provider reports them (Claude and Codex).',
        'On the timeline, click any phase to see all of it in a modal: the result (criteria, plan, findings, gate command and output), the agent\'s live output and every tool called.',
        'Verification runs every step the project has (lint, typecheck, test, check, build; mvn -q verify; go vet and go test), one at a time, plus the task\'s smoke command. Without any, nothing is verified and the delivery is blocked.',
        'Cost cap: checked before each agent, adding up every run of the task. When it is reached, the task stops with an error; raise the cap on the task itself and try again. One run can go a little over the cap, because the cost only arrives when it ends.',
        'Model per agent: in "New task", choose a strong model to specify, plan and review and a cheaper one to build, test and document.',
        'You can also call any of the agents on its own in the Specialized agents tab, always in read-only mode.',
      ],
    },
    pt: {
      purpose: 'Orquestra o ciclo de desenvolvimento com oito agentes de IA (Analyst, Architect, Implementer, Tester, Documenter, Reviewer, Security e Verifier) em Git Worktrees isoladas, com portões verificados por código e aprovação humana antes de qualquer envio.',
      steps: [
        'Primeira vez? "Modo guiado" confere bwrap e CLIs, lê o repositório, ajuda a escrever a demanda e escolhe modelos e teto de custo. Para criar direto, use "Nova Tarefa" (importa issue do GitLab ou GitHub, ou tarefa manual).',
        'No Quadro, cada cartão mostra o andamento de cada agente, a etapa de agora com quem a executa e há quanto tempo, e o custo até aqui. Clique no cartão para abrir a linha do tempo: as raias por agente e a atividade ao vivo, com o que cada agente escreve e cada ferramenta que chama.',
        'O Analyst escreve os critérios de aceite. Se houver dúvida de negócio, a tarefa para em "aguardando respostas" até você responder.',
        'O Architect gera o plano. "Ler e aprovar o plano" abre a tarefa com o plano à mostra: revise, edite se quiser e clique em "Aprovar e Construir".',
        'O Implementer codifica na worktree. Se um portão reprovar (sem alteração, arquivo declarado ausente, verificação falhando), ele recebe a falha e corrige, até 3 tentativas.',
        'O Tester escreve pelo menos um teste por critério de aceite e o Documenter atualiza a documentação afetada. Depois rodam as ferramentas de segurança instaladas (gitleaks, semgrep, npm audit), e Reviewer e Security revisam em paralelo. O Verifier tenta refutar cada achado bloqueante; o que resiste, critério não atendido ou verificação falhando volta para o Implementer, até 2 rodadas, e o Tester roda de novo depois de cada correção.',
        'No fim, a branch é rebaseada sobre a base atual e verificada de novo. Na revisão, a gaveta lista o que bloqueia a entrega e o que pede o seu olhar. Um bloqueio só segue com uma justificativa escrita, que vai para a descrição do MR. Com "Abrir o MR sozinho" ligado, uma tarefa sem nada a mostrar abre o MR sem você.',
      ],
      notes: [
        'Toda alteração de código ocorre em ~/.workstuff/worktrees; o seu repositório principal fica intocado.',
        'O comando de verificação roda dentro do bwrap: executa código escrito pelo agente, então só a worktree e os caches de build são graváveis. Sem bwrap, a verificação não roda e o QA aparece como reprovado.',
        'O veredito da revisão é calculado em código: bloqueia achado high ou critical com confiança 75 ou mais, e critério de aceite não atendido.',
        'O custo e os tokens aparecem quando o provedor os informa (Claude e Codex).',
        'Na linha do tempo, clique em qualquer fase para ver tudo dela num modal: o resultado (critérios, plano, achados, comando e saída do portão), a saída do agente ao vivo e cada ferramenta chamada.',
        'A verificação roda todas as etapas que o projeto tem (lint, typecheck, test, check, build; mvn -q verify; go vet e go test), uma por vez, mais o comando de smoke da tarefa. Sem nenhuma, nada é verificado e a entrega fica bloqueada.',
        'Teto de custo: conferido antes de cada agente, somando todas as execuções da tarefa. Ao atingir, a tarefa para com erro; aumente o teto na própria tarefa e tente de novo. Uma execução pode passar um pouco do teto, porque o custo só chega quando ela termina.',
        'Modelo por agente: em "Nova Tarefa", escolha um modelo forte para especificar, planejar e revisar e um mais barato para construir, testar e documentar.',
        'Você também pode acionar qualquer um dos agentes de forma independente na aba de Agentes Especializados, sempre em modo leitura.',
      ],
    },
  },
  '/dev-runbooks': {
    en: {
      purpose: 'Runs local development procedures and routines: Git, Docker and Node commands run through the panel with confirmation.',
      steps: [
        'Choose a runbook in the sidebar (or point to your own folder of local runbooks).',
        'Fill in variables such as project, branch or container if needed.',
        'Click "Run" on the read steps.',
        'On steps that change something (writes), check the command and confirm the run.',
      ],
      notes: [
        'Only approved development tools can run (git, docker, npm, etc.).',
        'Write commands show the exact command and directory before running.',
        'Every run is recorded in ~/.workstuff/dev-runbook-audit.log.',
      ],
    },
    pt: {
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
  },
  '/catalogo': {
    en: {
      purpose: 'Gathers the skills, prompts, rules, personas and templates from your folders and turns each one on in the AI agents (Claude Code, Codex, Gemini, OpenCode).',
      steps: [
        'Register the folders where the items live.',
        'Find the item with the search or the type filter.',
        'Turn the item on in the agent you want, or tick several in the list and activate them all at once in one agent.',
        'Use "AI review" to have the AI assess the item, or search ready-made skills on skills.sh.',
      ],
      notes: [
        'A skill becomes a link in the agent\'s skills folder. A rule or persona goes into a marked block of the instructions file.',
        'What the panel did not create is never changed.',
      ],
    },
    pt: {
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
  },
  '/analise': {
    en: {
      purpose: 'Generates a full report of a project\'s architecture with the AI, lets you chat about it and save it in the project itself.',
      steps: [
        'Choose the project folder.',
        'Generate the report and wait: the AI reads the code before writing.',
        'Use the chat to ask about the report.',
        'Save the report in the project\'s docs/arquitetura, if you want.',
      ],
      notes: [
        'If the project\'s commit has not changed, the screen shows the previous report without spending again.',
        'With a graphify-out/graph.html in the project, the graph tab shows the visualization.',
      ],
    },
    pt: {
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
  },
  '/playbooks': {
    en: {
      purpose: 'Runs guided engineering procedures and recipes with the AI: each prompt block becomes a step the model runs, with streaming.',
      steps: [
        'Choose a playbook in the sidebar (or point to your own folder).',
        'Fill in the requested variables (e.g. project, task, context).',
        'Click "Run with AI" on each step or "Run all".',
        'Follow the streamed answer and copy the generated result.',
      ],
      notes: [
        'Uses the provider and model set in the Settings screen.',
        'The {{passo_anterior}} variable injects the previous step\'s answer automatically.',
        'The AI runs in read-only mode without changing files directly.',
      ],
    },
    pt: {
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
  },
  '/configuracoes': {
    en: {
      purpose: 'Chooses the AI provider used across the panel and adjusts the appearance and the menu items.',
      steps: [
        'In "AI provider", choose the CLI (Claude, Codex or Antigravity), the model and the effort.',
        'In "Appearance", choose the language, the theme and the accent color. Changing the language reloads the page.',
        'In "Menu items", hide the screens you do not use.',
      ],
      notes: [
        'Every provider runs in read-only mode. Antigravity only works on Linux, inside bubblewrap.',
        'Theme and menu are saved in this browser; the language is saved on the server, which also answers its messages in it.',
      ],
    },
    pt: {
      purpose: 'Escolhe o provedor de IA usado em todo o painel e ajusta a aparência e os itens do menu.',
      steps: [
        'Em "Provedor de IA", escolha o CLI (Claude, Codex ou Antigravity), o modelo e o esforço.',
        'Em "Aparência", escolha o idioma, o tema e a cor de destaque. Trocar o idioma recarrega a página.',
        'Em "Itens do menu", esconda as telas que você não usa.',
      ],
      notes: [
        'Todo provedor roda em modo leitura. O Antigravity só funciona no Linux, dentro do bubblewrap.',
        'Tema e menu ficam salvos neste navegador; o idioma fica salvo no servidor, que também responde as mensagens nele.',
      ],
    },
  },
}

// Finds the current screen's help by the longest prefix (e.g. /cluster/doctor uses /cluster's).
export function helpFor(pathname: string): Help | null {
  const key = Object.keys(HELP).filter(k => pathname === k || pathname.startsWith(k + '/')).sort((a, b) => b.length - a.length)[0]
  return key ? tx(HELP[key]) : null
}
