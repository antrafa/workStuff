// "What do you need?" on Home: the dev types the task in their own words and gets the screens that do
// it, with the first steps. NEEDS is written by hand for the common tasks; every menu screen is also
// searchable by its own name and hint, so a new screen shows up even before it gets a need here.
// Tested by scripts/check-needs.ts. Relative imports: that script loads this file in Node.
import { NAV } from '../../app/nav.ts'
import { MANUAL_PAGES } from '../../app/manual.ts'
import { tx } from '../../lib/i18n.ts'

export type Need = {
  id: string
  // Where "Open" goes; a query string picks the screen's tab
  route: string
  // The task as the dev would say it
  title: string
  steps: string[]
  // Words people use for this task, in both languages and without accents: the search ignores the UI language
  words: string
}

export type NeedMatch = Need & { score: number; manual: string | null; screen: string }

export const NEEDS: Need[] = [
  {
    id: 'call-endpoint',
    route: '/requisicoes',
    title: tx({ en: 'Call an endpoint or test an API', pt: 'Chamar um endpoint ou testar uma API' }),
    steps: [
      tx({ en: 'Pick the method and type the URL.', pt: 'Escolha o método e digite a URL.' }),
      tx({ en: 'Got a curl? Click Import curl and paste it.', pt: 'Recebeu um curl? Clique em Importar curl e cole.' }),
      tx({ en: 'Click Send and read the answer below.', pt: 'Clique em Enviar e leia a resposta embaixo.' }),
    ],
    words: 'testar test endpoint api rest http https requisicao requisicoes request requests chamar call curl postman insomnia get post put delete json resposta response status health actuator header cabecalho token bearer',
  },
  {
    id: 'mr-to-review',
    route: '/revisao?aba=fila',
    title: tx({ en: 'See the MRs waiting for my review', pt: 'Ver os MRs que esperam a minha revisão' }),
    steps: [
      tx({ en: 'Waiting for your review lists the MRs where you are reviewer or assignee.', pt: 'Esperando a sua revisão lista os MRs em que você é revisor ou responsável.' }),
      tx({ en: 'Click Inspect to read the diff and ask the AI for a review.', pt: 'Clique em Inspecionar para ler o diff e pedir a revisão da IA.' }),
    ],
    words: 'mr mrs merge request pr pull requests revisar revisao review reviewer esperando aguardando aprovar aprovacao fila pendente pendentes queue inbox waiting approve',
  },
  {
    id: 'my-mr-blocked',
    route: '/revisao?aba=fila',
    title: tx({ en: 'Find out why my MR cannot be merged', pt: 'Saber por que o meu MR não pode ser mergeado' }),
    steps: [
      tx({ en: 'Opened by you shows each MR of yours with what blocks it: conflict, pipeline, approval, open threads.', pt: 'Abertos por você mostra cada MR seu com o que trava: conflito, esteira, aprovação, discussão aberta.' }),
      tx({ en: 'A failed pipeline? Open Pipelines and click Explain failure on the job.', pt: 'Esteira falhou? Abra Pipelines e clique em Explicar falha no job.' }),
    ],
    words: 'meu meus mr pr merge mergear bloqueado travado conflito conflict rebase status aprovacao approval discussao blocked stuck cannot',
  },
  {
    id: 'review-branch',
    route: '/revisao',
    title: tx({ en: 'Review my branch before opening the MR', pt: 'Revisar a minha branch antes de abrir o MR' }),
    steps: [
      tx({ en: 'Choose the repository folder and click Open.', pt: 'Escolha a pasta do repositório e clique em Abrir.' }),
      tx({ en: 'Check the base branch and click Review.', pt: 'Confira a branch base e clique em Revisar.' }),
      tx({ en: 'The AI lists the problems by severity, with file and line, and a paragraph for the MR.', pt: 'A IA lista os problemas por gravidade, com arquivo e linha, e um parágrafo para o MR.' }),
    ],
    words: 'revisar revisao review branch diff antes abrir mr codigo code bug bugs ia ai qualidade quality descricao description',
  },
  {
    id: 'search-code',
    route: '/repositorios?aba=busca',
    title: tx({ en: 'Find a text in every project', pt: 'Procurar um texto em todos os projetos' }),
    steps: [
      tx({ en: 'Type the text, e.g. a variable name, and optionally the files (*.yml).', pt: 'Digite o texto, por exemplo o nome de uma variável, e se quiser os arquivos (*.yml).' }),
      tx({ en: 'Click Search: the results come by clone, with file and line.', pt: 'Clique em Procurar: o resultado vem por clone, com arquivo e linha.' }),
    ],
    words: 'buscar busca procurar search find grep onde where usa usado usage variavel variable propriedade property config configuracao todos all projetos projects clones codigo code texto text',
  },
  {
    id: 'what-goes-to-prod',
    route: '/comparar',
    title: tx({ en: 'See what goes to production (commits between versions)', pt: 'Ver o que vai junto para produção (commits entre versões)' }),
    steps: [
      tx({ en: 'Compare the HML namespace (side A) with the PRO one (side B).', pt: 'Compare o namespace de HML (lado A) com o de PRO (lado B).' }),
      tx({ en: 'Open a workload whose tag differs and click What changes.', pt: 'Abra um workload com tag diferente e clique em O que muda.' }),
      tx({ en: 'The commits and MRs between the two versions come from your local clone.', pt: 'Os commits e MRs entre as duas versões vêm do seu clone local.' }),
    ],
    words: 'release producao production pro prod hml versao version versoes commits mudancas changes changelog nota notes deploy subir tag tags imagem image vai junto what goes',
  },
  {
    id: 'compare-envs',
    route: '/comparar',
    title: tx({ en: 'Compare the configuration of HML and PRO', pt: 'Comparar a configuração de HML e PRO' }),
    steps: [
      tx({ en: 'Pick kubeconfig and namespace on side A and on side B.', pt: 'Escolha kubeconfig e namespace no lado A e no lado B.' }),
      tx({ en: 'Click Compare and open a workload to see each difference.', pt: 'Clique em Comparar e abra um workload para ver cada diferença.' }),
    ],
    words: 'comparar compare diferenca difference diff hml pro des itg ambientes environments variaveis variables env replicas imagem configuracao probes',
  },
  {
    id: 'clone',
    route: '/repositorios',
    title: tx({ en: 'Clone a project or a whole group', pt: 'Clonar um projeto ou um grupo inteiro' }),
    steps: [
      tx({ en: 'Pick the connection and browse the groups.', pt: 'Escolha a conexão e navegue pelos grupos.' }),
      tx({ en: 'Click Clone on the project; the folder follows the group hierarchy.', pt: 'Clique em Clonar no projeto; a pasta segue a hierarquia dos grupos.' }),
    ],
    words: 'clonar clone baixar download projeto project grupo group subgrupo gitlab github repositorio repository',
  },
  {
    id: 'workspace',
    route: '/repositorios?aba=workspace',
    title: tx({ en: 'See what is left uncommitted and free disk space', pt: 'Ver o que ficou sem commit e liberar espaço em disco' }),
    steps: [
      tx({ en: 'My Workspace scans every clone: uncommitted work, stashes and old branches.', pt: 'Meu Workspace varre todos os clones: alteração sem commit, stash e branch antiga.' }),
      tx({ en: 'Use Fetch, prune merged branches or clean build folders (target, node_modules).', pt: 'Use Fetch, apague branches já mergeadas ou limpe pastas de build (target, node_modules).' }),
    ],
    words: 'workspace commit pendente uncommitted stash branch branches antiga old limpar clean disco disk espaco space node_modules target build fetch esqueci forgot',
  },
  {
    id: 'pipeline-failed',
    route: '/pipelines',
    title: tx({ en: 'Understand why the pipeline failed', pt: 'Entender por que a esteira (pipeline) falhou' }),
    steps: [
      tx({ en: 'Click the project row and the pipeline that failed.', pt: 'Clique na linha do projeto e na pipeline que falhou.' }),
      tx({ en: 'On the failed job, click Explain failure: the AI reads the log and the code.', pt: 'No job que falhou, clique em Explicar falha: a IA lê o log e o código.' }),
    ],
    words: 'pipeline pipelines esteira ci cd job jobs falhou falha failed quebrou broke erro error build log gitlab actions vermelho red',
  },
  {
    id: 'vulns',
    route: '/vulnerabilidades',
    title: tx({ en: 'Find vulnerable or outdated dependencies', pt: 'Achar dependências com falha de segurança ou desatualizadas' }),
    steps: [
      tx({ en: 'Choose the project folder and click Check.', pt: 'Escolha a pasta do projeto e clique em Verificar.' }),
      tx({ en: 'Start with critical and high; each one says the version that fixes it.', pt: 'Comece por crítica e alta; cada uma diz a versão que corrige.' }),
    ],
    words: 'vulnerabilidade vulnerabilidades vulnerability cve seguranca security dependencia dependencias dependency biblioteca library desatualizada outdated npm maven pom package trivy osv atualizar',
  },
  {
    id: 'pod-problem',
    route: '/cluster',
    title: tx({ en: 'Investigate a pod that restarts or does not start', pt: 'Investigar um pod que reinicia ou não sobe' }),
    steps: [
      tx({ en: 'Connect the cluster; the pods that need attention come first.', pt: 'Conecte o cluster; os pods que precisam de atenção vêm primeiro.' }),
      tx({ en: 'Click the pod row: switch the log to Previous to see why it died.', pt: 'Clique na linha do pod: troque o log para Anterior para ver por que ele morreu.' }),
      tx({ en: 'Click Investigate with AI for the probable cause.', pt: 'Clique em Investigar com IA para a causa provável.' }),
    ],
    words: 'pod pods reiniciando restarting restart reinicia crashloop crashloopbackoff oomkilled erro error cluster kubernetes k8s nao sobe down diagnostico diagnose caiu',
  },
  {
    id: 'logs',
    route: '/logs',
    title: tx({ en: 'Follow the logs of an application in the cluster', pt: 'Acompanhar os logs de uma aplicação no cluster' }),
    steps: [
      tx({ en: 'Type the namespace and click List applications.', pt: 'Digite o namespace e clique em Listar aplicações.' }),
      tx({ en: 'Click the application: the logs of all its pods come together, a color per pod.', pt: 'Clique na aplicação: os logs de todos os pods vêm juntos, uma cor por pod.' }),
    ],
    words: 'logs log tail stern kubectl pods aplicacao application erro error acompanhar follow seguir',
  },
  {
    id: 'incident',
    route: '/incidente',
    title: tx({ en: 'Rebuild what happened in an incident and draft the post-mortem', pt: 'Remontar o que aconteceu num incidente e rascunhar o post-mortem' }),
    steps: [
      tx({ en: 'Type the namespace, pick the time window and click Build timeline.', pt: 'Digite o namespace, escolha a janela e clique em Montar linha do tempo.' }),
      tx({ en: 'Read events, restarts and rollouts in order, then ask for the post-mortem.', pt: 'Leia eventos, restarts e rollouts em ordem e depois peça o post-mortem.' }),
    ],
    words: 'incidente incident post mortem postmortem linha tempo timeline aconteceu happened queda outage fora ar down ontem yesterday rca',
  },
  {
    id: 'performance',
    route: '/performance',
    title: tx({ en: 'Watch CPU and memory of pods over time', pt: 'Acompanhar CPU e memória de pods ao longo do tempo' }),
    steps: [
      tx({ en: 'Create an observation with the pods and the interval.', pt: 'Crie uma observação com os pods e o intervalo.' }),
      tx({ en: 'Read the charts and, after a while, ask for the AI report.', pt: 'Leia os gráficos e, depois de um tempo, peça o relatório da IA.' }),
    ],
    words: 'performance desempenho cpu memoria memory lento lenta lentidao demora demorando latencia latency lag slow consumo usage throttling grafico chart observar observation',
  },
  {
    id: 'resources',
    route: '/recursos',
    title: tx({ en: 'Check requests, limits and JVM flags of the manifests', pt: 'Conferir requests, limits e flags da JVM dos manifests' }),
    steps: [
      tx({ en: 'Choose where the manifests come from (a GitLab group).', pt: 'Escolha de onde vêm os manifests (um grupo do GitLab).' }),
      tx({ en: 'Open a stack; link it to a namespace to compare with the real usage.', pt: 'Abra uma stack; ligue a um namespace para comparar com o uso real.' }),
    ],
    words: 'requests limits recursos resources cpu memoria memory xmx xms jvm heap manifest manifests dimensionar sizing',
  },
  {
    id: 'busy-port',
    route: '/servicos',
    title: tx({ en: 'Free a busy port', pt: 'Liberar uma porta ocupada' }),
    steps: [
      tx({ en: 'In Ports and Docker, filter by the port number, e.g. 8080.', pt: 'Em Portas e Docker, filtre pelo número da porta, por exemplo 8080.' }),
      tx({ en: 'Click Stop on the line and confirm the command shown.', pt: 'Clique em Encerrar na linha e confirme o comando mostrado.' }),
    ],
    words: 'porta port ocupada busy em uso address already in use eaddrinuse matar kill processo process 8080 3000 5432 liberar free',
  },
  {
    id: 'docker',
    route: '/servicos',
    title: tx({ en: 'Start, stop or clean Docker containers', pt: 'Subir, parar ou limpar containers do Docker' }),
    steps: [
      tx({ en: 'Ports and Docker lists containers, images, volumes and compose projects.', pt: 'Portas e Docker lista containers, imagens, volumes e projetos compose.' }),
      tx({ en: 'Each action shows the exact command before running it.', pt: 'Cada ação mostra o comando exato antes de rodar.' }),
    ],
    words: 'docker container containers compose imagem image imagens volume volumes limpar clean prune parar stop subir start',
  },
  {
    id: 'local-app',
    route: '/servicos?aba=aplicacoes',
    title: tx({ en: 'Start my local application and follow its log', pt: 'Subir a minha aplicação local e acompanhar o log' }),
    steps: [
      tx({ en: 'In Applications, click New application: folder, command and port.', pt: 'Em Aplicações, clique em Nova aplicação: pasta, comando e porta.' }),
      tx({ en: 'Start, stop and restart it from the list, with the log beside it.', pt: 'Inicie, pare e reinicie pela lista, com o log ao lado.' }),
    ],
    words: 'aplicacao application app api local subir start rodar run iniciar spring boot npm dev servidor server log',
  },
  {
    id: 'tunnel',
    route: '/servicos?aba=tuneis',
    title: tx({ en: 'Reach a cluster service from my machine (port-forward)', pt: 'Acessar um serviço do cluster pela minha máquina (port-forward)' }),
    steps: [
      tx({ en: 'In K8s Tunnels, create a tunnel with kubeconfig, namespace, service and port.', pt: 'Em Túneis K8s, crie um túnel com kubeconfig, namespace, serviço e porta.' }),
      tx({ en: 'Connect it: the service answers on 127.0.0.1.', pt: 'Conecte: o serviço responde em 127.0.0.1.' }),
    ],
    words: 'tunel tuneis tunnel port forward portforward acessar access servico service cluster banco database postgres redis localhost',
  },
  {
    id: 'machine',
    route: '/maquina',
    title: tx({ en: 'Get the machine ready (Java, Maven, Node, Docker, kubectl)', pt: 'Deixar a máquina pronta (Java, Maven, Node, Docker, kubectl)' }),
    steps: [
      tx({ en: 'The check runs on its own and lists what is missing first.', pt: 'A verificação roda sozinha e lista primeiro o que falta.' }),
      tx({ en: 'On an item with Run, check the command and confirm.', pt: 'Num item com Executar, confira o comando e confirme.' }),
    ],
    words: 'instalar install configurar setup maquina machine java jdk maven node npm nvm sdkman docker kubectl ssh chave key settings npmrc onboarding novo new',
  },
  {
    id: 'decode',
    route: '/conversores',
    title: tx({ en: 'Read a JWT or convert Base64, JSON, YAML, timestamp', pt: 'Ler um JWT ou converter Base64, JSON, YAML, timestamp' }),
    steps: [
      tx({ en: 'Paste the text in the matching card (JWT, Base64, JSON…).', pt: 'Cole o texto no cartão certo (JWT, Base64, JSON…).' }),
      tx({ en: 'Everything runs in the browser: nothing leaves the machine.', pt: 'Tudo roda no navegador: nada sai da máquina.' }),
    ],
    words: 'jwt token decodificar decode base64 json yaml formatar format timestamp epoch data date uuid regex hash sha cron converter convert pem',
  },
  {
    id: 'sql-bind',
    route: '/conversores',
    title: tx({ en: 'Build the SQL from a Hibernate log', pt: 'Montar o SQL a partir do log do Hibernate' }),
    steps: [
      tx({ en: 'In the SQL Bind card, paste the query and the binding lines of the log.', pt: 'No cartão SQL Bind, cole a query e as linhas de binding do log.' }),
      tx({ en: 'Copy the query with the values in place of each ?.', pt: 'Copie a query com os valores no lugar de cada ?.' }),
    ],
    words: 'sql hibernate bind binding parametro parameter query consulta log mybatis jdbc',
  },
  {
    id: 'test-data',
    route: '/gerador',
    title: tx({ en: 'Generate CPF, CNPJ and test data', pt: 'Gerar CPF, CNPJ e dados de teste' }),
    steps: [tx({ en: 'Pick what to generate and copy it; a state (UF) filter is optional.', pt: 'Escolha o que gerar e copie; o filtro de estado (UF) é opcional.' })],
    words: 'cpf cnpj gerar generate massa dados data teste test pessoa person empresa company endereco address fake',
  },
  {
    id: 'certificates',
    route: '/upgrade',
    title: tx({ en: 'See when certificates and kubeconfig credentials expire', pt: 'Ver quando vencem os certificados e as credenciais dos kubeconfigs' }),
    steps: [tx({ en: 'Open the certificates tab: each ingress host and each kubeconfig with its expiry date.', pt: 'Abra a aba de certificados: cada host de ingress e cada kubeconfig com a data de vencimento.' })],
    words: 'certificado certificados certificate tls ssl vencimento vencendo vence vencer vencido expiry expira expires expiring https ingress kubeconfig credencial credential',
  },
  {
    id: 'upgrade',
    route: '/upgrade',
    title: tx({ en: 'See what breaks before upgrading Kubernetes', pt: 'Ver o que quebra antes de atualizar o Kubernetes' }),
    steps: [
      tx({ en: 'In Removed APIs, type the target version and click Check cluster.', pt: 'Em APIs removidas, digite a versão de destino e clique em Verificar cluster.' }),
      tx({ en: 'Each object shows the format to switch to.', pt: 'Cada objeto mostra o formato para o qual trocar.' }),
    ],
    words: 'upgrade atualizar update kubernetes k8s versao version api apis depreciada deprecated removida removed',
  },
  {
    id: 'alerts',
    route: '/agenda',
    title: tx({ en: 'Get a notice when a pipeline, certificate or pods break', pt: 'Ser avisado quando uma esteira, certificado ou pods quebrarem' }),
    steps: [
      tx({ en: 'Click New check and choose what to watch.', pt: 'Clique em Nova verificação e escolha o que conferir.' }),
      tx({ en: 'A desktop notification comes only when the state changes.', pt: 'A notificação no desktop chega só quando o estado muda.' }),
    ],
    words: 'alerta alertas alert aviso avisar notify notificacao notification monitorar monitor agendar schedule vigiar watch',
  },
  {
    id: 'daily',
    route: '/',
    title: tx({ en: 'Put together my stand-up summary', pt: 'Montar o meu resumo para a daily' }),
    steps: [
      tx({ en: 'On Home, in the For the stand-up card, click Build summary.', pt: 'No Início, no cartão Para a daily, clique em Montar resumo.' }),
      tx({ en: 'It joins your commits since the last working day, your open MRs and the failed pipelines.', pt: 'Ele junta seus commits desde o último dia útil, seus MRs abertos e as esteiras que falharam.' }),
    ],
    words: 'daily standup stand up resumo summary ontem yesterday fiz did commits reuniao meeting status report relatorio',
  },
  {
    id: 'factory',
    route: '/fabrica',
    title: tx({ en: 'Have AI agents implement a task', pt: 'Pedir para agentes de IA implementarem uma tarefa' }),
    steps: [
      tx({ en: 'Create a task (or import an issue); the agents plan and wait for your approval.', pt: 'Crie uma tarefa (ou importe uma issue); os agentes planejam e esperam a sua aprovação.' }),
      tx({ en: 'Review the delivery and turn it into an MR.', pt: 'Revise a entrega e transforme em MR.' }),
    ],
    words: 'fabrica factory agente agentes agent implementar implement tarefa task issue codar code automatizar automate ia ai feature',
  },
  {
    id: 'architecture',
    route: '/analise',
    title: tx({ en: 'Understand the architecture of an unknown project', pt: 'Entender a arquitetura de um projeto que não conheço' }),
    steps: [
      tx({ en: 'Choose the project folder; the AI writes the report in read-only mode.', pt: 'Escolha a pasta do projeto; a IA escreve o relatório em modo leitura.' }),
      tx({ en: 'Then ask questions about it in the chat.', pt: 'Depois pergunte sobre ele no chat.' }),
    ],
    words: 'arquitetura architecture entender understand projeto project novo new desconhecido unknown documentacao documentation analise analysis como funciona legado legacy onboarding',
  },
  {
    id: 'catalog',
    route: '/catalogo',
    title: tx({ en: 'Turn on skills, prompts and rules in the AI agents', pt: 'Ativar skills, prompts e rules nos agentes de IA' }),
    steps: [
      tx({ en: 'Register the folders with your items.', pt: 'Cadastre as pastas com os seus itens.' }),
      tx({ en: 'Turn each item on per agent (Claude Code, Codex, Gemini, OpenCode).', pt: 'Ative cada item por agente (Claude Code, Codex, Gemini, OpenCode).' }),
    ],
    words: 'skill skills prompt prompts rule rules persona claude codex gemini opencode agente agent catalogo catalog ativar enable',
  },
  {
    id: 'cluster-runbook',
    route: '/runbooks',
    title: tx({ en: 'Follow a cluster procedure step by step', pt: 'Seguir um procedimento no cluster passo a passo' }),
    steps: [tx({ en: 'Pick the runbook: read steps run directly, write steps wait for your confirmation.', pt: 'Escolha o runbook: passo de leitura roda direto, passo de escrita espera a sua confirmação.' })],
    words: 'runbook runbooks procedimento procedure passo step kubectl cluster operacao operation',
  },
  {
    id: 'dev-runbook',
    route: '/dev-runbooks',
    title: tx({ en: 'Run the commands the team always uses', pt: 'Rodar os comandos que o time sempre usa' }),
    steps: [tx({ en: 'Pick a dev runbook and run its steps on your machine.', pt: 'Escolha um runbook de dev e rode os passos na sua máquina.' })],
    words: 'comando command comandos script scripts build rodar run local procedimento dev receita recipe',
  },
  {
    id: 'share-setup',
    route: '/perfil',
    title: tx({ en: 'Hand my setup to a colleague', pt: 'Passar a minha configuração para um colega' }),
    steps: [tx({ en: 'Export the profile to a file; the colleague imports it and sees what changes first.', pt: 'Exporte o perfil para um arquivo; o colega importa e vê antes o que muda.' })],
    words: 'perfil profile exportar export importar import colega colleague time team configuracao setup onboarding compartilhar share',
  },
  {
    id: 'cluster-chat',
    route: '/cluster/doctor',
    title: tx({ en: 'Ask the AI about the cluster', pt: 'Perguntar à IA sobre o cluster' }),
    steps: [tx({ en: 'The Cluster Doctor reads the cluster on its own; any change it suggests waits for your approval.', pt: 'O Cluster Doctor lê o cluster sozinho; qualquer mudança que ele sugerir espera a sua aprovação.' })],
    words: 'doctor ia ai chat conversar perguntar ask cluster investigar investigate kubernetes',
  },
]

