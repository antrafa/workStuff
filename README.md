# workStuff

A local, single-user web panel for day-to-day developer and DevOps work: checking that a workstation is set up, cloning repositories, inspecting Kubernetes clusters, watching pod performance, and running AI coding agents in **read-only** mode against your code and clusters.

It runs entirely on your machine. The API binds to `127.0.0.1` only, keeps its data in `~/.workstuff` (never in the repository), and calls the CLIs you already have installed (`kubectl`, `git`, `claude`, ...).

> The user interface is in English by default, with Brazilian Portuguese (pt-BR) as an option in Configurações. What the AI agents write, and the runbook and playbook content, is still in Portuguese.

Architecture and the software factory are documented in [`docs/`](docs/README.md) (in Portuguese): [architecture](docs/arquitetura.md) and [factory](docs/fabrica.md).

## Table of contents

- [Features](#features)
- [Security model](#security-model)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Data directory](#data-directory)
- [Available scripts](#available-scripts)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Tech stack](#tech-stack)
- [Contributing](#contributing)
- [License](#license)

## Features

The menu groups, in this order: Overview, Tools, Development, Deploy, Kubernetes and AI. Each item shows a short tag beside its name saying what kind of page it is (`live`, `kubectl`, `ai`, `clone`…). Development holds the Factory and the Dev runbooks, described in [`docs/fabrica.md`](docs/fabrica.md).

### Tools

| Page | Route | What it does |
|---|---|---|
| **Machine** (Máquina) | `/maquina` | Checks the workstation and shows each item as ok, missing or warning, with a suggested fix. Covers base tools (git, curl, zip), credentials (git identity, SSH key, `~/.m2/settings.xml`, `~/.npmrc`), Java/Maven via SDKMAN, Node via NVM, Docker, kubectl and kubeconfigs, AI CLIs, IDEs, disk space and network reachability. The check itself changes nothing. A fix only runs when you click it, and only for items marked as automatic. |
| **Local services** (Serviços locais) | `/servicos` | Three tabs. **Ports and Docker** lists listening ports with the owning process (flagging the ones open to the network) and lets you stop the owner of a port (TERM, or KILL with **Force**); it also lists Docker containers, images, volumes and compose projects, to start, stop, restart or delete. Every action shows the exact command first, and deleting a volume asks you to type its name. **Applications** registers local apps (folder, command, port, URL) to start, stop, restart and follow their log; the registry lives in `~/.workstuff/apps/`. **K8s Tunnels** opens named `kubectl port-forward` tunnels, grouped in profiles, bound to `127.0.0.1`; the registry lives in `~/.workstuff/tunnels/`. |
| **Team profile** (Perfil de equipe) | `/perfil` | Exports the Machine checks (versions, registries, URLs), the repository connections (never the tokens) and the Catalog folders and active items to a JSON file, and imports one with a preview of what changes. Catalog activations are listed to be done by hand. |
| **Converters** (Conversores) | `/conversores` | JWT decoding with an expiry check, Base64/base64url, URL encoding, timestamp conversion, UUID v4, cron next-run preview, JSON format/minify/validate (with line and column of the error), JSON ↔ YAML, line diff, regex tester and SHA hashes. Runs in the browser. |
| **HTTP requests** (Requisições HTTP) | `/requisicoes` | Calls an endpoint and shows status, time, headers and the body (JSON formatted). Requests are saved in groups, environments fill `{{variables}}` (HML, PRO...), and a curl command goes in (**Import curl**, e.g. from the browser's DevTools) and out (**Copy as curl**). The request leaves from the local server, so there is no CORS and a tunnel on 127.0.0.1 works; saved requests and environments live in `~/.workstuff/http-requests.json` (mode `600`). |
| **Scheduled checks** (Verificações agendadas) | `/agenda` | While the server is running, periodically checks what you register (a broken pipeline, a certificate close to expiry, pods in a critical state, critical vulnerabilities in a project) and sends a desktop notification only when the state changes. |
| **Data generator** (Gerador de dados) | `/gerador` | Generates Brazilian test data: people, CPF, CNPJ (including the new alphanumeric format), names, addresses and companies, with an optional state (UF) filter. Runs in the browser. |

### Deploy

| Page | Route | What it does |
|---|---|---|
| **Repositories** (Repositórios) | `/repositorios` | Connects to GitLab or GitHub, lets you browse groups and projects, and clones them into a workspace folder that mirrors the group hierarchy. A token can be typed in the UI, read from `GITLAB_TOKEN`/`GITHUB_TOKEN`, or taken from `gh auth token`. The **My Workspace** tab scans the local clones for uncommitted work, stashes, branches already in the default branch and build artifacts, with one-click fetch, prune and artifact cleaning. **Search the clones** finds a text in every clone at once (`git grep`, following each `.gitignore`), grouped by project with file and line. |
| **Review before MR** (Revisão antes do MR) | `/revisao` | Diffs the current branch of a local repository against its base (`origin/HEAD` by default, optionally including uncommitted changes), and an AI agent in read-only mode, reading the surrounding code, lists the problems by severity with file and line, plus a paragraph for the MR description. A second tab reviews an open GitLab MR or GitHub PR fetched through the API. **My queue** lists, across every connection, the MRs/PRs waiting for your review and the ones you opened, with what blocks each merge (conflict, failed pipeline, missing approval...). |
| **Vulnerabilities** (Vulnerabilidades) | `/vulnerabilidades` | Reads the direct dependencies of a project (`package.json` with the exact `package-lock.json` version, `pom.xml` with properties resolved), looks them up in the public [OSV](https://osv.dev) database and the public registries, and shows known vulnerabilities by severity, the fixed versions and how many major versions behind each dependency is. With [trivy](https://trivy.dev) installed, it also scans the whole project (transitive dependencies) and container images. |
| **Pipelines** | `/pipelines` | Shows the latest GitLab CI or GitHub Actions pipeline of each project you follow, grouped by parent group (collapsed on load, with a count of failed and running ones); a row's pipelines and jobs open right under it. Projects are followed by browsing the connection's groups or by pasting the path or the full project URL, which also picks the connection on that host. For a failed job, **Explain failure** sends the end of the log to an AI agent in read-only mode, which also reads the code when the project is cloned. Refreshes every 30 s. |

### Kubernetes

| Page | Route | What it does |
|---|---|---|
| **Cluster** | `/cluster` | Pick a kubeconfig and context, then browse namespaces, pods, nodes, events and pod details. Logs stream live (`-f`, `--previous`, `--tail`). A **Problems** tab lists failing workloads, and **Diagnose** sends a pod's logs and events to an AI agent for a read-only explanation. The only write action is restarting the owning Deployment, StatefulSet or DaemonSet. |
| **Cluster Doctor** | `/cluster/doctor` | A chat with an AI agent that investigates the connected cluster with `kubectl`. It can read on its own. Any change it suggests appears as a card you approve or reject; on approval the panel runs it (see [Security model](#security-model)). |
| **Requests & Limits** | `/recursos` | Reads Kubernetes manifests and `.env` files from a GitLab group (each subgroup is a client, each project a stack) and extracts CPU/memory requests and limits plus JVM flags (`Xms`, `Xmx`, metaspace). When a stack is linked to a namespace, it compares the declared values with live usage and recommends changes. |
| **Incident timeline** (Linha do tempo) | `/incidente` | For a namespace and a time window, merges events, container restarts (with the last termination reason), rollouts (from ReplicaSets) and error lines from the previous logs of restarted pods into one timeline, and asks an AI agent for a post-mortem draft. Read-only. |
| **Logs** | `/logs` | Follows the logs of every pod of one or more applications at once (by label selector, like `stern`), interleaved, with a color per pod, text filter and pause. Read-only. |
| **Compare environments** (Comparar ambientes) | `/comparar` | Picks two kubeconfig/context/namespace pairs (e.g. HML and PRO) and shows, for each Deployment, StatefulSet and CronJob, the differences in image tag, replicas, requests and limits, environment variables and probes. Secrets are never read, and plain-text variables whose name looks like a password, token or key are masked. When an image tag differs, **What changes** lists the commits and MRs between the two versions from a local clone. Read-only. |
| **Upgrade** | `/upgrade` | Before a Kubernetes upgrade, lists what breaks on the target version: objects applied with a removed API (read from the `kubectl apply` annotation), recent calls to deprecated APIs (apiserver metrics), and removed APIs in a repository's manifests. It also checks the TLS certificate served by each ingress host (without reading Secrets) and the client certificate expiry of each kubeconfig. Read-only. |
| **Runbooks** | `/runbooks` | Markdown procedures from a folder you choose, where each line of a ```bash block is a `kubectl` step with optional `{{variables}}`. Read steps run directly; write steps go through the same command parser and environment policy as the Cluster Doctor and wait for your confirmation. Every run is audited. |
| **Performance** | `/performance` | Creates *observations* of up to 20 pods and samples CPU, memory, restarts, throttling and events at a fixed interval (minimum 15 s). It can also read Rancher Monitoring Prometheus and Istio/Envoy ingress stats. Observations resume after a server restart, and an AI report can be generated from up to 72 h of history. |

### AI

| Page | Route | What it does |
|---|---|---|
| **Catalog** (Catálogo) | `/catalogo` | Scans folders you choose for skills, prompts, rules, personas and templates, then enables them per agent (Claude Code, Codex, Gemini, OpenCode). Skills are enabled with a symlink; rules and personas go into a marked block in the agent's instruction file (e.g. `~/.claude/CLAUDE.md`). Files the panel did not create are never touched. You can also search and install skills from [skills.sh](https://skills.sh). |
| **Analysis** (Análise) | `/analise` | Pick a project folder and an AI agent writes a full architecture report in read-only mode. Reports are cached per git commit. You can chat about the report, save it into the project under `docs/arquitetura`, and view an existing `graphify-out/graph.html`. |

**Documentation** (Documentação, `/documentacao`) is the user manual: a step-by-step guide to every page, a glossary and a first-session walkthrough, with search. Every page also has a **?** next to its title and a **How to use this screen** link that opens that page of the manual in a popup. The texts live in `docs/manual/{en,pt}/` (how to write them: `docs/manual/README.md`), and `npm run check` fails if a menu page has none or a language is missing.

### Navigation

- **Home** opens with a **What do you need to do?** field: the task in your own words (English or Portuguese) returns the screens that do it, with the first steps and a link to the manual, plus shortcuts for the common tasks. Below it, **For the stand-up** builds a summary of your commits since the last working day, your open MRs and the broken pipelines.
- **Ctrl K** (Cmd K on macOS) opens a palette to jump to any page by name or by what it does. `Ctrl D` inside it pins the highlighted page.
- **Favorites**: the star next to the breadcrumb pins a page to the top of the menu; `Alt 1`–`Alt 9` open favorites by position.
- **Environment frame**: on Kubernetes pages the window gets a frame whose weight grows with the risk of the connected cluster (thin for DES, dashed for ITG, thick for HML, hatched for PRO and unclassified). Other pages show `LOCAL`.
- The status bar at the bottom shows the local server and the versions of kubectl, docker and git, plus which AI CLIs are installed.

**Settings** (`/configuracoes`) picks the AI provider, model and effort. It also holds the theme (dark, light, auto), the accent color, and which menu items are shown.

## Security model

workStuff runs commands on your machine and against real clusters, so its defaults are restrictive.

- **Local only.** The API listens on `127.0.0.1` and must not be exposed to a network. Requests whose `Host` or `Origin` is not localhost get 403, so a web page open in the browser cannot drive it.
- **No shell.** Processes are started directly. The only exception is the Machine page's automatic fixes, which come from a fixed table on the server and never from the request.
- **Registered applications run what you typed.** The Local services page starts the command you registered, as your user, without a shell. Only the local API can register or start one (see *Local only*).
- **Tunnels use your kubeconfig.** The K8s Tunnels tab runs `kubectl port-forward` with the kubeconfig you chose and its full permissions, listening on `127.0.0.1` only. This is the panel opening the tunnel at your request, unlike the Cluster Doctor's agent, which can never port-forward. A tunnel to `HML`, `PRO` or an unclassified cluster needs an explicit confirmation, and the environment never comes from the namespace.
- **Read-only AI agents.** No provider runs with auto-approve:
  - `claude` gets only the `Read`, `Grep` and `Glob` tools, with `--strict-mcp-config`.
  - `codex` runs with `-s read-only`.
  - `agy` (Antigravity) always runs inside a sandbox ([bubblewrap](https://github.com/containers/bubblewrap) on Linux, `sandbox-exec` on macOS), with writes blocked outside its own state folder. It is refused without one, because in testing it wrote to disk even in plan/sandbox mode.
  - **Read-confined where `bwrap` exists.** Read-only alone would still let an agent read any file you can, so every AI run (the panel's screens and the factory's read-mode agents) goes through a read jail (`server/lib/ai/jail.ts`): inside it your home, `/tmp` and `/run/user` are empty, and only the folder of that run, the CLI's own binary and a private config home with a copy of its login (the access token, never the refresh token) are mounted back. The environment is cleared down to locale, proxy and the provider's own variables, so a `GITLAB_TOKEN` or `KUBECONFIG` of the server is not visible either.
  - On macOS the read jail uses `sandbox-exec`, which can only deny reads by path: the environment is cleared the same way, and the folders that hold credentials (`~/.ssh`, `~/.kube`, `~/.config`, `~/.aws`, `~/.docker`, the real CLI logins, `~/.workstuff`) are hidden, but the rest of the home stays readable. Without any sandbox (Windows) the agents run read-only but not confined.
  - The remote MR review, whose title, description and diff are written by someone else, runs only under `bwrap`: on macOS and Windows it refuses to run. Images in AI answers are always shown as text and never loaded, so an injected instruction cannot send data out through an image URL.
- **Environment policy for clusters.** Each kubeconfig is classified as `DES`, `ITG`, `HML` or `PRO` by its name, or by hand.
  - `PRO` is read-only.
  - An unclassified kubeconfig is treated as `PRO`.
  - Node actions (cordon, drain, taint) are never allowed.
  - `DES` never allows deletes.
- **Cluster Doctor guardrails** (Claude Code only, since it is the only supported CLI with a native tool hook):
  - **Scoped access.** The agent receives a temporary kubeconfig containing only the selected context (directory mode `700`, files `600`), which is deleted afterwards.
  - **Command check.** A `PreToolUse` hook checks every command before it runs. The command must be exactly one `kubectl` call with no pipes, chaining, redirection or substitution. Flags that change the target (`--kubeconfig`, `--context`, `--server`, `--token`, `--as`, ...) are rejected.
  - **Blocked operations.** Secrets, `exec`, `cp`, `port-forward`, `create` and `run` are always refused.
  - **Writes.** The agent cannot write on its own. It proposes the command, and you approve or reject it. On approval the server checks the command against the policy again and runs it itself.
  - **Audit.** Every attempt is logged to `~/.workstuff/doctor-audit.log`, each line chained to the previous one by hash (`server/lib/auditLog.ts`), as are the runbook logs; the Machine page warns when a chain is broken.
- **HTTP requests go out from the server.** The HTTP requests screen sends what you typed, to any `http://` or `https://` address the machine reaches, including `127.0.0.1`. Only the local API can ask for it (see *Local only*). Invalid TLS certificates are never skipped.
- **Credentials.** Tokens typed in the UI are stored with mode `600`. Git receives them through a temporary askpass helper, never in the clone URL.

## Requirements

**Required**

- **Node.js 22.18 or newer**. The server runs TypeScript directly with Node's native type stripping. It is tested on Node 24.
- **npm**
- **git** and **ssh**
- **Linux, macOS or Windows**. Linux is the tested platform. On macOS and Windows the Machine page suggests `brew` and `winget` commands, which have not been tested on real machines yet, and Antigravity is unavailable because bubblewrap only exists on Linux.

**Required for each feature**

| Tool | Needed for |
|---|---|
| [`kubectl`](https://kubernetes.io/docs/tasks/tools/) | Cluster, Cluster Doctor, Requests & Limits, Performance |
| At least one AI CLI: [`claude`](https://docs.claude.com/en/docs/claude-code) (Claude Code), [`codex`](https://github.com/openai/codex), or `agy` (Antigravity) | Diagnose, Analysis, Catalog review, Performance reports |
| `claude` specifically | Cluster Doctor |
| `bwrap` (package `bubblewrap`) | Linux: using `agy`; confining what every AI agent can read; write-mode factory agents and the verification suite; the remote MR/PR review |
| `sandbox-exec` (built into macOS) | macOS: using `agy`; write-mode factory agents and the verification suite; hiding credential folders from AI agents |
| `zenity` or `kdialog` (Linux), `osascript` (macOS) | Native folder picker |
| `gh` | Using the GitHub CLI token as a repository credential |
| `npx` | Installing skills from skills.sh |
| `trivy` | Full project and image scans on the Vulnerabilities page |
| `code` or `xdg-open`/`open` | Opening files in your editor |

The **Machine** page reports which of these are missing on your workstation.

## Getting started

```bash
git clone https://github.com/antrafa/workStuff.git
cd workStuff
npm install
npm run dev
```

`npm run dev` starts both processes:

- **Web UI:** <http://localhost:5180> (Vite)
- **API:** <http://127.0.0.1:3101> (Express). The Vite dev server proxies `/api` to it.

These ports differ from the Vite and Express defaults (5173/3001), so workStuff can run next to other projects.

Then open the **Machine** page to see what your workstation is missing, and **Settings** to choose your AI provider.

### Production build

```bash
npm run build     # typecheck + vite build into dist/
npm run preview   # serve the built UI
```

The API is started separately with `npm run server`.

### One-click launcher (macOS & Linux)

To start workStuff with a single click from your desktop, dock or application menu:

```bash
npm run launcher:install
```

- **macOS:** Creates `workStuff.app` in `~/Applications` with a native Retina icon. Pin it to your Dock or search via Spotlight (`Cmd + Space` → `workStuff`).
- **Linux:** Installs `workstuff.desktop` into `~/.local/share/applications`, making it available in your system app launcher (GNOME, KDE, etc.).

Add `--desktop` to also create an icon on your desktop (`npm run launcher:install -- --desktop`).

With Chrome or Chromium installed, the panel opens in its own app window (no tabs or address bar) with the workStuff icon, using a separate Chrome profile in `~/.workstuff/chrome-app`; links opened from the panel use that profile too, without your usual Chrome logins. On GNOME (X11) the window gets a dark title bar. Without Chrome, it opens in the default browser.
To manage the background instance from the terminal:

```bash
./scripts/workstuff-launcher.sh status
./scripts/workstuff-launcher.sh stop
./scripts/workstuff-launcher.sh restart
```

## Configuration

All configuration is optional.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3101` | API port. The Vite proxy follows it. |
| `WORKSTUFF_HOME` | `~/.workstuff` | Where the panel stores its data. |
| `WORKSTUFF_KUBE_DIR` | `~/.kube` | Folder scanned for kubeconfig files. |
| `WORKSTUFF_AGENT_HOME` | your home directory | Base folder for agent config (`~/.claude`, `~/.codex`, `~/.agents/skills`, ...). |
| `WORKSTUFF_EDITOR` | `code` | Command used to open files. Falls back to `xdg-open` (or `open` on macOS). |
| `GITLAB_TOKEN` / `GITHUB_TOKEN` | — | Token for a repository connection whose token source is set to the environment variable. |

To try the panel without touching your real data, point `WORKSTUFF_HOME`, `WORKSTUFF_KUBE_DIR` and `WORKSTUFF_AGENT_HOME` at temporary folders, and set `PORT` to a free port.

Everything else is configured in the UI and saved under the data directory:

- AI provider and model (Settings)
- Expected tool versions and registries (Machine → config)
- Repository connections (Repositories)
- Cluster environment classes (Cluster)

## Data directory

All state lives in `WORKSTUFF_HOME` (default `~/.workstuff`), outside the repository:

| Path | Contents |
|---|---|
| `settings.json` | AI provider, model and effort |
| `models-cache.json` | Model lists read from the AI CLIs |
| `doctor-config.json` | Expected Java/Maven/Node versions, registries, URLs |
| `repo-sources.json`, `git-credentials.json` | Repository connections and tokens (mode `600`) |
| `cluster-session.json`, `cluster-environments.json` | Selected kubeconfig/context and environment classes |
| `resources-namespace-links.json` | Stack ↔ namespace links for Requests & Limits |
| `http-requests.json` | Saved HTTP requests and environments (mode `600`: headers and variables may hold tokens) |
| `doctor-audit.log`, `runbook-audit.log`, `dev-runbook-audit.log` | Every command the Cluster Doctor agent tried and every runbook step run, hash-chained |
| `factory/learnings.jsonl` | Lessons from the Factory's reviews, when the Mentat vault (`~/.mentat`) is not installed |
| `analysis/` | Architecture report history |
| `performance/` | Observations, samples (`.jsonl`) and reports |

UI preferences (theme, accent color, hidden menu items) are kept in the browser's `localStorage`.

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Runs the API (with `--watch`) and the Vite dev server together |
| `npm run server` | Runs only the API |
| `npm run client` | Runs only the Vite dev server |
| `npm run typecheck` | Type-checks the frontend and the server |
| `npm run build` | Type-checks, then builds the UI into `dist/` |
| `npm run preview` | Serves the built UI |
| `npm run check` | Runs all self-checks (see [Testing](#testing)) |

## Project structure

```
workStuff/
├── index.html            # Vite entry
├── public/               # Static assets (favicon)
├── scripts/              # Standalone self-check scripts
├── server/               # Express 5 API, run directly by Node
│   ├── index.ts          # App setup and route registration
│   ├── routes/           # One router per feature (k8s, catalog, repos, ...)
│   └── lib/              # Feature logic, one folder per feature
│       ├── ai/           # AI CLI argument building, event parsing, runner
│       ├── doctorAi/     # Cluster Doctor: command parser, hook, scoped runs
│       ├── k8s/          # kubectl wrapper, kubeconfigs, environment policy
│       └── ...
└── src/                  # React 18 frontend
    ├── app/              # Router, layout, navigation, theme
    ├── features/         # One folder per page (cluster, catalog, analysis, ...)
    ├── ui/               # Shared components
    ├── lib/              # Shared frontend helpers
    └── styles/           # Design tokens and global CSS
```

Code is organized by feature. Each page has a folder in `src/features/` and a router in `server/routes/`, and most also have their logic in `server/lib/`.

## Testing

There is no test framework. Modules carry their own `node:assert`-based self-checks, run with `--selfcheck`, and a few standalone scripts live in `scripts/`:

```bash
npm run check
```

This covers the parts most likely to break silently: the AI CLI argument builders and event parsers, the Cluster Doctor command parser and hook, the cluster environment policy, the manifest and metrics parsers, catalog discovery and activation (run in a temporary home), and the data generator.

The Machine self-check runs the real diagnosis on your workstation. It also checks that no automatic fix uses `sudo`.

Before opening a pull request, run:

```bash
npm run typecheck && npm run check
```

## Tech stack

- **Frontend:** React 18, React Router 7, Vite, `react-markdown` + `remark-gfm`, Mermaid, Lucide icons
- **Backend:** Express 5 in TypeScript, run by Node with no build step
- **Kubernetes:** the `kubectl` CLI (no client library)
- **AI:** Claude Code, OpenAI Codex and Google Antigravity CLIs

## Contributing

1. Create a branch named after the change (`fix/pod-logs-timeout`, `feat/ingress-panel`).
2. Follow the existing layout:
   - New pages go under `src/features/<name>/`.
   - New API routes go in `server/routes/<name>.ts` and are registered in `server/index.ts`.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat(cluster): ...`, `fix(repos): ...`), with one logical change per commit.
4. Make sure `npm run typecheck` and `npm run check` pass.
5. Never test write operations against a real cluster you do not own.

## License

No license has been granted. This is a private repository, and all rights are reserved by the author.
