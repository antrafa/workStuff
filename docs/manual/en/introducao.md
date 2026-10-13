# What workStuff is

workStuff is a panel that runs on your own computer and puts the day-to-day work of a developer and of whoever looks after servers in one place: checking that the machine is ready, cloning code, following pipelines, looking at Kubernetes clusters and asking an AI for help, always under your control.

## Who it is for

- Developers who switch between code, Git, pipelines and environments all day and want one screen for it.
- Whoever supports applications running on Kubernetes and needs to look at pods, logs and incidents without memorizing commands.
- Anyone joining a team who needs to find out what is missing on the machine before starting to work.

It is a **personal** panel: it runs only on your computer, opens only in your browser and uses the tools you already have installed (`git`, `kubectl`, `docker`, and the AI programs `claude`, `codex` or `agy`). Nothing is exposed to the network, and the panel's data stays in the `~/.workstuff` folder on your computer.

If a word on this page is new to you, look it up in [Concepts and terms](/documentacao/conceitos).

## The main areas

The menu on the left splits the screens into groups. Each group answers one kind of question.

### Overview

Where you start. [Home](/) shows at a glance whether anything needs you: tasks in the Software Factory, the connected cluster, the machine and the local services ([manual page](/documentacao/inicio)). **Documentation** is this manual.

### Tools

Everyday helpers for your machine. [Machine](/maquina) says what is missing to work and how to fix it ([manual page](/documentacao/maquina)). [Team profile](/perfil) takes your setup to someone else ([manual page](/documentacao/perfil)). [Converters](/conversores) handles JWT, Base64, dates, JSON and more ([manual page](/documentacao/conversores)). [Local services](/servicos) shows ports, containers and your local applications ([manual page](/documentacao/servicos)). [Scheduled checks](/agenda) warns you when a pipeline, certificate or pod changes state ([manual page](/documentacao/agenda)). [Data generator](/gerador) creates test CPFs, CNPJs, people and companies ([manual page](/documentacao/gerador)).

### Development

The [Factory](/fabrica) turns a request ("add a filter to the orders screen") into code written, tested and reviewed by AI agents, in a separate copy of the repository, and only sends anything after you approve ([manual page](/documentacao/fabrica)). [Dev runbooks](/dev-runbooks) run ready-made Git, Docker and Node commands with confirmation ([manual page](/documentacao/dev-runbooks)).

### Deploy

What happens between your code and the server. [Repositories](/repositorios) connects to GitLab or GitHub and clones projects ([manual page](/documentacao/repositorios)). [Pipelines](/pipelines) follows the CI runs and has the AI explain a failure ([manual page](/documentacao/pipelines)). [Pre-MR review](/revisao) has the AI review your branch before you open the merge request ([manual page](/documentacao/revisao)). [Vulnerabilities](/vulnerabilidades) lists known flaws in a project's dependencies ([manual page](/documentacao/vulnerabilidades)).

### Kubernetes

Everything about a connected cluster. [Cluster](/cluster) shows pods, nodes and problems, with live logs, AI diagnosis and the Cluster Doctor chat ([manual page](/documentacao/cluster)). [Requests & Limits](/recursos) compares the memory and CPU declared in the manifests with real usage ([manual page](/documentacao/recursos)). [Logs](/logs) follows many pods at once ([manual page](/documentacao/logs)). [Timeline](/incidente) rebuilds an incident ([manual page](/documentacao/incidente)). [Compare environments](/comparar) shows what differs between two namespaces ([manual page](/documentacao/comparar)). [Upgrade](/upgrade) lists what breaks before a Kubernetes upgrade ([manual page](/documentacao/upgrade)). [Runbooks](/runbooks) runs procedures with `kubectl` steps ([manual page](/documentacao/runbooks)). [Performance](/performance) follows CPU, memory and restarts over time ([manual page](/documentacao/performance)).

### AI

Your AI material and the AI doing analysis work. [Catalog](/catalogo) gathers your skills, prompts, rules and personas and turns them on in the AI agents ([manual page](/documentacao/catalogo)). [Analysis](/analise) writes a report on a project's architecture ([manual page](/documentacao/analise)). [Playbooks](/playbooks) runs guided recipes in which the AI does each step ([manual page](/documentacao/playbooks)).

[Settings](/configuracoes), at the bottom of the menu, chooses the AI provider, the language, the theme and which screens show in the menu ([manual page](/documentacao/configuracoes)).

