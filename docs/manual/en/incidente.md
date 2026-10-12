# Timeline

Puts everything that happened in a namespace during a period into one list, in time order: cluster warnings, restarts, new version releases and error lines from the logs. Use it to rebuild an incident and, at the end, ask the AI for a post-mortem draft.

## When to use

- The application was down between 2:00 and 2:20 pm and you need to understand what happened first.
- You suspect a new version caused the problem and want to see whether the errors started right after the release.
- You need to write the incident report (the post-mortem) and want a first draft built from the facts.

## Words you will see on this screen

| Term | What it is |
|---|---|
| **Namespace** | A division of the cluster, like a folder, that groups applications (for example, `orders-hml`). |
| **Event** | A notice Kubernetes records, such as "could not pull the image" or "the health check failed". |
| **Restart** | When a pod's container dies and starts again. The reason `OOMKilled` means it went over its memory limit. |
| **Rollout** | The release of a new version of an application (a Deployment), which replaces the old pods with new ones. |
| **Post-mortem** | The report written after an incident: what happened, the impact, the cause and what to do so it does not happen again. |

More terms in [Concepts and terms](/documentacao/conceitos).

## Before you start

- A cluster connected on the [Cluster](/cluster) screen. See how in [Cluster](/documentacao/cluster). This screen uses the same cluster and context, shown as **Cluster** at the top of the form.
- For the post-mortem draft, an AI provider set in [Settings](/configuracoes).

## Getting to know the screen

- **Form**: the `namespace` field (remembered in this browser), the time window (**last 1 h** up to **last 24 h**), the **optional focus** field and the **Build timeline** button.
- **Severity filter**: **Critical only**, **Warnings and critical** (the default) and **All**, plus the **Filter** box to search for a text.
- **Blue notices**: say what could not be collected, for example a log that could not be read.
- **List**: each entry has the time, the source, the severity, the object (such as `Pod/api-7d9f-x2klm`), a title and the detail.

The sources are:

| Source | Where it comes from | Severity |
|---|---|---|
| **event** | The namespace's events. Routine events (scheduled, image pulled, started) are left out. | **critical** for failures such as BackOff, OOM, Failed, Unhealthy, Evicted and Kill; **warning** for other warnings; info for the rest. |
| **restart** | The last termination of each container that restarted within the window, with the reason and the exit code. | **critical** if it was `OOMKilled` or exited with an error; **warning** otherwise. |
| **rollout** | Each new version of a Deployment released within the window, with the revision and the image that came in. | info |
| **log** | The last error lines (ERROR, FATAL, Exception and the like) from the log before the restart, for the pods that restarted. | **critical** |

## Step by step: build the timeline

1. Type the namespace, for example `orders-hml`.
2. Pick the time window. It counts back from now: **last 3 h** covers the last three hours.
3. Optional: in **optional focus**, type part of the name of what went down, such as `orders-api`. Only entries for objects with that text in their name are kept.
4. Click **Build timeline**. The button shows **Building…** while the panel reads the cluster.
5. Read the list from top to bottom: the oldest entry comes first.
6. Switch to **All** when you also want to see version releases and ordinary events, or to **Critical only** to go straight to what broke.

> **Tip:** a common pattern is a **rollout** followed, minutes later, by a **restart** with `OOMKilled` and **log** error lines. That points to the new version.

### Draft the post-mortem

1. With the timeline built, click **Draft post-mortem** at the top of the screen.
2. The **Post-mortem draft** window opens. The panel builds the timeline again, with the same namespace, window and focus as the one on screen, and sends it to the AI.
3. The text arrives bit by bit, in Portuguese (see below), with the sections Resumo (summary), Linha do tempo (timeline), Impacto (impact), Causa provável (probable cause), Ações (actions) and O que falta saber (what is still unknown).
4. Use **Stop** to interrupt it, **Copy** to take the text and **Run again** to ask for another version.
5. Review it before using it: check every claim against the list.

## Good to know

- The screen only reads: nothing changes on the cluster, and the AI runs no commands.
- The cluster keeps events only briefly, usually for an hour. With a longer window, the older events are already gone; the screen tells you when that happens. Restarts, version releases and logs still show up.
- The error log comes from the container that died before the last restart, and from at most six pods. If more pods restarted, a notice says how many were left out.
- The AI writes only from what is on the timeline and says what is a hypothesis. It gets every severity, not just the ones in the screen's filter, up to 300 entries (the most severe and most recent, if there are more).
- The draft is always written in Portuguese, whatever language the panel is set to.
- The focus is case-sensitive: type the text as it appears in the name.

## Common problems

- **"No cluster connected" appears.** Click **Connect on the Cluster screen** and pick a kubeconfig.
- **The list is empty, or "Nothing in this filter" appears.** Switch the filter to **All**, widen the window or clear the focus.
- **There is no event from the time of the incident.** The cluster has already dropped those events. Restarts and version releases are still in the list; next time, build the timeline right after the incident.
- **A blue notice says a pod's previous log could not be read.** The pod may have been recreated and lost its old log. The post-mortem receives that notice and knows the data is missing.
- **The Draft post-mortem button does not show up.** It only appears when the timeline has at least one entry.
