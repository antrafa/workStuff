# Concepts and terms

A glossary of the words the panel uses, explained for someone who is not a specialist. Each term says, when it helps, which screen uses it.

## Git and code review

### Repository

The folder that holds a project's code together with its whole change history. It lives on GitLab or GitHub and you keep a copy (a clone) on your computer. See [Repositories](/repositorios).

### Branch

A separate line of work inside the same repository. You change code in your branch (for example `feature/csv-export`) without touching the main one, usually `main`, until the work is ready.

### Commit

A saved snapshot of a set of changes, with a message saying what changed and why. A branch is a sequence of commits.

### Diff

The list of differences between two versions of the code: which lines were added, removed or changed. [Pre-MR review](/revisao) and the [Factory](/fabrica) show the diff of your branch against the base.

### Merge

Bringing the commits of one branch into another, for example from your branch into `main`. The [Factory](/fabrica) can do a local merge on your computer, without sending anything.

### MR / PR

Merge request (GitLab) or pull request (GitHub): the request to bring a branch into another, where colleagues read the diff and comment before the merge. [Pre-MR review](/revisao) looks at your branch before you open one.

### Worktree

A second working folder of the same repository, on another branch, that does not interfere with your folder. The [Factory](/fabrica) does all its work in worktrees under `~/.workstuff/worktrees`, so your checkout is never touched.

### CI pipeline

The sequence of automatic steps (build, tests, deploy) that GitLab CI or GitHub Actions runs on each change. Each step is a job. See [Pipelines](/pipelines).

### Token

A personal access key, created in GitLab or GitHub, that lets the panel act on your behalf, like a password with limited permissions. The panel saves it only on your computer and never puts it in a clone address. See [Repositories](/repositorios).

## Kubernetes

### Cluster

A group of machines that Kubernetes manages as one, where the applications run. The [Cluster](/cluster) screen connects to one at a time.

### Kubeconfig

The file that says how to reach a cluster: its address and your credentials. They live in the `~/.kube` folder. The panel lists them in [Cluster](/cluster) and lets you add one.

### Context

Inside a kubeconfig, a named combination of cluster, user and default namespace. A file can have several contexts; you pick one when connecting.

### Namespace

A named partition inside a cluster that groups an application's pieces, for example `orders-hml`. Most Kubernetes screens ask which namespace to look at.

### Pod

The smallest thing that runs in Kubernetes: one or more containers of an application running together. When an application has a problem, it is usually a pod that fails, restarts or does not start.

### Node

One of the machines of the cluster, where the pods run. The [Cluster](/cluster) screen lists them.

### Deployment

The Kubernetes description of an application: which image to run, how many copies and with which settings. Kubernetes creates and replaces the pods to match it. StatefulSet and DaemonSet are variations for other kinds of application.

### Replica

Each copy of an application's pod. Three replicas means three identical pods sharing the work. [Compare environments](/comparar) shows when two environments have different replica counts.

### Requests and limits

How much CPU and memory a pod reserves (request) and the most it may use (limit). Above the memory limit the pod is killed; above the CPU limit it slows down (throttling). See [Requests & Limits](/recursos).

### Restart

When a container stops and Kubernetes starts it again. Many restarts point to a problem, such as running out of memory. In [Cluster](/cluster), "restart" is also the action that recreates the pods of a Deployment, StatefulSet or DaemonSet, only allowed in DES, ITG and HML.

### Rollout

The rollout of a new version of a Deployment: Kubernetes replaces the old pods with new ones. The [Timeline](/incidente) shows each rollout next to the errors.

### Logs

The text messages an application writes while it runs. See them per pod in [Cluster](/cluster), or for several pods at once in [Logs](/logs).

### Events

Short notices Kubernetes itself records about what happened to a pod or node: "image could not be pulled", "killed for lack of memory", "scheduled on node X". They help explain a failure.

### Certificate

The file that proves a site's or service's identity and encrypts the connection (TLS). It has an expiry date; an expired certificate takes the service down. [Upgrade](/upgrade) and [Scheduled checks](/agenda) warn before that happens.

### Deprecated API

A resource format that Kubernetes announced it will drop and then removes in a newer version. A manifest that still uses it stops working after the upgrade. [Upgrade](/upgrade) lists them.

### Environment class

The panel's own label for each kubeconfig: **DES** (development), **ITG** (integration), **HML** (staging) or **PRO** (production). It decides what the panel lets you do: PRO is read-only, DES never deletes, and an unclassified cluster counts as PRO.