// Shortcuts under the field, by phase of any developer's day (not of one team): each one is a search
// that lands on its need. The stand-up summary has no shortcut: its card sits right below on Home.
export type PresetGroup = { label: string; presets: { label: string; query: string; expect: string }[] }

export const PRESET_GROUPS: PresetGroup[] = [
  {
    label: tx({ en: 'Coding', pt: 'Codar' }),
    presets: [
      { label: tx({ en: 'Test an API', pt: 'Testar uma API' }), query: 'testar endpoint', expect: 'call-endpoint' },
      { label: tx({ en: 'Read a JWT or JSON', pt: 'Ler JWT ou JSON' }), query: 'decodificar jwt json', expect: 'decode' },
      { label: tx({ en: 'Generate test data', pt: 'Gerar dados de teste' }), query: 'gerar dados de teste', expect: 'test-data' },
      { label: tx({ en: 'Find in every project', pt: 'Procurar em todos os projetos' }), query: 'procurar texto todos projetos', expect: 'search-code' },
    ],
  },
  {
    label: tx({ en: 'Delivering', pt: 'Entregar' }),
    presets: [
      { label: tx({ en: 'Review before the MR', pt: 'Revisar antes do MR' }), query: 'revisar branch antes mr', expect: 'review-branch' },
      { label: tx({ en: 'MRs waiting for me', pt: 'MRs esperando por mim' }), query: 'mr esperando revisao', expect: 'mr-to-review' },
      { label: tx({ en: 'Pipeline failed', pt: 'Esteira falhou' }), query: 'pipeline falhou', expect: 'pipeline-failed' },
      { label: tx({ en: 'Vulnerable dependency', pt: 'Dependência vulnerável' }), query: 'dependencia vulneravel', expect: 'vulns' },
    ],
  },
  {
    label: tx({ en: 'Running locally', pt: 'Rodar local' }),
    presets: [
      { label: tx({ en: 'Set up the machine', pt: 'Configurar a máquina' }), query: 'configurar maquina', expect: 'machine' },
      { label: tx({ en: 'Start my app', pt: 'Subir app local' }), query: 'subir aplicacao local', expect: 'local-app' },
      { label: tx({ en: 'Busy port', pt: 'Porta ocupada' }), query: 'porta ocupada', expect: 'busy-port' },
      { label: tx({ en: 'Docker containers', pt: 'Containers Docker' }), query: 'containers docker', expect: 'docker' },
    ],
  },
  {
    label: tx({ en: 'Production', pt: 'Produção' }),
    presets: [
      { label: tx({ en: 'See the logs', pt: 'Ver logs' }), query: 'ver logs aplicacao', expect: 'logs' },
      { label: tx({ en: 'Pod restarting', pt: 'Pod reiniciando' }), query: 'pod reiniciando', expect: 'pod-problem' },
      { label: tx({ en: 'Slowness', pt: 'Lentidão' }), query: 'lentidao', expect: 'performance' },
      { label: tx({ en: 'What goes to production', pt: 'O que vai para produção' }), query: 'o que vai para producao', expect: 'what-goes-to-prod' },
    ],
  },
]