## How the interface works

### The sidebar and its groups

- The left column is the menu. Click a group name (for example **Kubernetes**) to open or close it; the number next to it is how many screens it has. The group of the screen you are on always stays open.
- Hover over a screen name to read in one line what it does.
- Click **workStuff**, at the top of the menu, to go back to [Home](/).
- On a narrow window (a phone, for example), the menu hides: click the menu icon at the top left to open it. It closes on its own when you change screens.

### Favorites and Alt + number

1. Open a screen you use often.
2. Click the star next to its name at the top of the page.
3. The screen shows up in **Favorites**, at the top of the menu, with a number from 1 to 9.
4. From then on, press **Alt** plus that number (for example **Alt+1**) to open it from anywhere.

You can have up to nine favorites. Click the star again to remove one.

### The command palette (Ctrl+K)

Press **Ctrl+K** (**Cmd+K** on a Mac), or click **Find screen** in the menu, to open a search box over the page.

- Type part of the name or of what the screen does: "logs", "certificate", "cpf". Accents and capital letters do not matter.
- Use the arrow keys to move, **Enter** to open and **Esc** to close.
- **Ctrl+D** adds the highlighted screen to the favorites, or removes it.
- With the box empty, it shows **Needs you now** (when the connected cluster has pods with problems), **Favorites · Alt 1–9**, **Recent** and **All screens**.

### The breadcrumb

At the top of the page you see the group and the screen you are on, for example **Kubernetes > Logs**. The favorites star sits right next to it.

### The environment stamp

At the top left there is a stamp that says where your actions land.

- **LOCAL** with "this machine": the screen works on your own computer.
- On the Kubernetes screens, with a cluster connected, the stamp shows the environment class of the cluster (**DES**, **ITG**, **HML** or **PRO**), the kubeconfig name and the context, plus a **switch** button that takes you to [Cluster](/cluster).
- On those screens the whole window also gets a frame and a label that repeats the rule: in development, integration and staging, actions ask for confirmation; in **PRO** (production) everything is read-only. A cluster with no class counts as **PRO** until you classify it.

> **Tip:** if you see the production frame, you can look but not change anything. That is on purpose.

When the connected cluster has pods with problems, a red link with the count appears at the top of every screen and takes you to the list of problems.

### The status bar

The thin bar at the bottom of the window shows that the local server is answering (and on which port), the version of `kubectl`, `docker` and `git`, and which AI programs are installed (`claude ok`, for example). A missing tool appears as **missing**. If the bar says **local server did not respond**, the panel's server is down: see [First steps](/documentacao/primeiros-passos).

### Help for each screen

Each screen has a **?** icon next to its title and a **How to use this screen** link under it. Both open the screen's page of this manual in a window over the screen, so you do not lose what you were doing. The **Open in the documentation** button takes you to the full page.

### The Documentation screen

**Documentation** (in the **Overview** group) is the whole manual.

- The column on the left lists the pages by section, in the same order as the menu. The box **Search the documentation** filters the pages that contain the word you type.
- **On this page**, on the right, lists the headings of the page you are reading; click one to jump to it.
- On a screen's page, **Open this screen** takes you to the screen itself.
- At the bottom, **Previous** and **Next** walk through the manual in order.

### Light or dark theme

The sun or moon icon at the top right switches between the light and the dark theme right away. In [Settings](/configuracoes) you also find **Automatic**, which follows your operating system, and the accent color.

### Language

The panel speaks English and Portuguese. The quickest way to switch is the **EN | PT** switch in the top bar, next to the theme button: click the language you want and the page reloads in it. The same choice is also in [Settings](/configuracoes), under **Appearance** > **Language**.

### Shutting the panel down

1. Click the red power icon at the top right.
2. Read the warning and click **Shut down**.
3. When **workStuff stopped** appears, click **Close tab**.

The panel refuses to shut down while a Software Factory run is in progress: stop the run first. To start it again, use the **workStuff** app shortcut or run `npm run dev` (see [First steps](/documentacao/primeiros-passos)).

## Good to know

- The AI providers always run in read-only mode on your code and clusters. The only place where an AI writes code is the [Factory](/fabrica), and even then in a separate copy of the repository, never in your folder.
- Theme, accent color, favorites and hidden menu items are saved in this browser. The AI provider and the language are saved on your computer, in `~/.workstuff`.