## AI and agents

### AI provider

The AI program installed on your computer that the panel calls: **Claude Code** (`claude`), **OpenAI Codex** (`codex`) or **Google Antigravity** (`agy`). You choose it in [Settings](/configuracoes).

### Model

The AI "brain" the provider uses, such as `opus` or `sonnet` in Claude Code. Larger models are more careful and more expensive; smaller ones are faster and cheaper.

### Prompt

The text with the instructions given to the AI. Some screens let you write your own; others build the prompt for you.

### Agent

An AI with a specific role, its own instructions and a set of tools it may use, for example the Reviewer that reads a diff and points out problems. The [Factory](/fabrica) and the Cluster Doctor, in [Cluster](/cluster), use agents.

### Skill

A package of instructions for a specific kind of task that the AI loads when it needs it. The [Catalog](/catalogo) turns your skills on in the AI agents.

### Persona

A description of how the AI should behave or whose point of view it should take, for example "experienced reviewer". Managed in the [Catalog](/catalogo).

### Rule

A standing instruction the AI must follow in every answer, such as a coding standard. Managed in the [Catalog](/catalogo).

### Playbook

A Markdown recipe whose steps are prompts the AI runs one after the other. See [Playbooks](/playbooks).

### Runbook

A Markdown procedure whose steps are commands. In [Runbooks](/runbooks) they are `kubectl` commands on the cluster; in [Dev runbooks](/dev-runbooks), local Git, Docker and Node commands. Each step runs through the panel, with confirmation when it changes something.

### Read-only mode

How the panel always calls the AI on your code and clusters: it can read and search, but cannot write files or run commands that change anything. Changes in the cluster are proposed by the AI and run by the panel only after you confirm.

### Sandbox (bwrap jail)

An isolated space where a program runs seeing the rest of the computer as read-only. The panel uses `bwrap` (bubblewrap, Linux only) to run Antigravity and, in the [Factory](/fabrica), the agents that write code and the tests they wrote. Every read-mode AI also runs in a bwrap jail where your home folder and `/tmp` look empty: it only sees the folder of that run, for example the repository it is reviewing.

## Software Factory

### Factory task

A request given to the [Factory](/fabrica) ("export the orders report as CSV") and everything that happens to it: criteria, plan, code, tests, review and delivery.

### Gate

A check made by code, not by the AI, that approves or rejects an agent's delivery: did something change, do the declared files exist, does the project's verification pass. A rejected gate sends the failure back to the agent to fix.

### Acceptance criteria

The list of conditions that say when the request is done, written by the Analyst agent before any code. Each criterion needs at least one test.

### Gherkin scenario

A way of writing a criterion as an example in plain language: "Given … When … Then …". Tasks that come from an idea bring their criteria in this format.

### Walking skeleton

The thinnest version of a feature that already works from end to end, through every layer. In the Ideas tab of the [Factory](/fabrica), the first master task is always the walking skeleton.

### Project

A folder that groups related repositories and the Factory tasks and ideas about them. In the [Factory](/fabrica), the chips above the board filter by project.

### Idea

A raw idea that the Ideas tab of the [Factory](/fabrica) turns into tasks, in phases: explore, challenge, refine, plan and split. Each phase only closes when its gate, checked in code, is open.

### Red team / blue team

In the challenge phase of an idea, the red team attacks it (where can it fail?) and the blue team defends it or proposes a mitigation. You decide what to do with each attack.

### Master task

A large step of the plan for an idea, written by the Planner agent, with objective, scope and Gherkin scenarios. Keys like `M1`, `M2`.

### Split (break down)

Breaking each master task into executable tasks (the **Break down** phase of an idea), each one in a single repository and a single stack (backend, frontend, mobile, infra or docs), done by the Splitter agent. Keys like `M1.T2`.

### Dependency

A task that must be done before another one starts. In the [Factory](/fabrica), a task that depends on another shows "waits for" and only starts planning after it is done.

## Panel

### Data directory

The `~/.workstuff` folder, where the panel saves settings, connections, tokens, history and worktrees. It never stays inside the workStuff code folder.

### Status bar

The bar at the bottom of the window, which shows whether the local server is answering and which tools are installed. See [What workStuff is](/documentacao/introducao).

### Favorite

A screen pinned to the top of the menu and opened with **Alt** plus a number. See [What workStuff is](/documentacao/introducao).