export const PRESETS = PRESET_GROUPS.flatMap(g => g.presets)

const STOP = new Set([
  'de', 'do', 'da', 'dos', 'das', 'um', 'uma', 'os', 'as', 'em', 'no', 'na', 'nos', 'nas', 'para', 'pra', 'por', 'com', 'que', 'meu', 'minha', 'meus', 'minhas', 'eu', 'ver', 'quero', 'preciso', 'como', 'se', 'ao', 'um', 'qual', 'quais', 'esta', 'esse', 'essa', 'isso',
  'the', 'an', 'to', 'of', 'in', 'on', 'for', 'my', 'and', 'is', 'how', 'see', 'want', 'need', 'do', 'it', 'what', 'which', 'from', 'with', 'me',
])

export const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const tokens = (s: string) => plain(s).split(' ').filter(t => t.length >= 2 && !STOP.has(t))

// 3 for the same word, 2 when one is the start of the other (deploy/deployment), 1 for a shared
// root of 4+ letters that covers most of the shorter word (falhou/falha, reiniciando/reinicia)
function wordScore(q: string, w: string): number {
  if (q === w) return 3
  if ((q.length >= 3 && w.startsWith(q)) || (w.length >= 4 && q.startsWith(w))) return 2
  let common = 0
  while (common < q.length && common < w.length && q[common] === w[common]) common++
  return common >= 4 && common >= Math.min(q.length, w.length) * 0.6 ? 1 : 0
}

