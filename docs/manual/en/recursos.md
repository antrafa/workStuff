# Requests & Limits

Shows how much memory, CPU and Java memory each service declares in the configuration files of a GitLab group, and compares it with what the pods really use on the cluster, suggesting where to adjust.

## When to use

- A service dies from lack of memory (`OOMKilled`) and you want to see the limit it declares and how much it is using right now.
- You want to find the services that declare no memory at all, before they cause trouble.
- The cluster is expensive or full and you want to see who reserves far more memory than it uses.
- You need to review the Java memory options (`-Xms`, `-Xmx`) of every service of a client at once.

## Words you will see on this screen

| Term | What it is |
|---|---|
| **Manifest** | The YAML file that describes how a service runs on Kubernetes: image, variables and resources. |
| **Request** | How much memory or CPU the cluster reserves for the service. The reservation stays held even when unused. |
| **Limit** | The ceiling. If the service goes over its memory limit, Kubernetes kills the container (`OOMKilled`) and it restarts. |
| **Mem req / Mem lim** | Memory request and limit, in that order. |
| **CPU req / lim** | CPU request and limit. `500m` is half a processor. |
| **-Xms / -Xmx** | Java's (the JVM's) initial and maximum memory inside the container. |
| **Metaspace** | The Java memory area that holds the loaded classes, outside `-Xmx`. |
| **Group and subgroup** | The GitLab folders that organize projects. Here, each subgroup becomes a client and each project a stack (the set of services of an environment). |

Other terms, such as pod and namespace, are in [Concepts and terms](/documentacao/conceitos).

## Before you start

- A GitLab connection registered in [Repositories](/repositorios), with a token that can access the group. GitHub connections do not work on this screen.
- To compare with real usage: a kubeconfig added on the [Cluster](/cluster) screen. See [Cluster](/documentacao/cluster).

## Step by step: choose where the manifests come from

1. Open **Requests & Limits**. The first time, the **Where to read the manifests from** card shows up.
2. In **GitLab connection**, pick the connection.
3. In **Group**, type the group path (for example, `my-org/environments`) or paste its URL.
4. Click **Test**. The panel checks the group and says how many subgroups it found, without saving.
5. If it looks right, click **Save**. **Source saved** appears, followed by the client list.

To change it later, click **Change source** in the **Source** strip at the top.

## Getting to know the screen

- **Subgroup**: one button per client (a direct subgroup of the group), with the **Filter subgroups…** box. Projects sitting directly in the group are included too.
- **Stack tabs**: when the client has more than one project, each one becomes a tab.
- **Stack card**: the name, a **GitLab** link to the project, how many services were read and from which branch, and the **Refresh** button.
- **Totals**: **Services**, **Total mem req** (what is reserved on the cluster), **Total mem lim** (the summed ceiling) and **No memory req/lim**. With live usage, **Near the limit (live)** shows up as well.
- **Table**: one row per service, with **App** (the first folder of the path), **Service** (the file name), **Mem req**, **Mem lim**, CPU and the Java options when they exist. A red dash in a memory column means the value is not declared. **View YAML** opens the original file.

The panel reads the YAML files on each project's main branch through the GitLab API, without cloning. Values written as `${NAME}` are replaced with what the `.env` files of the same project say. Files and folders at the project root whose name starts with `_` are left out.

## Step by step: see a stack's resources

1. Click the client under **Subgroup**.
2. If there is more than one stack, click the tab of the one you want.
3. Wait for the read. The first time takes a few seconds.
4. Click the **No memory req/lim** total to see only the services missing a memory request or limit. Click again to clear the filter.
5. Click a column title (for example, **Mem lim**) to sort by it.
6. To check the value in the file, click **View YAML** on the service's row.

### Compare with the cluster's real usage

1. On the stack card, in the **Compare with real usage:** strip, pick the kubeconfig of the cluster where the stack runs.
2. Pick the namespace from the list. If your user cannot list namespaces, type the name.
3. Click **Link**. The link is saved for that stack, and usage is read right away.
4. The table gains the **Live usage** column (the memory the pod uses now and the percentage of the limit) and the **Recommendation** column.
5. Click **Read usage now** to measure again. **Change link** switches the kubeconfig or namespace, and **Remove** undoes the link.

The recommendations are:

| Recommendation | When it shows | What it suggests |
|---|---|---|
| **set** | The manifest does not declare Mem Req or Mem Lim. | Declare both before judging the sizing. |
| **↑ limit** | Usage right now is above 85% of Mem Lim. | Consider raising the limit before the container is killed for lack of memory. |
| **↓ request** | Usage right now is under 40% of Mem Req. | The request may be reserving more than the service uses. |
| **ok** | Usage sits comfortably between the request and the limit. | Nothing to do. |

Hover over a recommendation to read the full explanation.

## Good to know

- The screen changes nothing: not on GitLab, not on the cluster. To apply an adjustment, change the manifest in the repository through your team's usual path.
- The recommendation looks at a single moment, not a trend. With the pod stopped, just started or outside peak hours, it misleads. To follow usage over time, use [Performance](/performance).
- When a service has several copies (replicas), the highest usage among them counts, because that is the one that hits the limit first.
- Usage is read on the linked kubeconfig's current context.
- The client list and the manifests are kept: the screen shows **list read …** and **read …** with how long ago. Use **Refresh list** when a new project appears on GitLab, and **Refresh** on the card when a manifest changes.

## Common problems

- **"No GitLab connection" appears.** Click **Create a connection in Repositories**, register the connection and come back.
- **"No project found" appears.** The group has no active projects in direct subgroups, or the connection token cannot access it. Check the group path and click **Refresh list**.
- **"No resource file found" appears.** No YAML of the stack declares a `resources` block or Java options on the main branch.
- **A notice says GitLab did not deliver some files.** Those files were left out of the table in this read. Click **Refresh** to try again.
- **The Live usage column says "no pod".** There is no pod of that service in the linked namespace. Check that the namespace is the right one.
- **The column says "no metric", or a metrics-server notice appears.** The cluster lacks the service that measures usage, or has not measured that pod yet. Wait a little and click **Read usage now**.
