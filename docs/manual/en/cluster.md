# Cluster

Shows what is running on a Kubernetes cluster (the pods, the machines and what is failing), with live logs and AI diagnosis. The Cluster Doctor tab is a chat where the AI investigates the cluster for you.

## When to use

- Someone reports that the staging application is down and you want to see which pods have problems.
- A pod keeps restarting and you need to read the log from before the last restart.
- You want to know whether any machine in the cluster is running out of memory or disk.
- You do not know where to start and would rather describe the problem for the AI to investigate.

## Words you will see on this screen

If a term is new to you, the [Concepts and terms](/documentacao/conceitos) page explains it more slowly.

| Term | What it is |
|---|---|
| **Cluster** | The set of machines where the applications run, managed by Kubernetes. |
| **Kubeconfig** | The file with the address and the credentials to reach one or more clusters. It lives in the `~/.kube` folder on your computer. |
| **Context** | Inside a kubeconfig, the pair of cluster and user that will be used. One file can have several. |
| **Namespace** | A division of the cluster, like a folder, that keeps applications apart (for example, `orders-hml`). |
| **Pod** | The smallest unit that runs on the cluster: one or more applications (containers) that start together. |
| **Node** | One of the cluster's machines, where pods run. |
| **Deployment, StatefulSet, DaemonSet** | The pod's "owner": the resource that says how many copies must exist and recreates pods when they disappear. |
| **Restart** | When a pod's container dies and starts again. Many restarts usually point to an error. |
| **Event** | A notice Kubernetes records, such as "could not pull the image". The cluster keeps events only briefly, usually for an hour. |

## Before you start

- `kubectl` must be installed. The [Machine](/maquina) screen checks it.
- You need the cluster's kubeconfig file. Whoever runs the cluster usually provides it, or you can download it from Rancher.
- For AI diagnosis, set the provider in [Settings](/configuracoes). Cluster Doctor only works with Claude Code.

## Step by step: connect a cluster

1. Open the **Cluster** screen. With no cluster connected, it shows **No cluster connected**.
2. Click **Choose kubeconfig**. The list of kubeconfigs in `~/.kube` opens, grouped by environment.
3. If the file you want is not in the list, click **Add kubeconfig** and pick the file on your computer. The panel validates it with `kubectl` before saving it to `~/.kube`, and never overwrites a file with the same name.
4. Check the environment classification in the list next to the file (see the next section). If it is wrong or empty, choose **DES**, **ITG**, **HML** or **PRO**.
5. Click the file name. A **Connected to** notice appears with the file name.
6. If the file has more than one context, pick the right one in the **Context** field of the top bar.

The connection applies to every screen in the Kubernetes group, such as [Logs](/logs) and [Timeline](/incidente). To change it, click **Switch kubeconfig**; to forget the cluster, click **Disconnect**. Disconnecting changes nothing on the cluster.

> **Tip:** if the kubeconfig came from Rancher, an **Open in Rancher** button appears and opens the same cluster in the browser.

## The environment stamp and frame

Each kubeconfig gets an environment classification, and that is what decides what the panel lets you do:

| Environment | What it means | What the panel allows |
|---|---|---|
| **DES** | Development | Restart, with confirmation. Never deleting resources. |
| **ITG** | Integration | Restart, with confirmation. |
| **HML** | Staging | Restart, with confirmation and the command shown. |
| **PRO** | Production | Read-only. Nothing is changed. |
| **no environment** | Unclassified | Counts as PRO: read-only until you classify it. |

- The classification comes from the file or context name (for example, `shop-hml` becomes HML and `erp-prd` becomes PRO). The list then says **by name**. If you pick one by hand, it says **classified by you**.
- In any environment, the panel never cordons, drains or taints a node (that is, takes a machine out of service or marks it).
- On the Kubernetes screens, the whole window gets a frame that grows heavier with the risk: thin for DES, dashed for ITG, thick for HML and hatched for PRO and unclassified. A banner names the environment, such as **HML · staging · actions ask for confirmation**.
- The top of every screen in the group shows the environment stamp, the kubeconfig name and the context, with a **switch** button.

> **Warning:** check the stamp before any action. If a production kubeconfig has a name that does not reveal the environment, it stays unclassified and is therefore read-only. Never classify it as HML just to unlock an action.

## Getting to know the screen

Once connected, the screen has three tabs:

| Tab | What it shows |
|---|---|
| **Overview** | The pods table and, below it, one card per node with CPU and memory use. |
| **Problems** | Only the pods with an alert, one card per pod, critical first. The red number on the tab is how many there are. |
| **Cluster Doctor** | The chat with the AI that investigates the cluster. |

At the top are the totals (**Pods**, **Critical** and **Warning**) and the **Refresh** button. The screen already reloads the pods on its own every 30 seconds while the browser tab is visible.

Each pod gets a state:

- **◆ critical**: for example, it restarted 3 times or more, cannot pull its image (`ImagePullBackOff`) or keeps crashing in a loop (`CrashLoopBackOff`).
- **▲ warning**: it restarted once or twice, is `Pending` (waiting for a place to run) or is not ready yet.
- **● ok**: no sign of a problem.

