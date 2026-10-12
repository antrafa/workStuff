# Compare environments

Shows, side by side, what differs between the applications of two environments (for example, staging and production): image version, number of copies, resources, variables and health checks. It answers "why does it work there and not here?" without opening two terminals.

## When to use

- An error shows up in production (PRO) but not in staging (HML), and you want to know what changes between them.
- Before a release, you want to confirm the version tested in HML is the one going to PRO.
- Someone asks whether an application's memory limit is the same in both environments.
- You suspect an environment variable ended up with a different value on one side.

## Before you start

- The files that give access to the clusters must be in your `~/.kube` folder. A cluster is the set of machines where the applications run, and the file that gives access to it is called a **kubeconfig**. See how to add one in [Cluster](/documentacao/cluster).
- You need the **namespace** name for each side. A namespace is a "folder" inside the cluster that groups the applications of one system, for example `orders-hml` and `orders-pro`.
- The terms used here are explained in [Concepts and terms](/documentacao/conceitos).

## Getting to know the screen

The screen has a card at the top with both sides of the comparison:

| Part | What it is |
|---|---|
| **Side A** and **Side B** | Each side has the **choose the kubeconfig** list, the context list (shown only when the kubeconfig has more than one) and the **namespace** field. |
| Button with two arrows | **Swap the sides**: switches A and B. |
| **Compare** | Reads both sides and shows the result. It is enabled only when both sides have a kubeconfig and a namespace. |

The **context** is the combination of cluster and user inside a kubeconfig. Most files have just one; when there are several, the screen starts with the file's default context.

After comparing, you see:

- **Four counters**: how many workloads are **different**, **only in A**, **only in B** and **same**. Workload is the generic name for an application in the cluster. The screen compares three kinds: Deployment (an application that is always up), StatefulSet (an application that keeps data, such as a database) and CronJob (a scheduled task).
- **The workload table**, with the columns **Workload**, **State** and **Differences** (the names of the first fields that changed).
- **With differences (n)** and **All (n)**: switch between seeing only what changed or everything.
- **Filter by name**: finds a workload by its name.
- At the bottom, what was read on each side (kubeconfig, context, namespace and number of workloads).

## Step by step: compare two namespaces

1. In **Side A**, open **choose the kubeconfig** and pick the file for the first environment (for example, the HML one).
2. If a second list appears, pick the right context.
3. In the **namespace** field, type the namespace, for example `orders-hml`.
4. Do the same in **Side B** with the other environment, for example `orders-pro`. It can be another cluster or the same one.
5. Click **Compare**. While it reads, the button shows **Comparing…**.
6. Look at the counters and the table. By default, the table already shows only **With differences**.
7. Click a row that has an arrow on the left to open its details. A table appears with **Field**, **A** and **B**, one field per row.

> **Tip:** the screen remembers both sides in this browser. Next time, just click **Compare**.

## Reading the result

The **State** of each workload means:

| State | Meaning |
|---|---|
| **different** | It exists on both sides, but at least one field changes. |
| **only in A** | It exists only on side A. |
| **only in B** | It exists only on side B. |
| **same** | It exists on both sides with the same configuration. |

Field names come from the server in Portuguese and look like this:

| Field | What it compares |
|---|---|
| `réplicas` | How many copies of the application run at the same time (the replicas). |
| `agenda` | A CronJob's schedule, in cron format (for example, `0 3 * * *` is every day at 3 a.m.). |
| `<container>.imagem` and `<container>.tag` | The image address (the application's package) and its version. The tag is usually the difference that matters most. |
| `<container>.requests.cpu`, `<container>.limits.memory` | Resources: the minimum reserved (request) and the maximum allowed (limit) of CPU and memory. |
| `<container>.env.NAME` | The value of the environment variable `NAME`. |
| `<container>.envFrom.secret.X`, `<container>.envFrom.configmap.X` | The container loads every variable from a Secret or ConfigMap named `X`. |
| `<container>.readiness`, `<container>.liveness` | The health checks (probes): how the cluster tests whether the application is ready and alive, with delay, period, timeout and allowed failures. |

A container is each program inside a pod; its name comes at the start of the field, as in `app.tag`. When a field exists on only one side, the other shows **missing**.

## Good to know

- The screen only reads. Nothing changes in either cluster.
- A Secret (an object that stores passwords and keys) is never read. A variable that comes from a Secret shows only as a reference, for example `secret db/senha` (the Secret's name and key).
- A variable named like a password, token or key, or with a password inside a connection URL, shows masked as `•••• oculto (a1b2c3d4)`. Equal values get the same mark, so you can tell whether the password differs between the sides without seeing it.
- Each side has its own kubeconfig: this screen does not depend on the cluster chosen on the [Cluster](/cluster) screen.
- Only Deployments, StatefulSets and CronJobs are included. Services, Ingresses and ConfigMaps are not compared.

## Common problems

- **The Compare button stays disabled.** One of the sides is missing its kubeconfig or namespace.
- **You see "Side A: no permission to list…".** Your user lacks permission (RBAC, the cluster's access rules) to read that kind of workload. The other kinds were compared normally; ask the cluster's administrator for the permission if you need them.
- **An error says the context does not exist or the kubeconfig was not found.** The file changed or was removed from `~/.kube`. Pick the kubeconfig again in the list.
- **Everything shows as "only in A" and "only in B".** The workload names differ between the environments, or the namespace you typed is wrong. Check the namespace name.
