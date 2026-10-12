# Scheduled checks

Checks on its own, every so often, things you do not want to keep watching: a broken pipeline, a certificate close to expiring, pods with problems or a serious flaw in a project's dependencies. When the state changes, you get a system notification.

## When to use

- You want to know the moment the main branch pipeline breaks, without keeping the [Pipelines](/pipelines) screen open.
- The HTTPS certificate of `app.exemplo.com` expires soon and nobody can forget to renew it.
- You want a warning if any pod in the `pedidos-hml` namespace goes into a critical state.
- You want to keep an eye out for a critical security flaw in a project's libraries.

## Before you start

Each kind of check uses something that must already be set up on another screen:

| Kind | What it needs first |
|---|---|
| **Broken pipeline** | The project followed on the [Pipelines](/pipelines) screen. See [Pipelines](/documentacao/pipelines). |
| **Certificate expiring** | Just the site's address. |
| **Pods with problems** | A kubeconfig registered on the [Cluster](/cluster) screen. See [Cluster](/documentacao/cluster). |
| **Critical flaw in the dependencies** | The project in a folder on your computer. |

On Linux, the notification uses the `notify-send` program. Without it, the warning stays only in the screen's history.

## Getting to know the screen

Some terms:

- **Check**: something you register to be checked, with a target and an interval (for example, "the certificate of `app.exemplo.com`, every 6 h").
- **Certificate**: the file that gives a site its HTTPS padlock. It has an expiry date.
- **Pod**: the unit that runs the application inside a Kubernetes cluster. A **kubeconfig** is the file with the cluster's address and access, and a **namespace** is a division of the cluster (like a folder).
- **Dependencies**: the third-party libraries the project uses.

More terms in [Concepts and terms](/documentacao/conceitos).

The screen has two parts:

| Part | What it shows |
|---|---|
| **Check list** | Each check with its kind, **State**, when it ran **Last** and the interval (**Every**). Paused checks show faded. |
| **Recent alerts** | The history of state changes: when, whether it was a **problem** or **recovered**, the summary and whether the notification went out (**notified**) or stayed in **history only**. It shows up only after the first alert. |

A check's states:

| State | Meaning |
|---|---|
| **ok** | All fine on the last check. |
| **problem** | The check found what you asked it to watch for (pipeline failed, certificate close to expiring...). |
| **error** | It could not check: network down, VPN off, address unreachable. The summary under the state gives the reason. |
| **not run yet** | The check was created but has not checked anything yet. |

The screen refreshes on its own every 30 seconds.

## Step by step: create a check

1. Click **New check**.
2. In **What to check**, pick the kind.
3. Fill in the target, which depends on the kind:

   | Kind | Field | Example |
   |---|---|---|
   | **Broken pipeline** | **Project**: pick it from the list of followed projects. | `group/orders-api` |
   | **Certificate expiring** | **Host**: just the address, without `https://`. | `app.exemplo.com` |
   | **Pods with problems** | **Kubeconfig**, the context (shows only when the file has more than one) and **Namespace**. | `pedidos-hml` |
   | **Critical flaw in the dependencies** | **Project folder**: full path or starting with `~`. | `~/workspace/orders-api` |

4. In **Every**, pick the interval: 5 min, 15 min, 30 min, 1 h, 6 h or 24 h.
5. Click **Create and run now**. The check is saved and runs once right away, so you can see that it works without waiting for the first interval.
6. Look at the state in the list. If it shows **error**, read the summary and fix the target.

### What each kind counts as a problem

- **Broken pipeline**: the project's latest pipeline failed.
- **Certificate expiring**: 30 days or less are left, or it already expired.
- **Pods with problems**: some pod in the namespace is in a critical state, such as restarting nonstop (CrashLoop), unable to pull its image, or with 3 or more restarts.
- **Critical flaw in the dependencies**: some library has a known security flaw of critical or high severity, according to the public OSV database.

### Pause, run now and delete

Each check's row has three icons:

1. **Run now** (circling arrows): checks right away, outside the interval.
2. **Pause**: the check stops running and shows faded. The same button becomes **Resume**.
3. **Delete** (trash can): asks for confirmation. The check is no longer run, but the alert history stays.

## Good to know

- Checks only run while the panel's server is up. With the computer off or the panel closed, nothing is checked.
- The warning goes out only when the state changes. An ongoing problem warns once; when it is solved, a second warning says it is back to normal.
- An **error** (such as the VPN being down) does not count as a state change. That way you do not get "problem" and "recovered" on every network drop.
- Checks run one at a time. A slow check is never started again on top of itself.
- Everything is read-only: no check changes the pipeline, the cluster or the project.
- The limit is 30 checks. The screen shows the 50 most recent alerts.
- On Windows there is no system notification: the warning stays only in the screen's history.

## Common problems

- **The project list under Broken pipeline is empty.** Follow the project first on the [Pipelines](/pipelines) screen.
- **"invalid host".** Write just the address, such as `app.exemplo.com`, without `https://` and without a path.
- **"use the absolute folder path" or "folder not found".** In **Project folder**, enter the full path, such as `/home/you/workspace/project`, or one starting with `~`.
- **The state stays on error.** Read the summary under the state. It is usually the network, the VPN or access to the cluster. Fix it and click **Run now**.
- **The state changed, but no notification showed up.** Look at **Recent alerts**: **history only** means the system did not show the notification. On Linux, install the `notify-send` program.