The **Phase** column gives the reason in words, such as "api restarted 14x (last reason: Error)".

## Step by step: investigate a failing pod

1. In **Overview**, the pods that need attention come first, under **Need attention**. Healthy ones stay collapsed under **Healthy**; click that row to **show** them.
2. To see a single namespace, pick it in the list next to **Pods** (the default is **all namespaces**). To find a pod, use **Find pod by name…**.
3. Click the pod's row. It opens with the live logs and the **AI agent** card.
4. In the logs, use **Errors** or **Warns** to see only those lines, or **filter by text…**. If the pod has already restarted, the **Current** button switches to **Previous** and shows the log of the container that died before the last restart, which is usually where the error is.
5. For the AI's opinion, click **Investigate with AI**. It reads the recent logs and events and points out the likely cause.
6. For more detail, click **Describe** in the **Actions** column. It opens the tabs **Overview** (node, IP, containers, memory), **Image and ConfigMaps** (the exact image and the settings the pod reads), **Events** and **AI diagnosis**.

> **Tip:** the **last 500** selector in the logs fetches more lines from the end of the log (2000 or 10000). **Download** saves only the visible lines, with the filter applied.

### Restart an application

Restarting recreates every pod of the owner (the Deployment, StatefulSet or DaemonSet), one at a time. It is the only write this screen performs.

1. On the pod's row, click **Restart…** (or **Restart** on the card in the **Problems** tab).
2. In DES, ITG or HML, a confirmation opens with the environment stamp and three parts: **Command** (the exact `kubectl rollout restart` that will run), **Effect** (what happens) and **You lose** (what is lost, such as the logs of the current pods).
3. Read the command. If you want to keep the logs, cancel and download them first.
4. Click **Restart in HML** (the button carries the environment name). Enter does not confirm: only the click does. Esc cancels.
5. A notice says the resource was restarted, and the pods come back up one by one.

In PRO or unclassified, the same button opens a **read-only · nothing will run** window, with the command under **Would run** and a **Copy command** button, so you can take it to your team's change process.

### Talk to Cluster Doctor

1. Open the **Cluster Doctor** tab. The header shows the cluster and the environment stamp.
2. Describe the problem in the text box (Enter sends, Shift+Enter adds a line) or click a suggestion, such as "Which pods have problems in this cluster?".
3. The AI runs `kubectl` read commands on its own. Each command shows up in the conversation; click it to see the output.
4. When the AI thinks something needs to change, it does not change it: a **Write action (…): confirm?** card appears with the exact command.
5. Read the command. Click **Confirm and run** for the panel to run it, or **Refuse**. The result shows as **Executed** or **Failed**.
6. Use **History** to reopen past conversations and **New** to start another. **Stop** interrupts the AI midway.

## How writes to the cluster are confirmed

- The screen only reads the cluster on its own. Every change goes through you.
- A restart shows the exact command first and only runs after you click the confirmation button.
- In Cluster Doctor, the AI cannot write: it only proposes. When you confirm, the panel itself checks the command against the environment rules again and runs it. The AI gets access restricted to the chosen cluster and context, and every command goes through a lock before it runs.
- If the proposal is not allowed in that environment (for example, deleting something in DES or any write in PRO), the card becomes **Action blocked**, with the reason and a **Copy command** button: if you are sure, you run it yourself.
- Some operations the AI never performs, in any environment: reading Secrets (where passwords live), getting into a container (`exec`), copying files, opening ports or creating resources.
- Every Cluster Doctor attempt is logged to `~/.workstuff/doctor-audit.log`.

## Good to know

- Secrets are never read by this screen.
- The AI behind **Investigate with AI** and **AI diagnosis** only reads: it gets the last log lines, the events and the detected problems, and nothing runs on the cluster. Use **Stop** to interrupt it and **Analyze again** to ask again.
- Switching kubeconfig or context starts a new Cluster Doctor conversation: each conversation is tied to the cluster it started on.
- The trash button in the kubeconfig list deletes the file from `~/.kube`, after you confirm. The cluster is not affected. The panel never deletes `~/.kube/config`, because it is the default of every `kubectl` on the machine.
- Without `metrics-server` (the cluster service that measures usage), **no metrics** appears: CPU and memory show only the limit or what is reserved.

## Common problems

- **The pods list asks for a namespace.** The kubeconfig user is not allowed to list every namespace. Type the namespace name in the field next to **Pods** and click **View**.
- **The restart button is locked.** The kubeconfig is PRO or unclassified. If it really is a test environment, classify it under **Switch kubeconfig**. If it is production, use **Copy command** and your team's change process.
- **A notice says the kubeconfig authenticates through an external command (exec).** Reads fail until you log in from the terminal with the command that kubeconfig uses.
- **Cluster Doctor shows a notice instead of the chat.** It only runs on Claude Code. Click **Open Settings** and change the provider.
- **The Events tab is empty.** Kubernetes drops events after about an hour. To look at a longer period, use the [Timeline](/incidente).
- **A file is skipped in the kubeconfig list.** It appears under **Skipped for not being a valid kubeconfig**. Check that it really is a kubeconfig with at least one context.
