# Performance

Follows the CPU and memory use, restarts and CPU throttling of up to 20 pods over hours, shows it all in charts and, at the end, asks the AI for a report saying whether the application handles the load and what to adjust.

## When to use

- An application gets slow at certain times and you want to see whether it lacks CPU or memory.
- You suspect a memory leak: usage climbs slowly until the application restarts.
- You are about to run a load test and want to record how the pods behave during it.
- You need data to justify raising (or lowering) the CPU and memory limits.

## Before you start

- The cluster access files (kubeconfigs) must be in your `~/.kube` folder. See how to add one in [Cluster](/documentacao/cluster).
- For the AI report, choose the AI provider in [Settings](/configuracoes). See [Settings](/documentacao/configuracoes).
- The terms used here are in [Concepts and terms](/documentacao/conceitos).

A few words on this screen:

- **Pod**: the unit that runs the application in the cluster. An application usually has several identical pods.
- **Container**: each program inside a pod. Many pods have an application container and an `istio-proxy`, the helper program that handles network traffic.
- **Limit**: the most CPU or memory the container may use. If memory goes over the limit, the container is killed (the well-known OOMKilled) and restarts.
- **Throttling**: when the container hits its CPU limit, the system holds it back for a moment. The application slows down even when its average CPU use is low.
- **Observation**: a recording. You choose the pods and how often to measure, and the panel saves each measurement (a "collection").

## Getting to know the screen

From top to bottom:

| Part | What it is |
|---|---|
| **Kubeconfig** (top right) | Which cluster to observe, and the context when the file has more than one. It is separate from the [Cluster](/cluster) screen: it starts with the same kubeconfig as there, but you can switch without affecting that screen. |
| **New observation** | Where you choose the namespace, the interval between collections and the pods. It has the **Available** and **Selected** lists. |
| **Observations** | Every observation, with its state (**running**, **stopped** or **failed**), when it started and its interval. A pulsing green dot means collection is up to date; a yellow one means it is late or still waiting for the first collection. |
| Observation detail | Shows when you click an observation: one card per container, the chart over time and the Istio mesh table. |
| **AI report** | Generates and keeps reports for the chosen observation. |

A namespace is the "folder" in the cluster that groups the applications of one system, for example `orders-hml`.

## Step by step: create an observation

1. At the top, in **Kubeconfig**, pick the cluster. If a context list appears, pick the right one.
2. On the **New observation** card, pick the namespace. The screen already suggests the first application namespace, skipping the system ones.
3. Pick the interval: **every 15s**, **every 30s**, **every 60s** or **every 120s**. A short interval catches quick spikes; a long one suits watching for many hours.
4. In the **Available** list, check the pods you want to follow (up to 20). Use **filter pods…** to find them by name.
5. In **Selected**, check each pod's containers. `istio-proxy` comes unchecked, because what matters is the application's usage. If you uncheck them all, every container is collected.
6. Click **Start observation**. The observation shows up in **Observations** as **running** and opens right away.
7. Let it run for as long as you want to observe. The first collection happens within the chosen interval.

> **Tip:** the pod list does not refresh on its own. If a new pod came up, click the **Pods** button to reload the list.

### Read the charts

1. Click an observation in the **Observations** list.
2. Each card shows one container, with the pod name below it:
   - **CPU**: usage in millicores (`250m` is a quarter of a processor) and how much of the limit that is. With no limit, it shows **no limit**.
   - **MEM**: memory in Mi (mebibytes, about a megabyte) and how much of the limit that is.
   - **throttle**: the percentage of time the container was held back for hitting its CPU limit.
   - The memory trend: **stable memory**, or how much it grows per hour, such as `+12 MiB/h, hits the limit in ~6h`. It shows once there are at least six points and the growth is over 1 MiB per hour.
   - A red badge with the number of **restarts** when the container restarted.
3. Click a card to see that container in the chart.
4. Use **CPU over time** and **Memory over time** to switch the chart. The dashed line is the limit. The dots at the top mark restarts and out-of-memory events (OOMKilled); hover over them for the details.
5. In **Mesh (Istio)**, see per service how many requests per second came in (**req/s**), the typical response time and that of the slowest 5% (**p50 · p95**), and the **error** percentage. These numbers show from the second collection on, and only for services that get traffic through the Istio gateway.

### See what happened before you started observing

1. In the observation detail, click **Prometheus history**.
2. The panel rebuilds the last 24 hours from the cluster's Prometheus, the system that keeps the metrics history. A message tells you how many points were rebuilt.
3. In the chart, a vertical line separates the history (left) from the observation's own collection (right).

### Generate the AI report

1. With the observation open, go to the **AI report** card.
2. Set **From** and **To** to the period you care about. By default it runs from the start of the observation until now (or until it stopped).
3. In **Prometheus history**, choose **do not include**, or **include 6h**, **include 24h** or **include 72h** to add earlier hours rebuilt from Prometheus.
4. Click **Generate report**. The text appears as the AI writes it. To interrupt, click **Stop**.
5. When it finishes, the report opens in a window and is saved under **This observation's reports**. Click **Open** to read it again, or the trash icon to delete it.

The report has a summary, the times that show signs of trouble with the likely cause, the times with no anomaly, and a request and limit recommendation for containers that came close to their limit. It is written in Portuguese.

### Stop, resume and delete

- **Stop**: halts collection. The points already collected stay saved.
- **Resume**: starts collecting again in the same observation.
- Trash icon: opens **Delete the observation?**. When you click **Delete**, the observation and every collected point are deleted, with no undo. Reports already generated stay saved.

## Good to know

- The screen only reads the cluster. Nothing changes.
- Collection runs on the panel's server, not in the browser: you can close the tab. If the server restarts, the observations that were running carry on by themselves.
- CPU and memory usage come from the cluster's metrics service (metrics-server). Without it, the cards show **no metric**.
- Throttling needs the cluster's Prometheus (for example, Rancher Monitoring's). Without it, you see **throttle unavailable** with the reason.
- The mesh table needs Istio with the `istio-ingressgateway`. Without it, you see **unavailable** with the reason.
- A pod is followed by its name. If it is replaced by another one (in a new release, for example), the new pod has a different name and is not part of the observation: create a new one.
- For the report, the collections are summarized in 5-minute blocks and sent to the AI provider in [Settings](/configuracoes). The AI runs no commands; it only reads those numbers.
- Observations, points and reports are kept in `~/.workstuff/performance`.

## Common problems

- **The observation shows as "failed".** The cluster refused the read: the credential expired or your user lacks permission. The reason shows next to the start date. Fix the access and click **Resume**.
- **You see "No kubeconfig in ~/.kube".** Add a kubeconfig on the [Cluster](/cluster) screen.
- **A text field appears instead of the namespace list.** Your user cannot list namespaces. Type the namespace and press Enter.
- **You see "at most 20 pods per observation".** Remove pods from the selection or split them into two observations.
- **The cards show "no metric".** The cluster has no metrics-server, or the pod has no measurement yet. Wait for the next collection; if it persists, talk to the cluster's administrator.
- **Clicking Prometheus history shows "no Prometheus in this cluster".** The cluster has no Prometheus the panel can find. Only the observation's own collection is available.
- **The report says "no samples in the selected period".** The range between **From** and **To** has no collection. Widen the period or include hours from Prometheus.
