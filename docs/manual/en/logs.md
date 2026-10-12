# Logs

Follows the live logs of every pod of one or more applications at once, in a single list, with one color per pod. It shows what the whole application is doing, not just one copy of it.

## When to use

- The `orders-api` application runs in three pods and you do not know which one got the failing request.
- You want to follow two applications that talk to each other (for example, `api` and `worker`) and see the order of events.
- You are about to test something in staging and want to watch the logs arrive while you test.

## Words you will see on this screen

| Term | What it is |
|---|---|
| **Log** | The text an application writes while it runs: warnings, errors, requests received. |
| **Pod** | One copy of the application running on the cluster. An application usually has several identical pods. |
| **Namespace** | A division of the cluster, like a folder, that groups applications (for example, `orders-hml`). |
| **Label** | A `key=value` tag attached to the pod, such as `app=api`. It is how the screen knows which pods belong to the same application. |
| **Selector** | The rule that picks pods by their labels, such as `app=api` or `app in (api,worker)`. |
| **Container** | Each program inside the pod. Besides the application, a pod may have a helper container. |

More terms in [Concepts and terms](/documentacao/conceitos).

## Before you start

- A cluster connected on the [Cluster](/cluster) screen. See how in [Cluster](/documentacao/cluster). This screen uses the same cluster and context, shown as **Cluster** at the top of the card.

## Getting to know the screen

- **Namespace row**: the `namespace` field and the **List applications** button. The namespace you type is remembered in this browser.
- **Applications**: after listing, one button per application, with how many pods each has.
- **Options row**: the selector field (**selector, e.g. app=api**), the **container (default)** field, the period and the **Follow** button.
- **Logs panel**: appears once you start. At the top, the state (**connecting**, **live**, **paused**, **stopped** or **error**), how many pods and lines, the **Filter text or pod** box, **Pause**, **Copy** and the trash button, which clears the screen. Below that, the legend with each pod's color. Every line starts with the end of the pod's name, in its color.

## Step by step: follow an application's logs

1. Type the namespace, for example `orders-hml`.
2. Click **List applications**. A button shows up for each application in the namespace.
3. Click the application you want. The selector is filled in for you, for example `app=orders-api`.
4. To follow more than one, click the others too. The selector becomes `app in (orders-api,worker)`.
5. Pick the period: **last 5 min**, **last 10 min**, **last hour** or **only the last 100 lines**.
6. Click **Follow**. The state turns **live** and new lines keep arriving at the end of the list.
7. To finish, click **Stop**.

> **Tip:** while following, the fields above are locked. To change the application or the period, click **Stop**, change it and click **Follow** again.

### Read calmly and search for a text

1. Click **Pause**. The screen stops scrolling. Lines that arrive meanwhile are not lost: they are held back.
2. Type a piece of text in the filter, such as `Exception`, or part of a pod's name. Only the matching lines stay visible.
3. Click **Copy** to take the visible lines, each with the pod name in brackets.
4. Click **Resume**. The lines held during the pause join the list, in the right order.

## Good to know

- The screen only reads: nothing changes on the cluster.
- You can only combine applications that use the same label key. If you click an application with another key (for example, `app.kubernetes.io/name` after `app`), the selection starts over with it.
- You can also type the selector by hand, for example `app=api,tier!=db`.
- With the **container (default)** field empty, each pod shows its main container. To see another container, type its name.
- The screen keeps the 5,000 most recent lines. Past that, the oldest ones leave the list.
- `kubectl` follows at most 30 pods at the same time.
- Each pod's color stays the same for the whole session.

## Common problems

- **"No cluster connected" appears.** Click **Connect on the Cluster screen** and pick a kubeconfig.
- **"No pod with an app label in this namespace" appears.** The pods do not use the common application labels. Type a selector in the field, with a label the pods do have.
- **The state is live but no line shows up.** It says **connected; no line in the chosen period yet.** The application wrote nothing in that period. Pick a longer period or wait.
- **An "invalid label selector" error appears.** The selector has characters that are not accepted. Use the `key=value` format, for example `app=api`.
- **The state turns to error.** Read the message in red: it is usually a namespace that does not exist, or no permission to read logs.
