# Runbooks

Turns a procedure written in Markdown into a script you run by clicking: each `kubectl` command in the text becomes a step with a button, and the panel runs it on the connected cluster with the same safety guards as Cluster Doctor.

## When to use

- A pod keeps restarting and you want to follow the team's diagnosis procedure step by step, without copying commands into a terminal.
- You need to restart an application in staging and want to check the exact command before running it.
- The team has written procedures and wants anyone to follow them safely, including people who do not know `kubectl`.

## Before you start

- Connect to a cluster on the [Cluster](/cluster) screen. The steps always run on the cluster and context chosen there. See how in [Cluster](/documentacao/cluster).
- Know the cluster's environment: DES (development), ITG (integration), HML (staging) or PRO (production). It decides what may run. The environment comes from the kubeconfig's name or is set by hand on the Cluster screen.
- Terms such as cluster, namespace, pod and kubeconfig are in [Concepts and terms](/documentacao/conceitos).

**kubectl** is the command-line tool that talks to the cluster: `kubectl get pods` lists the pods, `kubectl logs` shows an application's log, and so on. A **runbook** is a written procedure for handling a known situation.

## Getting to know the screen

The screen has two columns:

| Part | What it shows |
|---|---|
| List on the left | The runbooks in the chosen folder, each with its title (the file's first `#` line) and file path. At the top, **Project runbooks** with the **project** badge when it is the folder that ships with the panel, or the path of your own folder, and the **Change** button. |
| Area on the right | The open runbook: the explanatory text and, in the middle of it, the runnable steps. |

The top of the right-hand area shows **Runs on** with the context name and a badge with the environment. If the kubeconfig has no environment set, the badge says **unclassified (counts as PRO)**.

If the runbook uses variables, a card right below has one field for each, such as `namespace` or `app`.

Each step shows the command like a terminal line, and on the right:

| Badge | What it means | Button |
|---|---|---|
| **read** | The command only queries the cluster. | **Run**: runs right away. |
| **write** | The command changes something in the cluster (restart, scale, delete). | **Execute**: asks for confirmation first. |
| **blocked** | The command cannot run here. The reason shows below the step. | None. |

Every step also has an icon to copy the command.

## Step by step: follow a runbook

1. In the list on the left, click the runbook, for example **Pod em CrashLoopBackOff** (the runbooks that ship with the panel are written in Portuguese).
2. Fill in the variables in the card at the top, for example `namespace` = `orders-hml` and `deployment` = `orders-api`. The step commands update with the values.
3. Read the text of the first step and click **Run**. The command's output shows right below, in green if it worked and in red if it failed.
4. Follow the runbook's text and run the next read steps the same way.
5. On a **write** step, click **Execute**. The **Run write step** window opens with the cluster, the environment and the full command.
6. Check the command carefully. If it is right, click **Execute**; if not, click **Cancel**.
7. The output shows below the step, as with read steps.

> **Warning:** a write step really changes the cluster. Check the namespace and the application name in the confirmation window before running it.

### Use your own runbooks folder

1. Click **Change** at the top of the list.
2. In the **Runbooks folder** window, type the folder path, for example `~/runbooks`, or click **Choose…** to open the folder picker.
3. Click **Use folder**. The list now shows the `.md` files in that folder and its subfolders.
4. To go back to the runbooks that ship with the panel, click **Change** and then **Back to the project runbooks**.

### Write a runbook

A runbook is a regular `.md` file. The first `#` line becomes the title in the list. Each line inside a code block marked `bash` (or `sh`, `shell`, `console`) becomes a step; the rest of the text shows as explanation. Use `{{name}}` for a value that changes on each use:

````markdown
# Restart an application

Check the pods first:

```bash
kubectl get pods -n {{namespace}}
```

If they are stuck, restart:

```bash
kubectl rollout restart deployment/{{app}} -n {{namespace}}
```
````

- Empty lines and lines starting with `#` inside the block are ignored. A leading `$ ` is removed.
- Blocks in another language (for example, `yaml`) show only as text, with no button.
- Each line is a single command. To filter the output, use kubectl's own options (`-l`, `--tail`, `-o jsonpath='...'` in single quotes) instead of `|` or `grep`.

## Good to know

- Only `kubectl` runs, one call per line, with no shell: `|`, `;`, `&&`, `>` and `$( )` block the step.
- A step cannot switch clusters: options such as `--context`, `--kubeconfig`, `--server`, `--token` and `--as` block the step.
- Reading a Secret (the object that stores passwords and keys) is always blocked, as are `exec`, `cp`, `port-forward`, `create` and `run`.
- Reads include `get`, `describe`, `logs`, `top`, `events`, `explain`, `rollout status`, `rollout history` and `auth can-i`. Writes are `rollout restart`, `scale`, `patch`, `label`, `annotate`, `set`, `apply` and `delete`. `apply` and `patch` with a file (`-f`) are refused, because the change must be visible on the line itself.
- Rules per environment: PRO never writes (read only), a kubeconfig with no environment counts as PRO, DES never deletes, and node `cordon`, `drain` and `taint` never run in any environment.
- A variable's value accepts only letters, numbers, dot, hyphen, underscore, slash and `=`. This keeps a typed value from turning into another command.
- Even after you confirm, the server reads the command from the file again and rechecks the rules before running it.
- Each command has up to 60 seconds to finish.
- Every run, read or write, is logged in `~/.workstuff/runbook-audit.log`, with the file, the step, the command, the cluster, the environment and the result. Each line carries the fingerprint of the one before it: if someone deletes or edits a line, the **Audit trails** item on the [Machine](/maquina) screen warns you.

## Common problems

- **You see "No cluster connected" and the buttons are disabled.** Click **Cluster screen** in the notice and pick a kubeconfig.
- **The step shows as blocked with "fill in the variable…".** That variable is still empty in the card at the top.
- **The step says "invalid value for…".** The value has a space or a character that is not accepted. Use only letters, numbers, dot, hyphen, underscore, slash and `=`.
- **A write step shows as blocked with "PRO is read-only".** The connected cluster is production, or has no environment set. On PRO, only read steps run through the panel.
- **You see "step not found; the file may have changed, reload".** The runbook file was edited after you opened the screen. Reload the page.
- **The list shows "No .md in this folder."** The chosen folder has no `.md` files. Click **Change** and pick another one.