const tokenScores = (query: string[], haystack: string[]) => query.map(q => Math.max(0, ...haystack.map(w => wordScore(q, w))))

const slugOf = (route: string) => {
  const path = route.split('?')[0]
  const page = MANUAL_PAGES.filter(p => p.route && (path === p.route || (p.route !== '/' && path.startsWith(p.route + '/')))).sort((a, b) => b.route!.length - a.route!.length)[0]
  return page?.slug ?? null
}

const screenOf = (route: string) => {
  const path = route.split('?')[0]
  return NAV.flatMap(g => g.items).filter(i => path === i.path || (i.path !== '/' && path.startsWith(i.path + '/'))).sort((a, b) => b.path.length - a.path.length)[0]?.label ?? ''
}

// Every menu screen as a need of its own, found by its name and hint: the fallback that keeps a
// screen nobody wrote a need for reachable from the field
const SCREENS: Need[] = NAV.flatMap(g => g.items)
  .filter(i => i.path !== '/' && i.path !== '/documentacao')
  .map(i => ({ id: `screen:${i.path}`, route: i.path, title: i.label, steps: [i.hint], words: '' }))

export function findNeeds(query: string, limit = 5): NeedMatch[] {
  const q = tokens(query)
  if (!q.length) return []
  // A written need weighs more than a screen's own name: it says what to do there
  const rows = [
    ...NEEDS.map(n => ({ need: n, weight: 1, hits: tokenScores(q, tokens(`${n.title} ${n.words}`)) })),
    ...SCREENS.map(n => ({ need: n, weight: 0.75, hits: tokenScores(q, tokens(`${n.title} ${n.steps[0]}`)) })),
  ]
  // A word found in many needs ("application") tells less than one found in few ("slowness")
  const spread = q.map((_, i) => rows.filter(r => r.hits[i] > 0).length)
  const scored = rows.map(r => ({ need: r.need, score: r.weight * r.hits.reduce((sum, h, i) => sum + (h ? h / Math.sqrt(spread[i]) : 0), 0) }))
  const best = Math.max(0, ...scored.map(s => s.score))
  const seenRoutes = new Set<string>()
  return scored
    // Far below the best answer is noise: a shared common word, not the same task
    .filter(s => s.score > 0 && s.score >= best * 0.35)
    .sort((a, b) => b.score - a.score)
    // The screen fallback is dropped when a written need already points to that screen
    .filter(s => {
      const path = s.need.route.split('?')[0]
      if (s.need.id.startsWith('screen:') && seenRoutes.has(path)) return false
      seenRoutes.add(path)
      return true
    })
    .slice(0, limit)
    .map(s => ({ ...s.need, score: s.score, manual: slugOf(s.need.route), screen: screenOf(s.need.route) }))
}
