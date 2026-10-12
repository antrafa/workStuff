# Upgrade

Shows what will break when Kubernetes is upgraded to a new version, and what is about to expire: objects written in a format the new version no longer accepts, the security certificates of your sites and the access credentials of your clusters.

## When to use

- The infrastructure team announced the cluster will go from version 1.29 to 1.30, and you want to know what needs fixing first.
- You want to check whether a repository's configuration files still use a format that no longer exists.
- You want to know when the HTTPS certificate of the addresses published in the cluster expires.
- Your access to a cluster stopped working and you suspect the credential expired.

## Before you start

- The **Removed APIs** tab (its cluster part) and the **TLS certificates** tab use the cluster chosen on the [Cluster](/cluster) screen. Connect there first. See how in [Cluster](/documentacao/cluster).
- The **Kubeconfigs** tab and the repository check work with no cluster connected.
- Terms such as cluster, namespace and kubeconfig are in [Concepts and terms](/documentacao/conceitos).

## Getting to know the screen

The screen is called **Upgrade readiness** and has three tabs:

| Tab | What it shows |
|---|---|
| **Removed APIs** | Cluster objects and repository files that use an API removed in the target version. |
| **TLS certificates** | When the certificate of each address published in the cluster expires. |
| **Kubeconfigs** | When the credential of each cluster access file expires. |

A few words that show up on this screen:

- **API and apiVersion**: every Kubernetes object (an application, a network rule, a schedule) is written in a versioned format, such as `batch/v1beta1` or `networking.k8s.io/v1`. That line is called `apiVersion`. Old formats are marked deprecated and, a few versions later, removed. An object in a removed format is no longer accepted.
- **TLS certificate**: the file that lets an `https://` address open without a security warning. It has an expiry date.
- **Kubeconfig**: the file with a cluster's address and access credential.

On the **Removed APIs** and **TLS certificates** tabs, the top shows **Cluster:** with the connected context name and the **namespace (empty = all)** field. A namespace is a "folder" in the cluster that groups the applications of one system. Leave it empty to look at the whole cluster, or type a namespace when your user only has permission there.

## Step by step: find what breaks in the cluster

1. Open the **Removed APIs** tab.
2. In **Target version**, type the version the cluster is going to, in the format `1.30`. If you leave it empty (the field shows **next**), the screen uses the version after the cluster's current one.
3. On the **In the cluster** card, click **Check cluster**. The button shows **Checking…** while it reads.
4. The card title then shows the current and the target version, for example `v1.29.3 → 1.30`.
5. If nothing breaks, you see **Nothing that breaks in 1.30 among the N objects read.**
6. If something breaks, the table lists each object with **Object**, **Applied with** (the format used), **Removed in** (the version that removed that format) and **Replace with** (the new format). When there is no new format, it shows **no replacement**.
7. Below it you may see **Recent calls to deprecated APIs (apiserver metrics)**. These are requests made to the cluster in a format that will be removed, by some program (Helm, an operator, a delivery pipeline). The table shows **Resource**, **Version called** and **Removed in**.
8. Fix the source files of those objects and click **Check again** to confirm.

> **Tip:** the screen finds the format used through the annotation the `kubectl apply` command writes on each object. Objects created by Helm or by an operator do not have that annotation. For them, check the repository files (next section).

### Check a repository's files

1. Still on the **Removed APIs** tab, go to the **In a repository's manifests** card. A manifest is the YAML file that describes a Kubernetes object.
2. Type the full path of the repository folder, for example `~/projects/orders`, or click **Choose** to open the folder picker.
3. Click **Check for 1.30** (the number follows **Target version**; if that is empty, the default is 1.31).
4. If no file uses a removed format, you see **None of the N YAML files uses an API removed up to 1.30.**
5. Otherwise, the table shows **File** (with the line number, as in `k8s/app.yaml:6`), **Resource**, **apiVersion**, **Removed in** and **Replace with**.
6. Open the file at that line and replace the `apiVersion` with the value in **Replace with**.

### See when TLS certificates expire

1. Open the **TLS certificates** tab.
2. Click **Check certificates**. The button shows **Connecting…**.
3. For each HTTPS address of the Ingresses (the rules that publish an address to the outside) and of the Istio VirtualServices, the screen opens a connection and reads the certificate's date.
4. The table shows **Host** (the address, with the objects that publish it underneath), **State**, **Expires on** (the date and the days left) and **Detail** (who issued it and whether the chain is valid). The ones that expire first come at the top.

| State | Meaning |
|---|---|
| **ok** | Expires in more than 30 days. |
| **expires soon** | Expires in 30 days or less. |
| **expired** | Already expired. |
| **unreachable** | The address did not answer within 8 seconds or refused the connection. |
| **no date** | The address presented no certificate, or it is a wildcard (`*.example.com`), checked through the concrete addresses. |

The **untrusted** badge next to the state means the certificate is not recognized as valid (for example, it is self-signed). The reason shows in **Detail**.

### See when kubeconfig credentials expire

1. Open the **Kubeconfigs** tab. The table loads on its own.
2. For each file in your `~/.kube` folder, you see **Kubeconfig** (with the environment, such as `HML`), **User**, **State**, **Expires on** and **Detail**.
3. Credentials based on a token or an external login (OIDC, cloud) keep no date in the file and show as **no date**, with the kind in **Detail**.

## Good to know

- The screen only reads. Nothing changes in the cluster or in the repository files.
- The certificate is read through the HTTPS connection itself, as a browser would. No Secret (the object that stores the certificate and its key) is read.
- The **Kubeconfigs** tab talks to no cluster: it reads only the date inside the file. The credential itself is never shown.
- The table of removed formats follows the official Kubernetes migration guide and covers removals from 1.16 to 1.32.
- The repository check covers `.yaml` and `.yml` files up to 2 MB, up to 2,000 files. Folders such as `node_modules`, `.git`, `target`, `dist`, `build` and `vendor` are skipped. A Helm template is checked only if its `apiVersion:` line is written out literally, with no variable.

## Common problems

- **You see "No cluster connected".** Click **Connect on the Cluster screen** and pick the kubeconfig. You can still check a repository's manifests without a cluster.
- **You see "use the format 1.30".** The target version takes only the major and minor numbers, like `1.30`, without the `v` and without a third number.
- **The footer says RBAC does not allow reading the apiserver metrics.** Your user lacks permission (RBAC, the cluster's access rules) to see recent calls. Only the annotation was checked, so the result is partial.
- **The footer says "No permission to list…".** The kinds listed were left out. Type a namespace you have access to in the **namespace (empty = all)** field and check again.
- **An address shows as unreachable.** Internal network addresses only answer with the VPN on. Connect to the VPN and click **Check again**.
