# Home

The first screen of the panel: you say what you need to do and it points to the screen that does it, with the first steps. Below that, it tells you at a glance whether anything needs you, builds your stand-up summary and sums up the Software Factory, the connected Kubernetes cluster, your machine and the services running on it.

## When to use

- You know what you want to do ("test an endpoint", "the pipeline failed") but not which screen does it.
- You are about to join the stand-up and want a summary of what you did since the last working day.
- You just opened the panel and want to know whether a task is waiting for your approval or a cluster has pods with problems.
- You want to check that your machine is still ready to work after installing or updating something.
- You want to start a new task in the Factory or jump to a screen you use every day.

## Getting to know the screen

The screen has seven parts, from top to bottom.

**What do you need to do?** A field where you describe the task in your own words, in English or Portuguese, and shortcuts to the most common tasks, grouped by phase of the day: **Coding** (such as **Test an API**), **Delivering** (such as **Pipeline failed**), **Running locally** (such as **Busy port**) and **Production** (such as **See the logs**). Each answer brings the task, the screen's name, the first steps and the **Open** (goes to the screen) and **How to use** (opens that screen's page of this manual) buttons. The first answer has a highlighted frame: Enter opens it.

**Status cards.** Four cards, each one a link to the screen it sums up:

| Card | What it shows | Click to open |
|---|---|---|
| **Software Factory** | How many **tasks in progress**, and below it how many wait for **Approval**, how many are in **Review** and how many are **Done**. While an agent works, a green "running" counter appears. | [Factory](/fabrica) |
| **Kubernetes cluster** | With a cluster connected, how many **pods with problems** (red when there is at least one), the environment stamp and the **Context**. Without one, **Disconnected**. | [Cluster](/cluster) |
| **Machine & Doctor** | How many required items are **pending** on your machine, or how many **items ok** when none is missing, plus the number of warnings. **Ready** appears when nothing is pending. | [Machine](/maquina) |
| **Local services** | How many **listening ports** there are on your machine, whether Docker is **Active** or **Inactive** and how many containers exist. | [Local services](/servicos) |

**Where I left off.** Shows up whenever you have local repositories with modified files, stashes or commits in the last 24h, Factory tasks waiting for your decision or followed pipelines that are failing or running, letting you jump straight to [Pre-MR review](/revisao) or [Repositories](/repositorios).

**For the stand-up.** The **Build summary** button joins your commits since the last working day in every clone of the workspace, the MRs you opened and the followed pipelines that failed, in a text you edit and copy with **Copy**.

**Software Factory and autonomous agents.** The four most recent Factory tasks, each with its title, branch, creation date and state. A task waiting for you shows **Waiting for approval**. Click a task, or **Open the full Factory**, to go to the [Factory](/fabrica).

**Cluster & observability** and **Local development environment.** Two side-by-side cards. The first shows the connected kubeconfig, its environment stamp, the context and how many contexts the file has, and warns when there are pods with problems; its buttons open [Cluster](/cluster), [Logs](/logs), [Timeline](/incidente) and [Requests & Limits](/recursos). The second says whether the machine diagnosis is **All set** or how many items are pending; its buttons open [Dev runbooks](/dev-runbooks), [Repositories](/repositorios), [Pre-MR review](/revisao) and [Pipelines](/pipelines).

**Engineering & productivity tools.** Shortcuts to [Dev runbooks](/dev-runbooks), the [Catalog](/catalogo), [Converters](/conversores), the [Data generator](/gerador), [Vulnerabilities](/vulnerabilidades) and the Kubernetes [Runbooks](/runbooks).

## Step by step: check whether anything needs you

1. Open the panel, or click **workStuff** at the top of the menu to come back here.
2. Look at the **Software Factory** card. If **Approval** is above zero, a task is waiting for you to read and approve its plan: click the card to go to the Factory.
3. Look at the **Kubernetes cluster** card. A red number of **pods with problems** means something is failing in the connected cluster: click the card to see which pods.
4. Look at the **Machine & Doctor** card. If it shows items **pending**, click it, or click **Fix pending items now** in the **Local development environment** card, to see what is missing and how to fix it.
5. To read everything again without waiting, click **Refresh** at the top right.

### Find the screen that does what you need

1. In the **What do you need to do?** field, write the task the way you would say it, for example `test the orders endpoint in HML` or `free port 8080`. Or click one of the shortcuts under the field.
2. Read the answers. Each one names the screen and the first steps.
3. Click **Open** to go to the screen, or press Enter to open the first answer.
4. For the full step by step, click **How to use**.

> **Tip:** if no answer fits, try other words or press **Ctrl K** to see the list of every screen.

### Build the stand-up summary

1. In the **For the stand-up** card, click **Build summary**.
2. Check the text: the commits come grouped by project, followed by the open MRs and the broken pipelines.
3. Fill in **Today** and **Blockers** right in the text box.
4. Click **Copy** and paste it in the team chat.

### Start a new task in the Factory

1. Click **New factory task** at the top right.
2. The [Factory](/fabrica) opens. Follow its page in the manual, [Factory](/documentacao/fabrica), to create the task.

If no task was ever created, the **Software Factory and autonomous agents** card shows **Start the first demand**, which also takes you to the Factory.

## Good to know

- The screen reads everything again on its own every 10 seconds, quietly. **Refresh** only forces a read now.
- The **What do you need to do?** field searches a list that ships with the panel; what you type does not leave the machine.
- The stand-up summary is built only when you click, because it runs git in every clone and asks GitLab or GitHub. A clone without a git `user.email` is left out, and the card says how many were.
- The screen only reads: nothing here changes your machine, your cluster or your tasks. Every action is done on the screen the card opens.
- The cluster card shows the cluster connected in [Cluster](/cluster). To look at another one, switch it there.

## Common problems

- **The cluster card says Disconnected.** No cluster is connected. Go to [Cluster](/cluster) and choose a kubeconfig; see [First steps](/documentacao/primeiros-passos).
- **Every number is zero, even with tasks in the Factory.** The panel's server may not be answering. Look at the bar at the bottom of the window: if it says **local server did not respond**, start the panel again ([First steps](/documentacao/primeiros-passos)).
- **Docker shows Inactive but it is installed.** The panel asks Docker for its state and got no answer: the Docker service is stopped, or your user has no permission to use it. Start the service and click **Refresh**.
