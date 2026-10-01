# workStuff

A local, single-user web panel for day-to-day developer and DevOps work: checking that a workstation is set up, cloning repositories, inspecting Kubernetes clusters, watching pod performance, and running AI coding agents in **read-only** mode against your code and clusters.

It runs entirely on your machine. The API binds to `127.0.0.1` only, keeps its data in `~/.workstuff` (never in the repository), and calls the CLIs you already have installed (`kubectl`, `git`, `claude`, ...).

> The user interface is in Brazilian Portuguese (pt-BR). This README is in English.

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

The menu is split into four groups.

### Deploy

| Page | Route | What it does |
|---|---|---|
| **Machine** (Máquina) | `/maquina` | Checks the workstation and shows each item as ok, missing or warning, with a suggested fix. Covers base tools (git, curl, zip), credentials (git identity, SSH key, `~/.m2/settings.xml`, `~/.npmrc`), Java/Maven via SDKMAN, Node via NVM, Docker, kubectl and kubeconfigs, AI CLIs, IDEs, disk space and network reachability. The check itself changes nothing. A fix only runs when you click it, and only for items marked as automatic. |
| **Repositories** (Repositórios) | `/repositorios` | Connects to GitLab or GitHub, lets you browse groups and projects, and clones them into a workspace folder that mirrors the group hierarchy. A token can be typed in the UI, read from `GITLAB_TOKEN`/`GITHUB_TOKEN`, or taken from `gh auth token`. |

### Kubernetes

| Page | Route | What it does |
|---|---|---|
| **Cluster** | `/cluster` | Pick a kubeconfig and context, then browse namespaces, pods, nodes, events and pod details. Logs stream live (`-f`, `--previous`, `--tail`). A **Problems** tab lists failing workloads, and **Diagnose** sends a pod's logs and events to an AI agent for a read-only explanation. The only write action is restarting the owning Deployment, StatefulSet or DaemonSet. |
| **Cluster Doctor** | `/cluster/doctor` | A chat with an AI agent that investigates the connected cluster with `kubectl`. It can read on its own. Any change it suggests appears as a card you approve or reject; on approval the panel runs it (see [Security model](#security-model)). |
| **Requests & Limits** | `/recursos` | Reads Kubernetes manifests and `.env` files from a GitLab group (each subgroup is a client, each project a stack) and extracts CPU/memory requests and limits plus JVM flags (`Xms`, `Xmx`, metaspace). When a stack is linked to a namespace, it compares the declared values with live usage and recommends changes. |
| **Performance** | `/performance` | Creates *observations* of up to 20 pods and samples CPU, memory, restarts, throttling and events at a fixed interval (minimum 15 s). It can also read Rancher Monitoring Prometheus and Istio/Envoy ingress stats. Observations resume after a server restart, and an AI report can be generated from up to 72 h of history. |

### Tools

| Page | Route | What it does |
|---|---|---|
| **Converters** (Conversores) | `/conversores` | JWT decoding with an expiry check, Base64/base64url, URL encoding, timestamp conversion, UUID v4 and cron next-run preview. Runs in the browser. |
| **Data generator** (Gerador de dados) | `/gerador` | Generates Brazilian test data: people, CPF, CNPJ (including the new alphanumeric format), names, addresses and companies, with an optional state (UF) filter. Runs in the browser. |

### AI

| Page | Route | What it does |
|---|---|---|
| **Catalog** (Catálogo) | `/catalogo` | Scans folders you choose for skills, prompts, rules, personas and templates, then enables them per agent (Claude Code, Codex, Gemini, OpenCode). Skills are enabled with a symlink; rules and personas go into a marked block in the agent's instruction file (e.g. `~/.claude/CLAUDE.md`). Files the panel did not create are never touched. You can also search and install skills from [skills.sh](https://skills.sh). |
| **Analysis** (Análise) | `/analise` | Pick a project folder and an AI agent writes a full architecture report in read-only mode. Reports are cached per git commit. You can chat about the report, save it into the project under `docs/arquitetura`, and view an existing `graphify-out/graph.html`. |

**Settings** (`/configuracoes`) picks the AI provider, model and effort. It also holds the theme (dark, light, auto), the accent color, and which menu items are shown.

## Security model

workStuff runs commands on your machine and against real clusters, so its defaults are restrictive.

- **Local only.** The API listens on `127.0.0.1` and must not be exposed to a network.
- **No shell.** Processes are started directly. The only exception is the Machine page's automatic fixes, which come from a fixed table on the server and never from the request.
- **Read-only AI agents.** No provider runs with auto-approve:
  - `claude` gets only the `Read`, `Grep` and `Glob` tools, with `--strict-mcp-config`.
  - `codex` runs with `-s read-only`.
  - `agy` (Antigravity) always runs inside [bubblewrap](https://github.com/containers/bubblewrap), with the filesystem mounted read-only. It is refused if `bwrap` is missing, because in testing it wrote to disk even in plan/sandbox mode.
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
  - **Audit.** Every attempt is logged to `~/.workstuff/doctor-audit.log`.
- **Credentials.** Tokens typed in the UI are stored with mode `600`. Git receives them through a temporary askpass helper, never in the clone URL.

## Requirements

**Required**

- **Node.js 22.18 or newer**. The server runs TypeScript directly with Node's native type stripping. It is tested on Node 24.
- **npm**
- **git** and **ssh**
- **Linux or macOS**, plus `bash` and `which`

**Required for each feature**

| Tool | Needed for |
|---|---|
| [`kubectl`](https://kubernetes.io/docs/tasks/tools/) | Cluster, Cluster Doctor, Requests & Limits, Performance |
| At least one AI CLI: [`claude`](https://docs.claude.com/en/docs/claude-code) (Claude Code), [`codex`](https://github.com/openai/codex), or `agy` (Antigravity) | Diagnose, Analysis, Catalog review, Performance reports |
| `claude` specifically | Cluster Doctor |
| `bwrap` (package `bubblewrap`) | Using `agy` |
| `zenity` or `kdialog` (Linux), `osascript` (macOS) | Native folder picker |
| `gh` | Using the GitHub CLI token as a repository credential |
| `npx` | Installing skills from skills.sh |
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
| `doctor-audit.log` | Every command the Cluster Doctor agent tried |
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
